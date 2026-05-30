/**
 * approve-rate calculator (Fas 1a Dag 3, 2026-05-30).
 *
 * Per tasks/fas1-pattern-extraction-design.md Tier A.
 *
 * Pattern: hur ofta godkänner användaren agentens KONKRETA förslag?
 *
 * Sample = en resolved approval (status approved | rejected | edited)
 *          MED actionable approval_type (typed action, inte ack-only).
 * Window: senaste 30 dagar.
 * Min N preliminary: 5 totala resolved approvals (efter exclusions).
 *
 * KRITISK semantik (Andreas-fråga 2026-05-30):
 * approval_type='agent_observation' och 'agent_insight' är INFORMATIVA
 * — Lars/Hannas varnings-observations som hantverkaren bara ack:ar.
 * "Approve" här betyder "Tack, jag noterar", inte "Skicka SMS:et".
 * Räknar man dessa som godkända får man falsk-hög rate (alltid ~100%
 * eftersom ingen rejecte:ar en informativ notis).
 *
 * Exclusion-rule: `approval_type IN ('agent_observation', 'agent_insight')`
 * → exkluderas innan rate-beräkning. Bara typed actions där approve
 * betyder "utför handlingen" räknas.
 *
 * Beräkning (på kept samples efter exclusions):
 *   per_agent[X].approved = count där status=approved + agent=X
 *   per_agent[X].rejected = count där status=rejected + agent=X
 *   per_agent[X].edited   = count där status=edited + agent=X
 *   per_agent[X].rate     = approved / (approved + rejected + edited)
 *                            STRIKT: edited räknas inte som "godkänt"
 *                            men inkluderas i nämnaren.
 *
 *   overall_rate = sum(approved) / sum(approved + rejected + edited)
 *   overall_n    = total kept-samples (efter exclusions)
 *
 * Null-agent-approvals (autopilot, dispatch m.fl.) räknas inte i
 * per_agent men inkluderas i overall_n om de är typed actions.
 *
 * Designval: split i ren funktion `computeApproveRate(approvals[])` +
 * thin DB-wrapper `calculateApproveRate(supabase, businessId)`.
 * Rena funktioner är unit-testbara utan mock-supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { assessConfidence, getDataWindow } from '../sample-thresholds'
import { applyExclusions, summarizeExclusions, type ExclusionRule } from '../exclusions'
import { extractAgentId } from '../utils/extract-agent-id'
import type {
  ApproveRateValue,
  ApproveRateMetadata,
  CalculatorResult,
} from '../types'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

/**
 * Subset av pending_approvals-rad som approve-rate behöver.
 * Calculator-callers (cron-route) ansvarar för att SELECT:a dessa fält.
 */
export interface ApprovalSample {
  id: string
  status: string  // 'approved' | 'rejected' | 'edited' | annat (filtreras)
  /**
   * Den approval-typ som skapades. Används för att skilja typed actions
   * (rate-mätbara) från generic ack-only observations.
   */
  approval_type: string
  payload: Record<string, unknown> | null
  created_at: string
}

/**
 * Resolved-status som räknas. Andra status (pending, expired,
 * auto_approved) exkluderas — de representerar inte aktiv mänsklig
 * feedback.
 */
const RESOLVED_STATUSES = new Set(['approved', 'rejected', 'edited'])

/**
 * Approval-typer som är INFORMATIVA snarare än actionable. Användarens
 * "approve" här = "Tack, jag noterar", inte "Utför handlingen". Dessa
 * exkluderas från rate-beräkning eftersom de skulle ge falsk-hög rate
 * (ingen rejecte:ar en informativ notis).
 *
 * Använder blocklist (inte allowlist) eftersom dessa två typer är väl
 * etablerade som ack-only och listan är liten. Om nya generic-typer
 * tillkommer i framtiden måste de adderas här. När antalet stabiliseras
 * kan vi switcha till allowlist över actionable-typer.
 */
const GENERIC_INFO_APPROVAL_TYPES = new Set([
  'agent_observation',  // Lars/Hannas warning-observations, legacy generic
  'agent_insight',      // ren info-push utan approval-rad (sällsynt här)
])

/**
 * Exclusion-rules för approve_rate (Andreas-fråga 2026-05-30).
 *
 * Exporteras så cron-route (Dag 4) kan inkludera dem i metadata-spår
 * om vi vill visa "X observations exkluderades från rate-mätning".
 */
export const APPROVE_RATE_EXCLUSIONS: ExclusionRule<ApprovalSample>[] = [
  {
    predicate: s => GENERIC_INFO_APPROVAL_TYPES.has(s.approval_type),
    reason: 'generic_observation_not_actionable',
  },
]

// ─────────────────────────────────────────────────────────────────
// Ren funktion — unit-testbar utan DB
// ─────────────────────────────────────────────────────────────────

