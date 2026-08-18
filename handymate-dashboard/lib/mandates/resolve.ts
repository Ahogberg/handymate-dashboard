/**
 * Mission Mandates V1 — Etapp W (caller-integration), tasks/jaunty-
 * pondering-hummingbird.md. Delad kandidat-resolver ovanpå Etapp V:s rena
 * kontrakt (lib/mandates/mission-mandate.ts). EN resolver, FYRA tunna
 * callers (send-reminders, quote-follow-up, review-requests,
 * automation-engine) — ingen av dem duplicerar täcknings-/plan-/
 * användningslogiken själva (RECOMMENDED-valet i planen).
 *
 * ═══ CACHNING — EN LADDNING PER FÖRETAG, INTE PER KANDIDAT ═══
 *
 * loadMandateResolutionCache(...) anropas EN gång per företag i anroparens
 * loop (samma idiom som configMap i send-reminders/route.ts). Den
 * returnerade cachen skickas in i varje resolveMandateForAction-anrop för
 * det företaget: aktiva mandat läses en gång (loadActiveMandates), och
 * uppdragets plansteg + mandatets användningskort läses lat men memoiseras
 * per uppdrag/mandat — flera kandidater i samma företags loop delar samma
 * uppslag.
 *
 * ═══ FAIL-SOFT PÅ ALLT ═══
 *
 * Precis som mission-mandate.ts: varje I/O-fel (schema saknas, uppslag
 * misslyckas) degraderar till "ingen täckning" — ALDRIG ett kastat fel som
 * skulle stoppa en cron mitt i en leveransloop. Anroparen faller då tillbaka
 * till dagens isAutonomous-väg, exakt som om inget mandat fanns alls.
 *
 * ═══ FÖRBJUDEN INTEGRATIONSPUNKT ═══
 *
 * Precis som mission-mandate.ts: den här filen anropar ALDRIG tool-routerns
 * förbjudna exekverings-spegel (app/api/agent/trigger/tool-router.ts). Se
 * mission-mandate.ts:s filhuvud för fullständig motivering — mandatkontrollen
 * hör hemma BREDVID isAutonomous() i callers, inte via spegeln.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type MandateRow,
  type MandateActionType,
  type MandateMissReason,
  mandateCovers,
  verifyPlanUnchanged,
  deriveMandateUsage,
  pauseMandateForPlanChange,
  loadActiveMandates,
  NO_MANDATE_REASON,
} from './mission-mandate'
import type { ValidatedMissionStep } from '@/lib/mission/plan-validation'

export interface MandateResolutionCache {
  mandates: MandateRow[]
  missionStepsById: Map<string, ValidatedMissionStep[] | null>
  usageByMandateId: Map<string, { dailyUsed: number; totalUsed: number }>
}

/**
 * En läsning per företag — anropas en gång per business-iteration i
 * anroparens loop, INTE per kandidat. Fail-soft ärvs från loadActiveMandates
 * (schema saknas/fel ⇒ tom lista, aldrig ett kastat fel).
 */
export async function loadMandateResolutionCache(
  supabase: SupabaseClient,
  businessId: string,
): Promise<MandateResolutionCache> {
  const mandates = await loadActiveMandates(supabase, businessId)
  return { mandates, missionStepsById: new Map(), usageByMandateId: new Map() }
}

async function loadMissionSteps(
  supabase: SupabaseClient,
  businessId: string,
  missionId: string,
  cache: MandateResolutionCache,
): Promise<ValidatedMissionStep[] | null> {
  if (cache.missionStepsById.has(missionId)) {
    return cache.missionStepsById.get(missionId) ?? null
  }
  try {
    const { data, error } = await supabase
      .from('mission')
      .select('id, plan_snapshot')
      .eq('business_id', businessId)
      .eq('id', missionId)
      .maybeSingle()
    if (error || !data) {
      cache.missionStepsById.set(missionId, null)
      return null
    }
    const snapshot = (data as { plan_snapshot?: { steps?: unknown } }).plan_snapshot
    const steps = Array.isArray(snapshot?.steps) ? (snapshot!.steps as ValidatedMissionStep[]) : []
    cache.missionStepsById.set(missionId, steps)
    return steps
  } catch (err) {
    console.error('[mandates] loadMissionSteps kastade oväntat (fail-soft, null):', err)
    cache.missionStepsById.set(missionId, null)
    return null
  }
}

