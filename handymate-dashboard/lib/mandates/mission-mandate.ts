/**
 * Mission Mandates V1 — avgränsad delegation (Etapp V,
 * tasks/jaunty-pondering-hummingbird.md, sql/v150_mission_mandate.sql).
 *
 * Andreas rådsbeslut 2026-08-18: ägaren kan godkänna ETT uppdrags
 * genomförande inom exakta gränser istället för varje kort — men BEGRÄNSAT
 * till de fyra förtjänta-autonomi-typerna (lib/autonomy/earned-autonomy.ts),
 * med inbyggd per-typ-utfallsmätning (lib/mandates/mandate-facit.ts) så
 * mandaten själva genererar det säkerhetsbevis rådets autonomigrind kräver.
 *
 * ═══ FAIL-CLOSED PÅ ALLT ═══
 *
 * `mandateCovers` är den enda platsen som avgör om ett mandat täcker en
 * given handling. Minsta avvikelse — fel typ, mål utanför de namngivna
 * listorna, dag-/totaltak nått, belopp över taket ELLER okänt när ett tak
 * gäller, utgånget, pausat, återkallat — faller tillbaka till ORSAK, aldrig
 * till "täckt". Anroparen (Etapp W) tar då exakt dagens väg: vanligt
 * godkännandekort. Det är samma princip som underAutonomyCap i
 * lib/autonomy/earned-autonomy.ts: hellre en onödig fråga än ett autonomt
 * utskick av okänd storlek.
 *
 * ═══ FÖRBJUDEN INTEGRATIONSPUNKT ═══
 *
 * Den här modulen anropar ALDRIG tool-routerns förbjudna exekverings-spegel
 * (app/api/agent/trigger/tool-router.ts) — den skriver auto_approved
 * oavsett utfall och kringgår den härdade exekveringsvägen. Mandatkontrollen
 * hör hemma BREDVID isAutonomous() i callers (Etapp W), inte via den
 * spegeln. Källskanningslåst (exakt vilket funktionsnamn som är förbjudet
 * listas medvetet bara i testfilen, se tests/mission-mandate.spec.ts —
 * annars fastnar den här kommentaren i sin egen fälla).
 *
 * ═══ INGEN SKAPANDE HÄR ═══
 *
 * Mandat SKAPAS av ägaren via en UI-handling (Etapp X,
 * POST /api/mission/[id]/mandate) — aldrig av ett chattverktyg, aldrig av
 * den här modulen. Den här filen läser och pausar, den infogar aldrig en
 * rad i mission_mandate. Källskanningslåst.
 *
 * ═══ INGA RÄKNARE LAGRAS ═══
 *
 * Dag-/totalanvändning härleds ur mandat-stämplade kort
 * (payload.mandate_id), Value Ledger-mönstret (lib/mission/mission-
 * progress.ts). `deriveMandateUsage` är den rena härledningen.
 *
 * ═══ FAIL-SOFT PÅ SCHEMA-SAKNAS ═══
 *
 * sql/v150 är INTE körd i alla miljöer. All I/O här degraderar tyst
 * (null/[]/no-op) om mission_mandate-tabellen saknas (42P01/42703) — samma
 * arSchemaSaknas-konvention som lib/playbook/checkpoint-outcomes.ts och
 * lib/invoices/evidence-manifest.ts.
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AUTONOMY_META,
  DEFAULT_AUTONOMY_CAPS,
  type AutonomyKey,
} from '@/lib/autonomy/earned-autonomy'
import type { ValidatedMissionStep } from '@/lib/mission/plan-validation'
import { svDateStr } from '@/lib/dates'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

// ─────────────────────────────────────────────────────────────────
// ALLOWLIST-speglingen — den ENDA utbyggnadspunkten (se filhuvudets
// "Vägen till fullständighet" i planen). MandateActionType ÄR AutonomyKey,
// ingen egen parallell union — så indexering mot DEFAULT_AUTONOMY_CAPS/
// autonomyKeyFromApproval/isAllowlistedKey kräver aldrig en cast.
// ─────────────────────────────────────────────────────────────────

export const MANDATE_ALLOWED_TYPES = [
  'invoice_reminder', 'booking_reminder', 'quote_followup_sms', 'review_request',
] as const

export type MandateActionType = AutonomyKey

// Kompilatorbevis: om MANDATE_ALLOWED_TYPES och AutonomyKey någonsin driver
// isär (ny typ läggs till i den ena men inte den andra) slutar filen
// kompilera — INNAN någon körning når skillnaden. Facit-testet i
// tests/mission-mandate.spec.ts lägger en runtime-låsning ovanpå detta.
type _MandateTypesSubsetOfAllowlist = (typeof MANDATE_ALLOWED_TYPES)[number] extends AutonomyKey ? true : never
type _AllowlistSubsetOfMandateTypes = AutonomyKey extends (typeof MANDATE_ALLOWED_TYPES)[number] ? true : never
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mandateAllowlistLock: [_MandateTypesSubsetOfAllowlist, _AllowlistSubsetOfMandateTypes] = [true, true]

function isMandateActionType(v: unknown): v is MandateActionType {
  return typeof v === 'string' && (MANDATE_ALLOWED_TYPES as readonly string[]).includes(v)
}

/** Exporterad för facit-testet: körtids-mängdlikhet mot AUTONOMY_META (vars
    nycklar TypeScript redan tvingar att exakt vara AutonomyKey-domänen). */
