/**
 * Sample-thresholds + confidence-mappning + data-window-policy (Fas 1a Dag 2,
 * 2026-05-30).
 *
 * Per tasks/fas1-pattern-extraction-design.md Del 4.
 *
 * Två epistemic-hygien-mekanismer LEV TILLSAMMANS:
 *   1. Sample-thresholds (denna fil) — kvantitativ gate: hur många
 *      observationer behövs för att uttala oss alls?
 *   2. Exclusions (./exclusions.ts) — kvalitativ gate: vilka observationer
 *      är giltiga samples?
 *
 * Calculators tillämpar BÅDA i sekvens:
 *   1. Hämta råa samples
 *   2. applyExclusions(samples, rules) → kept[]
 *   3. assessConfidence(kept.length, patternKey) → { confidence, is_stale }
 *   4. Beräkna value från kept[]
 *   5. Logga excluded-count i metadata
 *
 * Per-business override av thresholds är DESIGNAT (business_patterns_config-
 * tabell) men EJ byggt i Fas 1a — alla calculators läser globala defaults
 * härifrån. När 3+ pilotkunder finns aktiveras config-tabellen och fallback-
 * ordningen blir: business_patterns_config[biz][pattern] → globala defaults.
 */

import type { PatternKey, ConfidenceAssessment } from './types'

// ─────────────────────────────────────────────────────────────────
// Per-pattern config (deklarativ — lätt att override per-business senare)
// ─────────────────────────────────────────────────────────────────

export interface PatternThresholdConfig {
  /** Min N för 'preliminary'-uttalande. Under = is_stale=true. */
  preliminary: number
  /** Min N för 'medium' confidence. */
  medium: number
  /** Min N för 'high' confidence. */
  high: number
  /** Data-window i dagar bakåt från nu. */
  window_days: number
}

/**
 * Globala default-trösklar per pattern. Från designdokumentet Del 4
 * (inkl Andreas-justeringar 2026-05-30 för customer_return_rate +
 * seasonal_variation — relevant först i Tier C/D).
 *
 * För Fas 1a är bara Tier A-keys konfigurerade. Nya pattern_keys
 * läggs till HÄR + i PatternKey-unionen så tsc fångar saknad config
 * via Record<PatternKey, ...>-exhaustiveness.
 */
export const PATTERN_THRESHOLDS: Record<PatternKey, PatternThresholdConfig> = {
  approve_rate: {
    preliminary: 5,
    medium: 15,
    high: 30,
    window_days: 30,
  },
  deal_cycle: {
    preliminary: 10,
    medium: 25,
    high: 50,
    window_days: 90,
  },
  ata_frequency: {
    preliminary: 10,
    medium: 25,
    high: 50,
    window_days: 365,
  },
}

// ─────────────────────────────────────────────────────────────────
// Confidence-bedömning
// ─────────────────────────────────────────────────────────────────

/**
 * Mappar sample-storlek till ConfidenceAssessment.
 *
 * Logik:
 *   n >= high       → high, is_stale=false
 *   n >= medium     → medium, is_stale=false
 *   n >= preliminary → preliminary, is_stale=false
 *   n < preliminary → preliminary (default), is_stale=true
 *                     (Calculator skriver rad ändå för sample-progression.)
 *
 * threshold_used = den nivå vi UPPNÅDDE
 * next_threshold = nästa nivå att sikta på (null om redan high)
 *
 * UI/Fas 2 läser is_stale + next_threshold för att visa
 *   "Bygger underlag (X av Y)" istället för value-baserat uttalande.
 */
export function assessConfidence(
  sampleSize: number,
  patternKey: PatternKey,
): ConfidenceAssessment {
  const config = PATTERN_THRESHOLDS[patternKey]

  if (sampleSize >= config.high) {
    return {
      confidence: 'high',
      is_stale: false,
      threshold_used: config.high,
      next_threshold: null,
    }
  }
  if (sampleSize >= config.medium) {
    return {
      confidence: 'medium',
      is_stale: false,
      threshold_used: config.medium,
      next_threshold: config.high,
    }
  }
  if (sampleSize >= config.preliminary) {
    return {
      confidence: 'preliminary',
      is_stale: false,
      threshold_used: config.preliminary,
      next_threshold: config.medium,
    }
  }
  // Under preliminary — calculator skriver rad med is_stale=true så
  // sample_size-progressionen bevaras. UI visar "X av preliminary".
  return {
    confidence: 'preliminary',
    is_stale: true,
    threshold_used: 0,
    next_threshold: config.preliminary,
  }
}

// ─────────────────────────────────────────────────────────────────
// Data-window
// ─────────────────────────────────────────────────────────────────

/**
 * Returnerar (start, end) för pattern-specifik data-window.
 * Calculator använder för att filtrera samples på created_at/invoice_date/
 * dylikt.
 *
 * `now`-parameter är frivillig för testbarhet (frys tid).
 */
export function getDataWindow(
  patternKey: PatternKey,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const config = PATTERN_THRESHOLDS[patternKey]
  const start = new Date(now.getTime() - config.window_days * 86400 * 1000)
  return { start, end: now }
}