async function loadUsage(
  supabase: SupabaseClient,
  businessId: string,
  mandate: MandateRow,
  nowIso: string,
  cache: MandateResolutionCache,
): Promise<{ dailyUsed: number; totalUsed: number }> {
  const cached = cache.usageByMandateId.get(mandate.id)
  if (cached) return cached
  let usage = { dailyUsed: 0, totalUsed: 0 }
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('created_at, payload, status')
      .eq('business_id', businessId)
      .contains('payload', { mandate_id: mandate.id })
    if (!error && Array.isArray(data)) {
      usage = deriveMandateUsage(
        data as Array<{ created_at: string; payload: Record<string, unknown> | null; status: string }>,
        nowIso,
      )
    }
  } catch (err) {
    console.error('[mandates] loadUsage kastade oväntat (fail-soft, 0/0):', err)
  }
  cache.usageByMandateId.set(mandate.id, usage)
  return usage
}

export type ResolvedMandate =
  | { covered: true; mandate: MandateRow }
  | { covered: false; reason: MandateMissReason }

export interface ResolveMandateParams {
  actionKey: MandateActionType
  targetRef: string
  amountKr: number | null
  nowIso: string
}

/**
 * Hittar ett aktivt mandat som täcker den givna kandidat-handlingen.
 * Provar varje aktivt mandat (ur cachen) vars allowed_action_types
 * innehåller typen, i tur och ordning:
 *   1. Planen måste vara oförändrad (verifyPlanUnchanged) — annars pausas
 *      mandatet (pauseMandateForPlanChange) och nästa kandidat-mandat provas.
 *   2. mandateCovers (mål/tak/status) måste svara covered:true.
 * Första träffen vinner. NO_MANDATE_REASON täcker både "inga kandidat-mandat
 * alls" och "provade ett eller flera men inget täckte" — anroparen bryr sig
 * bara om covered/inte covered (minsta-avvikelse-principen, samma som
 * mandateCovers självt: en avvikelse ⇒ dagens vanliga väg, aldrig en gissad
 * "nästan täckt"-status).
 *
 * NEVER THROWS — varje internt fel resolverar till { covered: false }.
 */
export async function resolveMandateForAction(
  supabase: SupabaseClient,
  businessId: string,
  cache: MandateResolutionCache,
  params: ResolveMandateParams,
): Promise<ResolvedMandate> {
  try {
    const candidates = cache.mandates.filter(m => m.allowed_action_types.includes(params.actionKey))
    for (const mandate of candidates) {
      const steps = await loadMissionSteps(supabase, businessId, mandate.mission_id, cache)
      if (steps === null) continue

      if (!verifyPlanUnchanged(mandate, steps)) {
        await pauseMandateForPlanChange(supabase, mandate)
        continue
      }

      const usage = await loadUsage(supabase, businessId, mandate, params.nowIso, cache)
      const result = mandateCovers(mandate, {
        actionKey: params.actionKey,
        targetRef: params.targetRef,
        amountKr: params.amountKr,
        nowIso: params.nowIso,
        dailyUsed: usage.dailyUsed,
        totalUsed: usage.totalUsed,
      })
      if (result.covered) return { covered: true, mandate }
    }
    return { covered: false, reason: NO_MANDATE_REASON }
  } catch (err) {
    console.error('[mandates] resolveMandateForAction kastade oväntat (fail-soft, ingen täckning):', err)
    return { covered: false, reason: NO_MANDATE_REASON }
  }
}

/**
 * truth_class per mandat-typ för exekveringsstämplade kort (Etapp W punkt
 * 2): invoice_reminder → 'indrivningsbart' (samma klass som mission-
 * progress.ts:s APPROVAL_TYPE_CLASS-mappning för invoice_reminder-kort),
 * quote_followup_sms → 'pipeline' (öppna offerter, aldrig säkrade pengar —
 * samma klass som pipeline-rörelsen i mission-progress.ts). booking_reminder
 * och review_request saknar MEDVETET en post här: ingen av
 * mission-progress.ts:s fem klasser beskriver ärligt "en bokning påmindes om"
 * eller "en recension efterfrågades" — att tvinga in dem i en klass vore att
 * hitta på en sanning som inte finns. Callern utelämnar payload.truth_class
 * helt för dessa två typer i stället för att gissa.
 */
export const MANDATE_TRUTH_CLASS: Partial<Record<MandateActionType, string>> = {
  invoice_reminder: 'indrivningsbart',
  quote_followup_sms: 'pipeline',
}
