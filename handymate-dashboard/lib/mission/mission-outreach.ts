/**
 * Missions-medveten utskickskö — Etapp J (Goal-to-Plan V2,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Hannas befintliga dagliga cron (lib/agents/hanna-outbound.ts) fyller redan
 * på en utskickskö av GATADE proaktiva kontaktförslag. Etapp J gör den
 * medveten om ett aktivt kontaktuppdrag (goal_type 'contact') utan att röra
 * NÅGON av de befintliga skyddsnivåerna:
 *
 *   - Godkännandegrinden är ORÖRD — varje mission-kort är exakt samma
 *     'proactive_care'-pending_approval som hantverkaren redan godkänner.
 *   - DRIP-taket (DRIP_PER_DAY) är ORÖRT — mission-kandidater tas FÖRST,
 *     men det totala antalet kort per körning ändras aldrig.
 *   - Dedup- och frekvensvakterna (lib/outbound/frequency-guard.ts,
 *     hanna-outbound.ts:s egna DEDUP_DAYS-fönster) körs OFÖRÄNDRAT även för
 *     mission-kandidater.
 *
 * Mission-medvetenheten ändrar bara VILKA kandidater som prioriteras
 * (segmentet i uppdragets återaktiveringssteg, om något) och HUR korten
 * stämplas (payload.mission_id + payload.truth_class) — aldrig HUR MÅNGA
 * som får skickas eller OM ett mänskligt godkännande krävs.
 *
 * Ren kärna (beraknaOutreachBudget, filtreraMissionKandidater,
 * stepJobTypesForMission — facit i tests/mission-outreach.spec.ts) + tunn
 * I/O (loadMissionContactState) som ÅTERANVÄNDER
 * lib/mission/contact-outcomes.ts:s deriveContactOutcomes i stället för att
 * uppfinna en egen kontakträkning.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuietCustomerRow } from '@/lib/customers/quiet-customer'
import { deriveContactOutcomes, type ContactApprovalInput } from './contact-outcomes'

// ─────────────────────────────────────────────────────────────────────────
// Ren kärna
// ─────────────────────────────────────────────────────────────────────────

export interface MissionOutreachBudget {
  goal_count: number
  contacted_distinct: number
  open_mission_cards: number
  /** max(0, goal_count − contacted_distinct − open_mission_cards). Aldrig negativ. */
  remaining: number
}

/**
 * Hur mycket utrymme finns kvar mot uppdragets kontaktmål? Räknar bort både
 * FAKTISKT kontaktade (exekverade utskick) och ÖPPNA mission-kort som redan
 * väntar på ett godkännande — ett kort som ligger och väntar ska inte räknas
 * dubbelt genom att kunden också får ett nytt förslag samma körning.
 */
export function beraknaOutreachBudget(input: {
  goal_count: number
  contacted_distinct: number
  open_mission_cards: number
}): MissionOutreachBudget {
  const goalCount = Math.max(0, Math.round(Number(input.goal_count) || 0))
  const contacted = Math.max(0, Math.round(Number(input.contacted_distinct) || 0))
  const open = Math.max(0, Math.round(Number(input.open_mission_cards) || 0))
  return {
    goal_count: goalCount,
    contacted_distinct: contacted,
    open_mission_cards: open,
    remaining: Math.max(0, goalCount - contacted - open),
  }
}

/**
 * Väljer ut vilka tysta kunder som får bli mission-kandidater DENNA
 * körning. Reglerna (facit i tests/mission-outreach.spec.ts):
 *
 *   1. En kund som redan är kontaktad (mission-attribuerat, exekverat) ELLER
 *      har ett öppet mission-kort riktas ALDRIG mot igen.
 *   2. Bär uppdragets plansteg ett eller flera job_type-segment
 *      (stepJobTypes) filtreras kandidaterna mot just det segmentet — en
 *      kund utan känd/matchande senaste tjänst kvalificerar inte.
 *   3. Bär planen INGA segment (stepJobTypes.length === 0) kvalificerar
 *      VILKEN tyst kund som helst — segment-agnostisk default.
 *   4. Taket (max) respekteras alltid, kandidaternas inbördes ordning
 *      (mest inaktiva först, se fetchQuietCustomers) bevaras.
 *
 * Ren funktion: ingen I/O, inget mutation av input-listorna.
 */
