/**
 * Outlier-exclusion-ramverk (Fas 1a Dag 2, 2026-05-30).
 *
 * Per Andreas-spec: "exclusions är en del av epistemic hygien — samma
 * kategori som thresholds. Lev tillsammans."
 *
 * Princip: epistemic hygien gäller inte bara sample-storlek (kvantitet)
 * utan VILKA samples som är giltiga (kvalitet). Calculators deklarerar
 * sina exclusion-rules på samma sätt som thresholds — konsekvent mönster.
 *
 * Två epistemic-hygien-mekanismer:
 *   - sample-thresholds.ts (kvantitativ): har vi sett nog för att uttala oss?
 *   - exclusions.ts (kvalitativ): är samplen vi sett giltiga?
 *
 * Calculator-flöde:
 *   1. Hämta råa samples från DB
 *   2. const { kept, excluded_by_reason } = applyExclusions(samples, RULES)
 *   3. assessConfidence(kept.length, patternKey) → { is_stale, ... }
 *   4. Beräkna value från kept[]
 *   5. metadata.excluded_outliers = SUM(excluded_by_reason values)
 *      metadata.exclusion_reason = första rule som triggade (eller "mixed")
 *
 * Audit-spår: metadata loggar exklueringen så vi vet om filtreringen var
 * rimlig vid framtida granskning. "Vi sa 8% ÄTA-frekvens" + "vi exkluderade
 * 12 projekt < 1 vecka gamla" → granskbart.
 *
 * Designval:
 *   - Predikat returnerar true om samplet SKA EXKLUDERAS (inte "behållas").
 *     Mer naturligt i deklarativa rules: "exclude samples where cycle_days < 1".
 *   - Första rule som triggar exkluderar samplet — sekvensen är "första
 *     träff vinner". Calculator ansvarar för regelordning om flera kan
 *     trigga (sällsynt — i Fas 1a har ingen calculator >1 rule).
 *   - Predicate är synkront. För DB-lookup-baserade exklueringar (sällsynt)
 *     skulle calculator pre-loada relaterad data först innan applyExclusions.
 */

/**
 * En exclusion-rule = predikat + reason-text för metadata.
 *
 * @typeParam T — sample-typen (specifik per calculator, t.ex. DealRow
 *               för deal_cycle, ApprovalRow för approve_rate).
 */
export interface ExclusionRule<T> {
  /**
   * Returnerar `true` om samplet ska EXKLUDERAS.
   * Falskt (inkl. `undefined`) = behåll samplet.
   *
   * VARFÖR `true = exkludera` (inte "behålla"):
   * Det matchar hur regler läses i kod naturligt. Deklarativ rule:
   *   { predicate: d => d.cycle_days < 1, reason: 'cycle < 1 day' }
   * Läses som "exclude samples where cycle_days < 1" — predikat-villkoret
   * BESKRIVER vad som ska exkluderas. Inverterad konvention (true =
   * behåll) skulle tvinga negation: `d => !(d.cycle_days < 1)`, vilket
   * är mindre läsbart.
   */
  predicate: (sample: T) => boolean

  /**
   * Human-readable reason-text som loggas i metadata.exclusion_reason.
   * Bör vara stabil string (för dedup i excluded_by_reason-counter).
   *
   * Konvention: kort beskrivning, t.ex. "cycle < 1 day",
   * "missing customer_id", "test_data_flag".
   */
  reason: string
}

/**
 * Resultat av att tillämpa exclusion-rules på en sample-array.
 *
 * `excluded_by_reason` är aggregerad räknare per reason — lätt att
 * serialisera till metadata.excluded_outliers + metadata.exclusion_reason
 * i business_patterns-raden.
 */
export interface ExclusionResult<T> {
  kept: T[]
  excluded: T[]
  /** Aggregerad räknare per reason-text. T.ex. { "cycle < 1 day": 2 }. */
  excluded_by_reason: Record<string, number>
}

/**
 * Tillämpa rules på samples. Första rule som triggar exkluderar samplet.
 *
 * Calculator-mönster:
 * ```ts
 * const DEAL_CYCLE_EXCLUSIONS: ExclusionRule<DealRow>[] = [
 *   { predicate: d => d.cycle_days < 1, reason: 'cycle < 1 day' },
 * ]
 * const { kept, excluded_by_reason } = applyExclusions(allDeals, DEAL_CYCLE_EXCLUSIONS)
 * ```
 *
 * Inga rules → alla samples behålls. Tom samples-array → tomt resultat.
 */
export function applyExclusions<T>(
  samples: T[],
  rules: ExclusionRule<T>[],
): ExclusionResult<T> {
  const kept: T[] = []
  const excluded: T[] = []
  const excluded_by_reason: Record<string, number> = {}

  if (rules.length === 0) {
    return { kept: [...samples], excluded: [], excluded_by_reason: {} }
  }

  for (const sample of samples) {
    const triggered = rules.find(r => r.predicate(sample))
    if (triggered) {
      excluded.push(sample)
      excluded_by_reason[triggered.reason] = (excluded_by_reason[triggered.reason] || 0) + 1
    } else {
      kept.push(sample)
    }
  }

  return { kept, excluded, excluded_by_reason }
}

/**
 * Helper för att packa ExclusionResult till metadata-format som
 * business_patterns-raden förväntar sig (excluded_outliers + reason).
 *
 * Aggregerar:
 *   - excluded_outliers: total antal exkluderade
 *   - exclusion_reason: första rule som triggade (eller "mixed" om flera)
 *   - excluded_by_reason: detalj per rule (bevarad i metadata för audit)
 *
 * Om inga exkluderingar → returnerar tomt object så metadata-spreaden
 * inte lägger till brus.
 */
export function summarizeExclusions<T>(
  result: ExclusionResult<T>,
): { excluded_outliers: number; exclusion_reason?: string; excluded_by_reason?: Record<string, number> } {
  const total = result.excluded.length
  if (total === 0) {
    return { excluded_outliers: 0 }
  }

  const reasons = Object.keys(result.excluded_by_reason)
  return {
    excluded_outliers: total,
    exclusion_reason: reasons.length === 1 ? reasons[0] : 'mixed',
    excluded_by_reason: result.excluded_by_reason,
  }
}