/**
 * Beräkna approve-rate-pattern från en samples-array.
 *
 * Caller (DB-wrapper eller test) ansvarar för:
 *   - Att samples ligger inom data-window (filtrering på created_at)
 *   - Att alla samples är resolved (filtrering på status redan gjord)
 *
 * Den här funktionen filtrerar dock defensivt: icke-resolved status
 * räknas inte. Säkrar mot fel i caller.
 */
export function computeApproveRate(
  samples: ApprovalSample[],
  dataWindowStart: string,
  dataWindowEnd: string,
): CalculatorResult {
  // Steg 1: defensiv filter — bara resolved samples
  const resolved = samples.filter(s => RESOLVED_STATUSES.has(s.status))

  // Steg 2: exkludera generic info-typer (agent_observation, agent_insight)
  // — deras "approve" är inte kvalitetssignal på agentens förslag.
  const exclusionResult = applyExclusions(resolved, APPROVE_RATE_EXCLUSIONS)
  const kept = exclusionResult.kept

  // Per agent + overall aggregering på kept samples
  const perAgent: ApproveRateValue['per_agent'] = {}
  let totalApproved = 0
  let totalRejected = 0
  let totalEdited = 0

  for (const sample of kept) {
    const agentId = extractAgentId(sample)
    const status = sample.status

    if (status === 'approved') totalApproved++
    else if (status === 'rejected') totalRejected++
    else if (status === 'edited') totalEdited++

    if (!agentId) continue  // räknas i overall men ej per-agent

    if (!perAgent[agentId]) {
      perAgent[agentId] = { approved: 0, rejected: 0, edited: 0, rate: null, n: 0 }
    }
    if (status === 'approved') perAgent[agentId].approved++
    else if (status === 'rejected') perAgent[agentId].rejected++
    else if (status === 'edited') perAgent[agentId].edited++
    perAgent[agentId].n++
  }

  // Beräkna rate per agent
  for (const agentId of Object.keys(perAgent)) {
    const a = perAgent[agentId]
    const denom = a.approved + a.rejected + a.edited
    a.rate = denom > 0 ? a.approved / denom : null
  }

  const overallDenom = totalApproved + totalRejected + totalEdited
  const value: ApproveRateValue = {
    per_agent: perAgent,
    overall_rate: overallDenom > 0 ? totalApproved / overallDenom : null,
    overall_n: overallDenom,
  }

  // sample_size = kept (post-exclusion). Avspeglar antal mätbara approvals.
  const sampleSize = kept.length

  // Metadata: ålder på äldsta sample för "data-färskhet"-bedömning
  let oldestSampleDaysAgo: number | undefined
  if (kept.length > 0) {
    const oldestIso = kept.reduce(
      (acc, s) => (s.created_at < acc ? s.created_at : acc),
      kept[0].created_at,
    )
    const ageMs = Date.now() - new Date(oldestIso).getTime()
    oldestSampleDaysAgo = Math.floor(ageMs / 86400000)
  }

  // Slå ihop exclusion-summa med övrig metadata
  const exclusionSummary = summarizeExclusions(exclusionResult)
  const metadata: ApproveRateMetadata = {
    ...exclusionSummary,
    ...(oldestSampleDaysAgo !== undefined ? { oldest_sample_days_ago: oldestSampleDaysAgo } : {}),
  }

  return {
    pattern_key: 'approve_rate',
    value,
    sample_size: sampleSize,
    data_window_start: dataWindowStart,
    data_window_end: dataWindowEnd,
    metadata,
  }
}

// ─────────────────────────────────────────────────────────────────
// DB-wrapper — thin
// ─────────────────────────────────────────────────────────────────

/**
 * Hämta resolved approvals för business inom 30d-window och beräkna
 * approve-rate-pattern.
 *
 * Returnerar { result, confidence } där result är CalculatorResult och
 * confidence är assess-resultat (för insert i business_patterns).
 *
 * Cron-route (Dag 4) anropar denna + INSERT/UPSERT i business_patterns.
 */
export async function calculateApproveRate(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<{
  result: CalculatorResult
  confidence: ReturnType<typeof assessConfidence>
}> {
  const window = getDataWindow('approve_rate', now)

  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id, status, approval_type, payload, created_at')
    .eq('business_id', businessId)
    .in('status', ['approved', 'rejected', 'edited'])
    .gte('created_at', window.start.toISOString())
    .lte('created_at', window.end.toISOString())

  if (error) {
    console.error('[calculateApproveRate] query error:', error)
    throw new Error(`approve_rate query failed: ${error.message}`)
  }

  const samples = (data || []) as ApprovalSample[]
  const result = computeApproveRate(
    samples,
    window.start.toISOString(),
    window.end.toISOString(),
  )

  const confidence = assessConfidence(result.sample_size, 'approve_rate')

  return { result, confidence }
}
