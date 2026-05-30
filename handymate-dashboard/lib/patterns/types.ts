/**
 * Pattern-extraction typer (Fas 1a, 2026-05-30).
 *
 * Per tasks/fas1-pattern-extraction-design.md.
 *
 * En business_patterns-rad representerar EN beräknad pattern för EN business.
 * Per-pattern value-struktur definieras som strikt TypeScript-union så
 * calculators inte kan skriva fel shape utan kompileringsfel.
 *
 * Designprinciper:
 *   1. Strikt typing per pattern_key — discriminated union på pattern_key
 *      + value-typ. Calculators som returnerar fel shape får tsc-fel.
 *   2. Calculator-exclusion: VARJE calculator FÅR definiera sina egna
 *      exclusion criteria (vilka samples som är ogiltiga). Exkluderade
 *      samples loggas i metadata.excluded_outliers så vi kan auditera om
 *      filtreringen är rimlig. Princip: epistemic hygien gäller inte bara
 *      sample-storlek, utan VILKA samples som är giltiga.
 *      Exempel (deal_cycle): cycle_days < 1 är samma-dag-testdata,
 *      exkluderas.
 *   3. Confidence + is_stale härleds AUTOMATISKT av sample-thresholds-
 *      helpern (lib/patterns/sample-thresholds.ts) — calculator behöver
 *      bara returnera sample_size, helpern mappar.
 */

// ─────────────────────────────────────────────────────────────────
// Pattern-keys (enum-aktig union)
// ─────────────────────────────────────────────────────────────────

/**
 * Alla pattern-keys som finns. Lägg till nya HÄR + i PatternValue-union
 * nedan så tsc fångar saknade implementationer.
 */
export type PatternKey =
  | 'approve_rate'
  | 'deal_cycle'
  | 'ata_frequency'
  // Tier B/C/D — calculators byggs i Fas 1a-ramen men aktiveras automatiskt
  // när sample-thresholds nås (auto-gated av is_stale-logik).
  // Listas här för att tsc ska fånga oavsiktliga typos i pattern_key.

// ─────────────────────────────────────────────────────────────────
// Per-pattern value-typer
// ─────────────────────────────────────────────────────────────────

/**
 * approve_rate: per-agent approve/reject/edit-fördelning + rate.
 *
 * Sample = en resolved approval (status approved | rejected | edited).
 * Window: senaste 30d. Min N preliminary: 5 per agent (helst), 5 totalt
 * vid kallstart.
 *
 * Exclusion criteria: inga (alla resolved approvals är giltiga samples).
 */
export interface ApproveRateValue {
  per_agent: Record<string, {
    approved: number
    rejected: number
    edited: number
    /** approved / (approved + rejected + edited). Null om n=0. */
    rate: number | null
    n: number
  }>
  /** Aggregerad rate över alla agenter. Null om n=0. */
  overall_rate: number | null
  overall_n: number
}

/**
 * deal_cycle: hur lång tid tar det från deal-skapande till stängning?
 *
 * Sample = en vunnen deal (pipeline_stage.is_won AND deal.closed_at IS NOT NULL).
 * Window: senaste 90d. Min N preliminary: 10 vunna deals.
 *
 * Exclusion criteria (Andreas 2026-05-30):
 *   - cycle_days < 1 → samma-dag testdata, exkluderas.
 *   metadata.excluded_outliers logger antalet + reason.
 */
export interface DealCycleValue {
  avg_days: number | null
  median_days: number | null
  p25_days: number | null
  p75_days: number | null
  min_days: number | null
  max_days: number | null
}

/**
 * ata_frequency: hur ofta får projekt ÄTA (tilläggsarbete)?
 *
 * Sample = ett projekt skapat i windowed period.
 * Window: senaste 12 mån. Min N preliminary: 10 projekt.
 *
 * Exclusion criteria: inga (alla projekt är giltiga samples — även
 * pågående utan ÄTA räknas som "0 ÄTA hittills" som datapunkt).
 */
