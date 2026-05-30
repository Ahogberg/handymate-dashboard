/**
 * run-patterns.ts (Fas 1a Dag 4, 2026-05-30).
 *
 * Delad helper för pattern-extraction-cron. Två routes använder denna:
 *   - app/api/cron/patterns/route.ts (Vercel cron — alla businesses)
 *   - app/api/cron/patterns/test/route.ts (manuell trigger — en business)
 *
 * Splittad i ren funktion (buildPatternUpsertPayload) + thin DB-wrappers
 * (upsertPattern, runPatternsForBusiness). Den rena funktionen är
 * unit-testbar utan supabase-mock.
 *
 * Designval:
 *   - Try/catch PER calculator inom runPatternsForBusiness. En fail
 *     stoppar inte resten. Errors loggas + returneras för audit.
 *   - last_calculated_at sätts EXPLICIT i payload (tabell-DEFAULT NOW()
 *     fungerar bara för INSERT, inte UPSERT över existerande rad).
 *   - Idempotent via UNIQUE(business_id, pattern_key) + onConflict.
 *     Kör 2 ggr samma dag → samma rad uppdateras, ingen ny insert.
 *
 * Dag 6 lägger till deal_cycle + ata_frequency-calculators i samma
 * mönster (push på CALCULATORS-array nedan).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalculatorResult, ConfidenceAssessment } from './types'
import { calculateApproveRate } from './calculators/approve-rate'
import { calculateDealCycle } from './calculators/deal-cycle'
import { calculateAtaFrequency } from './calculators/ata-frequency'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

/**
 * Resultat per business efter att alla Tier A-calculators körts.
 *
 * patterns_updated = pattern_keys som UPSERTade utan fel
 * errors           = per-calculator-fel (en calculator-fail kraschar
 *                    inte de andra för samma business)
 * duration_ms      = total körtid för business — för skalbarhetsanalys
 *                    när vi får 10+ businesses
 */
export interface BusinessPatternRunResult {
  business_id: string
  patterns_updated: string[]
  errors: Array<{ pattern: string; error: string }>
  duration_ms: number
}

// ─────────────────────────────────────────────────────────────────
// Ren funktion — unit-testbar utan DB
// ─────────────────────────────────────────────────────────────────

/**
 * Bygger UPSERT-payload från calculator-resultat + confidence-bedömning.
 *
 * `now` är parameter för testbarhet (frys tid). Default = nu.
 */
export function buildPatternUpsertPayload(
  businessId: string,
  result: CalculatorResult,
  confidence: ConfidenceAssessment,
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    business_id: businessId,
    pattern_key: result.pattern_key,
    value: result.value,
    sample_size: result.sample_size,
    confidence: confidence.confidence,
    is_stale: confidence.is_stale,
    data_window_start: result.data_window_start,
    data_window_end: result.data_window_end,
    metadata: result.metadata,
    last_calculated_at: now.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────
// DB-wrappers — thin
// ─────────────────────────────────────────────────────────────────

/**
 * UPSERT en pattern-rad i business_patterns. onConflict på unique-
 * constraint (business_id, pattern_key) garanterar idempotens.
 */
async function upsertPattern(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('business_patterns')
    .upsert(payload, { onConflict: 'business_id,pattern_key' })

  if (error) {
    throw new Error(`business_patterns upsert failed: ${error.message}`)
  }
}

/**
 * Kör alla Tier A-calculators för EN business och UPSERTar resultaten.
 *
 * Per-calculator try/catch — en fail stoppar inte de andra.
 *
 * Tier A (alla aktiva från Dag 6, 2026-05-30):
 *   - approve_rate
 *   - deal_cycle
 *   - ata_frequency
 *
 * För att lägga till ny calculator: kopiera ett block, byt funktion +
 * pattern_key + ev. metadata-fält. Se lib/patterns/README.md för full
 * mall.
 */
export async function runPatternsForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<BusinessPatternRunResult> {
  const start = Date.now()
  const patternsUpdated: string[] = []
  const errors: Array<{ pattern: string; error: string }> = []

  // ── Tier A — approve_rate ─────────────────────────────────────
  try {
    const { result, confidence } = await calculateApproveRate(supabase, businessId, now)
    const payload = buildPatternUpsertPayload(businessId, result, confidence, now)
    await upsertPattern(supabase, payload)
    patternsUpdated.push('approve_rate')
    console.log(`[patterns/${businessId}] approve_rate:`, {
      sample_size: result.sample_size,
      confidence: confidence.confidence,
      is_stale: confidence.is_stale,
      excluded_total: (result.metadata as { excluded_total?: number }).excluded_total ?? 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push({ pattern: 'approve_rate', error: msg })
    console.error(`[patterns/${businessId}] approve_rate failed:`, msg)
  }

  // ── Tier A — deal_cycle ───────────────────────────────────────
  try {
    const { result, confidence } = await calculateDealCycle(supabase, businessId, now)
    const payload = buildPatternUpsertPayload(businessId, result, confidence, now)
    await upsertPattern(supabase, payload)
    patternsUpdated.push('deal_cycle')
    console.log(`[patterns/${businessId}] deal_cycle:`, {
      sample_size: result.sample_size,
      confidence: confidence.confidence,
      is_stale: confidence.is_stale,
      excluded_total: (result.metadata as { excluded_total?: number }).excluded_total ?? 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push({ pattern: 'deal_cycle', error: msg })
    console.error(`[patterns/${businessId}] deal_cycle failed:`, msg)
  }

  // ── Tier A — ata_frequency ────────────────────────────────────
  try {
    const { result, confidence } = await calculateAtaFrequency(supabase, businessId, now)
    const payload = buildPatternUpsertPayload(businessId, result, confidence, now)
    await upsertPattern(supabase, payload)
    patternsUpdated.push('ata_frequency')
    console.log(`[patterns/${businessId}] ata_frequency:`, {
      sample_size: result.sample_size,
      confidence: confidence.confidence,
      is_stale: confidence.is_stale,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push({ pattern: 'ata_frequency', error: msg })
    console.error(`[patterns/${businessId}] ata_frequency failed:`, msg)
  }

  return {
    business_id: businessId,
    patterns_updated: patternsUpdated,
    errors,
    duration_ms: Date.now() - start,
  }
}