export function mandateAllowlistMatchesAutonomyAllowlist(): boolean {
  const a = [...MANDATE_ALLOWED_TYPES].sort()
  const b = Object.keys(AUTONOMY_META).sort()
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// ─────────────────────────────────────────────────────────────────
// Målens namngivna listor. Tre av de fyra typerna har en direkt motsvarande
// entitet (faktura/offert/bokning); review_request-kort skapas mot ett
// AVSLUTAT PROJEKT (se app/api/cron/review-requests/route.ts — customer_id
// löses ur project_id), därför project_ids för den typen. Detta är den
// här modulens EGNA designval för TS-lagret ovanpå den generiska JSONB-
// kolumnen i sql/v150 — Etapp X:s skapande-UI och Etapp W:s callers ska
// följa exakt denna mappning.
// ─────────────────────────────────────────────────────────────────

export interface MandateTargets {
  invoice_ids?: string[]
  quote_ids?: string[]
  booking_ids?: string[]
  project_ids?: string[]
}

const TARGET_LIST_KEY: Record<MandateActionType, keyof MandateTargets> = {
  invoice_reminder: 'invoice_ids',
  quote_followup_sms: 'quote_ids',
  booking_reminder: 'booking_ids',
  review_request: 'project_ids',
}

// ─────────────────────────────────────────────────────────────────
// Rad-typen — mirrorar sql/v150_mission_mandate.sql kolumn för kolumn.
// ─────────────────────────────────────────────────────────────────

export type MandateStatus = 'active' | 'paused' | 'revoked' | 'expired' | 'completed'

export interface MandateRow {
  id: string
  business_id: string
  mission_id: string
  plan_hash: string
  allowed_action_types: MandateActionType[]
  targets: MandateTargets
  daily_cap: number
  total_cap: number
  amount_cap_kr: number | null
  /** DATE-kolumn — 'YYYY-MM-DD' (kan komma som fullt ISO-datum från vissa
      klienter; all jämförelse här sker via .slice(0, 10)). */
  expires_at: string
  status: MandateStatus
  pause_reason: string | null
  created_by: string | null
  created_at: string
  revoked_at: string | null
  paused_at: string | null
}

// ─────────────────────────────────────────────────────────────────
// computePlanHash — fingerprint-prejudikatet (computeManifestFingerprint,
// lib/invoices/evidence-manifest.ts). ALDRIG prosa: bara item_id/
// truth_class/measure/evidence, sorterat på item_id så stegens ORDNING
// aldrig påverkar hashen.
// ─────────────────────────────────────────────────────────────────

export function computePlanHash(steps: ValidatedMissionStep[]): string {
  const stable = [...steps]
    .map(s => ({
      item_id: s.item_id,
      truth_class: s.truth_class,
      measure: s.measure,
      evidence: s.evidence,
    }))
    .sort((a, b) => a.item_id.localeCompare(b.item_id))
  const hash = createHash('sha256')
  hash.update(JSON.stringify(stable))
  return `mndh_v1_${hash.digest('hex')}`
}

export function verifyPlanUnchanged(mandate: Pick<MandateRow, 'plan_hash'>, missionSteps: ValidatedMissionStep[]): boolean {
  return computePlanHash(missionSteps) === mandate.plan_hash
}

// ─────────────────────────────────────────────────────────────────
// mandateCovers — den enda platsen som avgör täckning. Ren funktion.
// ─────────────────────────────────────────────────────────────────

export type MandateMissReason =
  | 'ingen_mandat'
  | 'fel_typ'
  | 'mal_utanfor'
  | 'dagstak'
  | 'totaltak'
  | 'belopp_over_tak'
  | 'belopp_okant'
  | 'utganget'
  | 'pausat'
  | 'aterkallat'
  | 'plan_andrad'

/** Enda avvikelseorsaken som INTE kan uppstå inne i mandateCovers — den
    kräver ju redan ett mandate-objekt. Anropare (Etapp W) använder denna
    när loadActiveMandateForMission inte hittade något mandat alls. */
export const NO_MANDATE_REASON: MandateMissReason = 'ingen_mandat'

export type MandateCoverageResult =
  | { covered: true }
  | { covered: false; reason: MandateMissReason }

export interface MandateCoverageRequest {
  actionKey: string
  targetRef: string
  amountKr: number | null
  /** ISO-tidsstämpel eller datum — jämförs datum-mot-datum mot expires_at. */
  nowIso: string
  dailyUsed: number
  totalUsed: number
}

function resolveApplicableCap(mandate: MandateRow, actionKey: MandateActionType): number | null {
  if (typeof mandate.amount_cap_kr === 'number') return mandate.amount_cap_kr
  return DEFAULT_AUTONOMY_CAPS[actionKey] ?? null
}

export function mandateCovers(mandate: MandateRow, req: MandateCoverageRequest): MandateCoverageResult {
  // Status-grenarna FÖRST — ett pausat/återkallat/utgånget mandat täcker
  // ingenting, oavsett vad övriga fält råkar säga.
  if (mandate.status === 'paused') {
    return { covered: false, reason: mandate.pause_reason === 'plan_changed' ? 'plan_andrad' : 'pausat' }
  }
  if (mandate.status === 'revoked') return { covered: false, reason: 'aterkallat' }
  if (mandate.status === 'expired' || mandate.status === 'completed') return { covered: false, reason: 'utganget' }

  const nowDate = (req.nowIso || '').slice(0, 10)
  const expiresDate = (mandate.expires_at || '').slice(0, 10)
  if (expiresDate && nowDate > expiresDate) return { covered: false, reason: 'utganget' }

  if (!isMandateActionType(req.actionKey)) return { covered: false, reason: 'fel_typ' }
  if (!mandate.allowed_action_types.includes(req.actionKey)) return { covered: false, reason: 'fel_typ' }

  const listKey = TARGET_LIST_KEY[req.actionKey]
  const targetList = mandate.targets?.[listKey] ?? []
  if (!targetList.includes(req.targetRef)) return { covered: false, reason: 'mal_utanfor' }

  if (req.dailyUsed >= mandate.daily_cap) return { covered: false, reason: 'dagstak' }
  if (req.totalUsed >= mandate.total_cap) return { covered: false, reason: 'totaltak' }

  const cap = resolveApplicableCap(mandate, req.actionKey)
  if (cap !== null) {
    // Fail-closed, samma semantik som underAutonomyCap: ett tak gäller men
    // beloppet är okänt ⇒ täcker INTE (hellre en onödig fråga än ett
    // autonomt utskick av okänd storlek).
    if (req.amountKr === null || req.amountKr === undefined) {
      return { covered: false, reason: 'belopp_okant' }
    }
    if (req.amountKr > cap) return { covered: false, reason: 'belopp_over_tak' }
  }

  return { covered: true }
}

// ─────────────────────────────────────────────────────────────────
// deriveMandateUsage — Value Ledger-härledningen. Ren funktion.
// ─────────────────────────────────────────────────────────────────

const APPROVED_STATUSES = new Set(['approved', 'auto_approved'])

export interface MandateUsageCardInput {
  created_at: string
  payload: Record<string, unknown> | null
  status: string
}

/**
 * Räknar dag-/totalanvändning ur kort med payload.mandate_id. FÖRUTSÄTTER
 * att anroparen redan filtrerat `cards` till EN specifik mandate.id (samma
 * ansvarsfördelning som lib/mission/mission-progress.ts:s .contains-
 * uppslag) — funktionen kontrollerar bara att fältet är satt, inte VILKET
 * mandat, eftersom den inte känner till mandatets id.
 *
 * Dagsgränsen är svensk lokaldag (Europe/Stockholm, lib/dates.ts:svDateStr)
 * — samma TD-3-lärdom som resten av kodbasen: en UTC-midnattsgräns skulle
 * ge fel "idag" på kvällen.
 */
export function deriveMandateUsage(
  cards: MandateUsageCardInput[],
  nowIso: string,
): { dailyUsed: number; totalUsed: number } {
  const today = svDateStr(new Date(nowIso))
  let dailyUsed = 0
  let totalUsed = 0
  for (const card of cards) {
    const payload = card.payload || {}
    if (!payload.mandate_id) continue
    if (!APPROVED_STATUSES.has(card.status)) continue
    totalUsed += 1
    if (svDateStr(new Date(card.created_at)) === today) dailyUsed += 1
  }
  return { dailyUsed, totalUsed }
}

// ─────────────────────────────────────────────────────────────────
// Auto-paus vid leveransfel — samma tröskel/fönster-MÖNSTER som
// recordAutonomyFailure (lib/autonomy/earned-autonomy.ts), men härlett ur
// kort istället för en lagrad räknare (ingen recent_failures-kolumn finns
// på mission_mandate — INGA räknare lagras).
// ─────────────────────────────────────────────────────────────────

export const MANDATE_FAILURE_WINDOW_DAYS = 14
export const MANDATE_FAILURE_THRESHOLD = 2

/** Ren beslutsfunktion — facit-testbar utan Supabase. */
export function shouldPauseForDeliveryFailures(recentFailureCount: number): boolean {
  return recentFailureCount >= MANDATE_FAILURE_THRESHOLD
}

function newCardId(): string {
  return `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Registrerar ett misslyckat mandat-utskick. Läser mandat-stämplade kort
 * (payload.mandate_id) med execution_result.outcome==='failed' de senaste
 * MANDATE_FAILURE_WINDOW_DAYS dagarna — når antalet tröskeln pausas mandatet
 * ('delivery_failures') + ett informationskort skapas. NEVER THROWS
 * (fail-safe, samma kontrakt som recordAutonomyFailure): en trasig paus får
 * aldrig stoppa den utskicksloop som anropar den.
 */
export async function registerMandateDeliveryFailure(
  supabase: SupabaseClient,
  params: { mandateId: string; businessId: string },
): Promise<void> {
  try {
    const sinceIso = new Date(Date.now() - MANDATE_FAILURE_WINDOW_DAYS * 24 * 3600_000).toISOString()
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('payload, created_at')
      .eq('business_id', params.businessId)
      .contains('payload', { mandate_id: params.mandateId })
      .gte('created_at', sinceIso)

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[mandates] kunde inte läsa leveransfel (fail-safe, ingen paus):', error.message)
      }
      return
    }

    const failures = ((data || []) as Array<{ payload: Record<string, unknown> | null }>).filter(row => {
      const execution = row.payload?.execution_result
      const outcome = execution && typeof execution === 'object'
        ? (execution as Record<string, unknown>).outcome
        : undefined
      return outcome === 'failed'
    })

    if (!shouldPauseForDeliveryFailures(failures.length)) return

    const nowIso = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('mission_mandate')
      .update({ status: 'paused', pause_reason: 'delivery_failures', paused_at: nowIso })
      .eq('id', params.mandateId)
      .eq('business_id', params.businessId)
      .eq('status', 'active')

    if (updateError) {
      if (!arSchemaSaknas(updateError)) {
        console.error('[mandates] kunde inte pausa mandat vid leveransfel:', updateError.message)
      }
      return
    }

    const { error: insertError } = await supabase.from('pending_approvals').insert({
      id: newCardId(),
      business_id: params.businessId,
      approval_type: 'mandate_paused_signal',
      title: 'Mandatet pausat — upprepade leveransfel',
      description: `${failures.length} utskick inom mandatet misslyckades de senaste två veckorna, så teamet väntar nu på ditt godkännande för varje handling igen. Granska och starta om mandatet när du vill.`,
      payload: { mandate_id: params.mandateId, pause_reason: 'delivery_failures' },
      status: 'pending',
      risk_level: 'low',
      expires_at: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
    })
    if (insertError && !arSchemaSaknas(insertError)) {
      console.error('[mandates] kunde inte skapa informationskort för leveransfel:', insertError.message)
    }
  } catch (err) {
    console.error('[mandates] registerMandateDeliveryFailure kastade oväntat (fail-safe, ignorerat):', err)
  }
}

// ─────────────────────────────────────────────────────────────────
// Auto-paus vid planändring.
// ─────────────────────────────────────────────────────────────────

/**
 * Pausar mandatet när planen ändrats sedan mandatet gavs (verifyPlanUnchanged
 * === false hos anroparen). NEVER THROWS — samma fail-safe-kontrakt som
 * registerMandateDeliveryFailure ovan.
 */
export async function pauseMandateForPlanChange(
  supabase: SupabaseClient,
  mandate: Pick<MandateRow, 'id' | 'business_id' | 'mission_id'>,
): Promise<void> {
  try {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('mission_mandate')
      .update({ status: 'paused', pause_reason: 'plan_changed', paused_at: nowIso })
      .eq('id', mandate.id)
      .eq('business_id', mandate.business_id)
      .eq('status', 'active')

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[mandates] kunde inte pausa mandat vid planändring:', error.message)
      }
      return
    }

    const { error: insertError } = await supabase.from('pending_approvals').insert({
      id: newCardId(),
      business_id: mandate.business_id,
      approval_type: 'mandate_paused_signal',
      title: 'Mandatet pausat — planen ändrades',
      description: 'Uppdragets plan ändrades efter att mandatet gavs, så teamet väntar nu på ditt godkännande för varje handling igen tills du granskar och startar om mandatet.',
      payload: { mission_id: mandate.mission_id, mandate_id: mandate.id, pause_reason: 'plan_changed' },
      status: 'pending',
      risk_level: 'low',
      expires_at: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
    })
    if (insertError && !arSchemaSaknas(insertError)) {
      console.error('[mandates] kunde inte skapa informationskort för planändring:', insertError.message)
    }
  } catch (err) {
    console.error('[mandates] pauseMandateForPlanChange kastade oväntat (fail-safe, ignorerat):', err)
  }
}

// ─────────────────────────────────────────────────────────────────
// I/O — läs-only. INGEN insert i mission_mandate här (skapande är Etapp
// X:s ägar-UI-route).
// ─────────────────────────────────────────────────────────────────

/**
 * Mandatet kopplat till uppdraget, OAVSETT status (aktivt/pausat/
 * återkallat/...) — mission_mandate har max EN rad per mission_id
 * (mandate_one_per_mission), så "aktivt" i namnet syftar på "det mandat som
 * gäller för det här AKTIVA uppdraget", inte ett status='active'-filter.
 * mandateCovers behöver se pausade/återkallade mandat också, för att kunna
 * svara med rätt avvikelseorsak istället för NO_MANDATE_REASON.
 */
export async function loadActiveMandateForMission(
  supabase: SupabaseClient,
  businessId: string,
  missionId: string,
): Promise<MandateRow | null> {
  try {
    const { data, error } = await supabase
      .from('mission_mandate')
      .select('*')
      .eq('business_id', businessId)
      .eq('mission_id', missionId)
      .maybeSingle()

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[mandates] kunde inte läsa mandat (fail-soft, null):', error.message)
      }
      return null
    }
    return (data as MandateRow | null) ?? null
  } catch (err) {
    console.error('[mandates] loadActiveMandateForMission kastade oväntat (fail-soft, null):', err)
    return null
  }
}

/** Alla mandat med status='active' för företaget — t.ex. för en
    admin-/panelöversikt. Till skillnad från loadActiveMandateForMission
    filtrerar den HÄR faktiskt på status, eftersom namnet syftar på just
    "de mandat som just nu är aktiva", inte "mandatet för ett aktivt uppdrag". */
export async function loadActiveMandates(
  supabase: SupabaseClient,
  businessId: string,
): Promise<MandateRow[]> {
  try {
    const { data, error } = await supabase
      .from('mission_mandate')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'active')

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[mandates] kunde inte läsa aktiva mandat (fail-soft, tom lista):', error.message)
      }
      return []
    }
    return (data as MandateRow[]) || []
  } catch (err) {
    console.error('[mandates] loadActiveMandates kastade oväntat (fail-soft, tom lista):', err)
    return []
  }
}