export interface AtaFrequencyValue {
  total_projects: number
  projects_with_ata: number
  /** projects_with_ata / total_projects. 0..1. */
  pct_with_ata: number
  /** Genomsnittligt antal ÄTA-rader per projekt (inkl 0). */
  avg_ata_per_project: number
}

// ─────────────────────────────────────────────────────────────────
// Discriminated union: pattern_key → value-typ
// ─────────────────────────────────────────────────────────────────

/**
 * Calculator-output: vad calculator-funktioner returnerar för EN business
 * och EN pattern_key. Discriminated union så tsc fångar fel.
 */
export type CalculatorResult =
  | {
      pattern_key: 'approve_rate'
      value: ApproveRateValue
      sample_size: number
      data_window_start: string
      data_window_end: string
      metadata: ApproveRateMetadata
    }
  | {
      pattern_key: 'deal_cycle'
      value: DealCycleValue
      sample_size: number
      data_window_start: string
      data_window_end: string
      metadata: DealCycleMetadata
    }
  | {
      pattern_key: 'ata_frequency'
      value: AtaFrequencyValue
      sample_size: number
      data_window_start: string
      data_window_end: string
      metadata: AtaFrequencyMetadata
    }

// ─────────────────────────────────────────────────────────────────
// Per-pattern metadata-typer
// ─────────────────────────────────────────────────────────────────

/**
 * Delad exclusion-metadata-struktur (Andreas 2026-05-30).
 *
 * Sätts av summarizeExclusions(). Spreaden in i pattern-specifik
 * metadata så fält-namn är konsekventa över alla calculators.
 *
 * Vid 0 exkluderade samples → bara `excluded_total: 0` skrivs.
 * Vid 1+ → båda by_kind + by_reason för audit.
 */
export interface ExclusionMetadata {
  excluded_total?: number
  excluded_by_kind?: { type?: number; outlier?: number }
  excluded_by_reason?: Record<string, number>
}

export interface ApproveRateMetadata extends ExclusionMetadata {
  /** Hur länge sedan första resolved approval. För att bedöma om data är "färsk". */
  oldest_sample_days_ago?: number
}

export interface DealCycleMetadata extends ExclusionMetadata {
  /** Hur många öppna deals finns det utöver vunna? Kontext för Christoffer. */
  open_deals_count?: number
}

export interface AtaFrequencyMetadata extends ExclusionMetadata {
  /** Per projekttyp om projektet har project_type satt. */
  by_project_type?: Record<string, {
    total: number
    with_ata: number
    pct: number
  }>
}

// ─────────────────────────────────────────────────────────────────
// Confidence + is_stale-relaterat (helper bygger på sample-thresholds)
// ─────────────────────────────────────────────────────────────────

export type Confidence = 'preliminary' | 'medium' | 'high'

/**
 * Stale-logik per pattern: under min N för preliminary = is_stale=true.
 * Calculator skriver rad ändå för att bevara sample-size-progressionen.
 * UI/Fas 2 visar "Bygger underlag (X av Y)" istället för value.
 */
export interface ConfidenceAssessment {
  confidence: Confidence
  is_stale: boolean
  /** Min N för aktuell confidence-nivå. Används av UI ("X av Y"). */
  threshold_used: number
  /** Min N för nästa confidence-nivå (eller null om redan high). */
  next_threshold: number | null
}

// ─────────────────────────────────────────────────────────────────
// business_patterns-rad shape (matchar SQL-tabellen)
// ─────────────────────────────────────────────────────────────────

export interface BusinessPatternRow {
  id: string
  business_id: string
  pattern_key: PatternKey
  value: Record<string, unknown>  // pattern-specifik, typ-säkras via CalculatorResult
  sample_size: number
  confidence: Confidence
  is_stale: boolean
  data_window_start: string | null
  data_window_end: string | null
  metadata: Record<string, unknown>
  last_calculated_at: string
}
