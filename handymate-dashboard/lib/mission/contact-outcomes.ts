/**
 * Kontaktutfall — Etapp I (kontaktmål, Goal-to-Plan V2,
 * tasks/jaunty-pondering-hummingbird.md, sql/v146_mission_contact_goal.sql).
 *
 * ═══ RÄKNADE FAKTA, INTE ÖVERTALNINGSSPRÅK ═══
 *
 * "kontaktade" = distinkta kunder nådda av uppdragsstämplat utskick
 * (payload.mission_id) som FAKTISKT EXEKVERADE (execution_result.
 * outcome==='success', lib/approvals/execution-outcome.ts) och bär en
 * kundreferens (payload.customer_id). Två SMS till samma kund räknas som
 * EN kontaktad — dedup per kund, den TIDIGASTE exekveringen (approval-
 * radens resolved_at, satt ATOMISKT när statusen flippar till approved,
 * se filhuvudet i lib/approvals/execution-outcome.ts) räknas som
 * kontakttillfället och startar svarsfönstret.
 *
 * "svar inom 7 dagar" = minst EN inkommande kommunikation (kanalagnostiskt
 * — SMS, mejl, portal, samtal, se lib/compliance/communication-trail.ts,
 * den redan fail-soft-testade, beprövade källan kundtidslinjen/export-
 * underlaget använder) från just den kunden inom fönstret
 * [kontakttillfället, kontakttillfället + windowDays dygn], BÅDA gränserna
 * inklusive. Räknad fakta — texten "svar inom 7 dagar" används överallt,
 * ALDRIG "svarsfrekvens"/"konvertering".
 *
 * Ren kärna (deriveContactOutcomes, facit i tests/contact-outcomes.spec.ts)
 * + fail-soft I/O (loadContactOutcomes): ett trasigt kommunikationsspår för
 * EN kund degraderar den kundens replied_within_window till false, aldrig
 * ett kastat fel för hela uppdraget.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCommunicationTrail } from '@/lib/compliance/communication-trail'

const DAY_MS = 86_400_000

export interface ContactApprovalInput {
  customer_id: string | null
  /** approval.resolved_at — se filhuvudet för varför det är den bästa
      tillgängliga proxyn för "när utskicket exekverade". */
  resolved_at: string | null
  /** execution_result.outcome (lib/approvals/execution-outcome.ts). Bara
      'success' räknas som en genomförd kontakt. */
  outcome: string | null
}

export interface InboundCommunicationInput {
  customer_id: string
  timestamp: string
}

export interface ContactOutcome {
  customer_id: string
  executed_at: string
  replied_within_window: boolean
}

/**
 * Ren kärna. Dedup per kund: den TIDIGASTE lyckade exekveringen räknas som
 * kontakttillfället (ett senare uppföljnings-SMS flyttar aldrig fönstrets
 * start). nowMs kapar bort orimliga framtida inbound-tidsstämplar
 * (datadefensivt) — det förkortar ALDRIG det faktiska windowDays-fönstret.
 */
export function deriveContactOutcomes(
  approvals: ContactApprovalInput[],
  inboundRows: InboundCommunicationInput[],
  windowDays: number = 7,
  nowMs: number,
): ContactOutcome[] {
  const earliestByCustomer = new Map<string, number>()
  for (const a of approvals) {
    if (a.outcome !== 'success') continue // ingen exekvering → ingen kontakt
    if (!a.customer_id) continue
    if (!a.resolved_at) continue
    const ts = Date.parse(a.resolved_at)
    if (!Number.isFinite(ts)) continue
    const existing = earliestByCustomer.get(a.customer_id)
    if (existing === undefined || ts < existing) earliestByCustomer.set(a.customer_id, ts)
  }

  const inboundByCustomer = new Map<string, number[]>()
  for (const row of inboundRows) {
    const ts = Date.parse(row.timestamp)
    if (!Number.isFinite(ts)) continue
    if (ts > nowMs) continue // kan inte ha hänt än — datadefensivt
    const list = inboundByCustomer.get(row.customer_id) ?? []
    list.push(ts)
    inboundByCustomer.set(row.customer_id, list)
  }

  const outcomes: ContactOutcome[] = []
  for (const [customerId, executedMs] of Array.from(earliestByCustomer.entries())) {
    const windowEnd = executedMs + windowDays * DAY_MS
    const inbound = inboundByCustomer.get(customerId) ?? []
    const replied = inbound.some(ts => ts >= executedMs && ts <= windowEnd)
    outcomes.push({
      customer_id: customerId,
      executed_at: new Date(executedMs).toISOString(),
      replied_within_window: replied,
    })
  }
  return outcomes
}

/**
 * Fail-soft I/O: hämtar kommunikationsspåret (samma återanvända, redan
 * testade lib/compliance/communication-trail.ts som kundtidslinjen/export-
 * underlaget) för varje kontaktad kund, inom just den kundens
 * [kontakttillfälle, kontakttillfälle + windowDays]-fönster, och kör sedan
 * den rena kärnan en andra gång med det faktiska inbound-underlaget. Ett
 * fel för EN kund loggas och hoppas över — den kundens
 * replied_within_window stannar false i stället för att fälla hela
 * uppdragets progress-läsning.
 */
export async function loadContactOutcomes(
  supabase: SupabaseClient,
  businessId: string,
  approvals: ContactApprovalInput[],
  windowDays: number = 7,
  nowMs: number = Date.now(),
): Promise<ContactOutcome[]> {
  // Steg 1: vilka kunder kontaktades, och när (tidigaste lyckade exekvering)?
  const contacted = deriveContactOutcomes(approvals, [], windowDays, nowMs)
  if (contacted.length === 0) return []

  // Steg 2: läs kommunikationsspåret per kund inom just den kundens fönster.
  const inboundRows: InboundCommunicationInput[] = []
  for (const outcome of contacted) {
    try {
      const executedMs = Date.parse(outcome.executed_at)
      const toIso = new Date(executedMs + windowDays * DAY_MS).toISOString()
      const trail = await getCommunicationTrail(supabase, businessId, outcome.customer_id, {
        fromIso: outcome.executed_at,
        toIso,
      })
      if (!trail) continue
      for (const entry of trail.entries) {
        if (entry.direction === 'in') {
          inboundRows.push({ customer_id: outcome.customer_id, timestamp: entry.timestamp })
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[contact-outcomes] kommunikationsspår kunde inte läsas för en kund (inget svar räknat):', msg)
    }
  }

  return deriveContactOutcomes(approvals, inboundRows, windowDays, nowMs)
}