export function filtreraMissionKandidater(input: {
  candidates: QuietCustomerRow[]
  stepJobTypes: string[]
  latestJobTypeByCustomer: Map<string, string | null>
  alreadyTargetedCustomerIds: Set<string>
  max: number
}): QuietCustomerRow[] {
  const { candidates, stepJobTypes, latestJobTypeByCustomer, alreadyTargetedCustomerIds, max } = input
  if (!(max > 0)) return []

  const segmentRestricted = stepJobTypes.length > 0
  const segments = new Set(stepJobTypes)

  const result: QuietCustomerRow[] = []
  for (const candidate of candidates) {
    if (result.length >= max) break
    const customerId = String(candidate.customer_id)
    if (alreadyTargetedCustomerIds.has(customerId)) continue
    if (segmentRestricted) {
      const jobType = latestJobTypeByCustomer.get(customerId) ?? null
      if (!jobType || !segments.has(jobType)) continue
    }
    result.push(candidate)
  }
  return result
}

/**
 * Job type-segmenten en missions frysta plan pekar på — läses ur
 * återaktiveringsstegens bevis (opportunity-portfolio.ts stämplar
 * `evidence: { table: 'customer_group', ref_id: job_type }` för dessa
 * items, se lib/mission/opportunity-portfolio.ts:s ateraktivering-gren).
 * Ett uppdrag utan sådana steg (t.ex. rent penga-/kapacitetsuppdrag som
 * ändå råkar bli kontaktmål, eller en plan utan återaktiveringssteg) ger
 * en tom lista — segment-agnostisk default, se filtreraMissionKandidater.
 */
export function stepJobTypesForMission(
  steps: Array<{ evidence?: { table?: string; ref_id?: string } | null } | null | undefined> | null | undefined,
): string[] {
  if (!Array.isArray(steps)) return []
  const set = new Set<string>()
  for (const step of steps) {
    const evidence = step?.evidence
    if (evidence && evidence.table === 'customer_group' && typeof evidence.ref_id === 'string' && evidence.ref_id) {
      set.add(evidence.ref_id)
    }
  }
  return Array.from(set)
}

// ─────────────────────────────────────────────────────────────────────────
// Tunn I/O
// ─────────────────────────────────────────────────────────────────────────

export interface MissionContactState {
  /** Distinkta kunder med minst en FAKTISKT exekverad mission-attribuerad
      kontakt (deriveContactOutcomes-reglerna — se lib/mission/
      contact-outcomes.ts). */
  contactedDistinct: number
  contactedCustomerIds: Set<string>
  /** Distinkta kunder med ett ÖPPET (status 'pending') mission-stämplat kort. */
  openCardCustomerIds: Set<string>
}

/**
 * Läser exakt de mission-stämplade pending_approvals-raderna
 * (payload.mission_id, samma .contains-konvention som
 * lib/mission/mission-progress.ts) och räknar fram kontakt-state genom att
 * ÅTERANVÄNDA deriveContactOutcomes — ingen egen kontakträkning. Fail-soft:
 * ett läsfel (t.ex. tabellen saknas) degraderar till "inget kontaktat, inga
 * öppna kort" — ETT MISSLYCKAT LÄS FÅR ALDRIG BLOCKERA HELA CRONEN, se
 * hanna-outbound.ts:s eget fail-soft-mönster för mission-inläsningen.
 */
export async function loadMissionContactState(
  supabase: SupabaseClient,
  businessId: string,
  missionId: string,
  nowMs: number,
): Promise<MissionContactState> {
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('status, payload, resolved_at')
      .eq('business_id', businessId)
      .contains('payload', { mission_id: missionId })
      .limit(1000)
    if (error) throw new Error(error.message)

    const rows = Array.isArray(data) ? data as Array<{ status: string; payload: unknown; resolved_at: string | null }> : []

    const approvals: ContactApprovalInput[] = rows.map(row => {
      const payload = (row.payload ?? {}) as Record<string, unknown>
      const execution = payload.execution_result
      const outcome = execution && typeof execution === 'object'
        ? ((execution as Record<string, unknown>).outcome as string | undefined) ?? null
        : null
      const customerId = typeof payload.customer_id === 'string' ? payload.customer_id : null
      return { customer_id: customerId, resolved_at: row.resolved_at ?? null, outcome }
    })

    const outcomes = deriveContactOutcomes(approvals, [], 7, nowMs)
    const contactedCustomerIds = new Set(outcomes.map(o => o.customer_id))

    const openCardCustomerIds = new Set<string>()
    for (const row of rows) {
      if (row.status !== 'pending') continue
      const payload = (row.payload ?? {}) as Record<string, unknown>
      const customerId = typeof payload.customer_id === 'string' ? payload.customer_id : null
      if (customerId) openCardCustomerIds.add(customerId)
    }

    return { contactedDistinct: contactedCustomerIds.size, contactedCustomerIds, openCardCustomerIds }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-outreach] mission-kontaktstate kunde inte läsas (0 kontaktade/öppna antas):', msg)
    return { contactedDistinct: 0, contactedCustomerIds: new Set(), openCardCustomerIds: new Set() }
  }
}
