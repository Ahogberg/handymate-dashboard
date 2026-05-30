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
 * Exclusion-kategori för audit-rapportering.
 *
 * Andreas-observation 2026-05-30: vid first körning mot Bee visade
 * metadata `excluded_outliers: 0` trots att 2 Lars-observations hade
 * exkluderats av agent_observation-typ-filtret. Det var tekniskt korrekt
 * (DB-status-filter sker före computeApproveRate, så 0 samples nådde
 * exclusions) men strukturen missade att rapportera vad som hade hänt
 * om datan hade varit annorlunda.
 *
 * Två konceptuellt olika kategorier:
 *   - 'type'    = strukturell exklusion (fel approval_type, fel kategori).
 *                 Exempel: APPROVE_RATE_EXCLUSIONS exkluderar
 *                 approval_type='agent_observation' eftersom de är
 *                 ack-only, inte kvalitetssignal.
 *   - 'outlier' = data-anomali (testdata, fel värden, edge-case).
 *                 Exempel: DEAL_CYCLE_EXCLUSIONS exkluderar deals med
 *                 cycle_days < 1 eftersom det troligen är testdata.
 *
 * Default 'outlier' om kind saknas (bakåt-kompatibilitet).
 */
export type ExclusionKind = 'type' | 'outlier'

/**
 * En exclusion-rule = predikat + reason-text + kind för metadata.
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
   * Human-readable reason-text som loggas i metadata.excluded_by_reason.
   * Bör vara stabil string (för dedup i counter).
   *
   * Konvention: kort beskrivning, t.ex. "cycle_under_1_day_likely_testdata",
   * "generic_observation_not_actionable", "missing_customer_id".
   */
  reason: string

  /**
   * Kategori för audit-rapportering. Default 'outlier' om utelämnad.
   *
   * 'type'    = strukturell exklusion (fel approval_type, fel kategori)
   * 'outlier' = data-anomali (testdata, fel värden, edge-case)
   */
  kind?: ExclusionKind
}

/**
 * Resultat av att tillämpa exclusion-rules på en sample-array.
 *
 * Två aggregat-vägar (Andreas 2026-05-30):
 *   - `excluded_by_reason` = detaljerad räknare per reason-text
 *     (audit-spår: VARFÖR exkluderades samplet)
 *   - `excluded_by_kind`   = aggregerad räknare per kind ('type'/'outlier')
 *     (kategori-spår: VILKEN TYP av exklusion)
 *
 * UI/Fas 2 kan visa båda: "82 exkluderade (80 strukturella, 2 outliers)".
 */
export interface ExclusionResult<T> {
  kept: T[]
  excluded: T[]
  /** Aggregerad räknare per reason-text. T.ex. { "cycle_under_1_day_likely_testdata": 2 }. */
  excluded_by_reason: Record<string, number>
  /** Aggregerad räknare per kind. Saknad kind defaultar till 'outlier'. */
  excluded_by_kind: { type?: number; outlier?: number }
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
  const excluded_by_kind: { type?: number; outlier?: number } = {}

  if (rules.length === 0) {
    return { kept: [...samples], excluded: [], excluded_by_reason: {}, excluded_by_kind: {} }
  }

  for (const sample of samples) {
    const triggered = rules.find(r => r.predicate(sample))
    if (triggered) {
      excluded.push(sample)
      excluded_by_reason[triggered.reason] = (excluded_by_reason[triggered.reason] || 0) + 1
      const kind: ExclusionKind = triggered.kind || 'outlier'
      excluded_by_kind[kind] = (excluded_by_kind[kind] || 0) + 1
    } else {
      kept.push(sample)
    }
  }

  return { kept, excluded, excluded_by_reason, excluded_by_kind }
}

/**
 * Helper för att packa ExclusionResult till metadata-format som
 * business_patterns-raden förväntar sig.
 *
 * Andreas 2026-05-30: två aggregat — `excluded_by_kind` (type vs outlier)
 * och `excluded_by_reason` (detaljerad audit). UI/Fas 2 kan visa båda:
 *   "82 exkluderade (80 strukturella, 2 outliers)"
 *
 * Om inga exklueringar → returnerar bara `excluded_total: 0`. Spreaden
 * lägger då inte till brus i metadata.
 */
export function summarizeExclusions<T>(
  result: ExclusionResult<T>,
): {
  excluded_total: number
  excluded_by_kind?: { type?: number; outlier?: number }
  excluded_by_reason?: Record<string, number>
} {
  const total = result.excluded.length
  if (total === 0) {
    return { excluded_total: 0 }
  }

  return {
    excluded_total: total,
    excluded_by_kind: result.excluded_by_kind,
    excluded_by_reason: result.excluded_by_reason,
  }
}
