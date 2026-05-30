/**
 * approve-rate calculator (Fas 1a Dag 3, 2026-05-30).
 *
 * Per tasks/fas1-pattern-extraction-design.md Tier A.
 *
 * Pattern: hur ofta godkänner användaren agentförslag, per agent?
 *
 * Sample = en resolved approval (status approved | rejected | edited).
 * Window: senaste 30 dagar.
 * Min N preliminary: 5 totala resolved approvals.
 *
 * Beräkning:
 *   per_agent[X].approved = count där status=approved + agent=X
 *   per_agent[X].rejected = count där status=rejected + agent=X
 *   per_agent[X].edited   = count där status=edited + agent=X
 *   per_agent[X].rate     = approved / (approved + rejected + edited)
 *                            STRIKT: edited räknas inte som "godkänt"
 *                            men inkluderas i nämnaren. Resultat:
 *                            "Karin: 50% rate" = hälften av förslag
 *                            godkändes oförändrade.
 *
 *   overall_rate = sum(approved) / sum(approved + rejected + edited)
 *   overall_n    = total kept-samples (efter exclusions, här inga)
 *
 * Exclusion-rules: inga. Alla resolved approvals är giltiga samples.
 * Null-agent-approvals (autopilot, dispatch m.fl.) räknas inte i
 * per_agent men inkluderas i overall_n eftersom de ÄR resolved
 * samples — bara inte agent-attribuerade.
 *
 * Designval: split i ren funktion `computeApproveRate(approvals[])` +
 * thin DB-wrapper `calculateApproveRate(supabase, businessId)`.
 * Rena funktioner är unit-testbara utan mock-supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { assessConfidence, getDataWindow } from '../sample-thresholds'
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
  payload: Record<string, unknown> | null
  created_at: string
}

/**
 * Resolved-status som räknas. Andra status (pending, expired,
 * auto_approved) exkluderas — de representerar inte aktiv mänsklig
 * feedback.
 */
const RESOLVED_STATUSES = new Set(['approved', 'rejected', 'edited'])

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
  // Defensiv filter: ta bara resolved samples
  const resolved = samples.filter(s => RESOLVED_STATUSES.has(s.status))

  // Per agent + overall aggregering
  const perAgent: ApproveRateValue['per_agent'] = {}
  let totalApproved = 0
  let totalRejected = 0
  let totalEdited = 0

  for (const sample of resolved) {
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

  const sampleSize = resolved.length  // total resolved oavsett agent

  // Metadata: ålder på äldsta sample för "data-färskhet"-bedömning
  let oldestSampleDaysAgo: number | undefined
  if (resolved.length > 0) {
    const oldestIso = resolved.reduce(
      (acc, s) => (s.created_at < acc ? s.created_at : acc),
      resolved[0].created_at,
    )
    const ageMs = Date.now() - new Date(oldestIso).getTime()
    oldestSampleDaysAgo = Math.floor(ageMs / 86400000)
  }

  const metadata: ApproveRateMetadata = {
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
    .select('id, status, payload, created_at')
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
