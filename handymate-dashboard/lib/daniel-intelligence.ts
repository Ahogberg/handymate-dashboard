/**
 * Business Twin Quote Reality Check V1.
 *
 * Kontrollpunkten före offertutskick jämför bara med kvalitetsgrindade,
 * avslutade jobb för samma explicita mall eller jobbtyp. Ingen LLM räknar,
 * inget pris ändras automatiskt och ett källfel blir aldrig "ingen risk".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import {
  getEfterkalkylInsight,
  type EfterkalkylInsight,
} from '@/lib/efterkalkyl/get-insight'
import {
  getQuoteBudgetDerivation,
  type QuoteBudgetDerivation,
} from '@/lib/quotes/get-quote-budget-derivation'

export type QuoteRealityStatus = 'ready' | 'insufficient' | 'unavailable'
export type QuoteRealityConfidence = 'begränsat' | 'gott' | 'starkt'

export interface QuoteRealityAnalysis {
  matched_by: 'template' | 'job_type'
  match_label: string
  similar_jobs: number
  financial_jobs: number
  quoted_hours: number
  avg_hours_diff_pct: number
  recommended_hours: number
  suggested_buffer_hours: number
  avg_realized_margin_pct: number | null
  confidence: QuoteRealityConfidence
  message: string
}

export interface QuoteIntelligence {
  status: QuoteRealityStatus
  show_warning: boolean
  analysis: QuoteRealityAnalysis | null
  reason: string | null
}

interface RealityCheckInput {
  insight: EfterkalkylInsight
  budget: QuoteBudgetDerivation
  matchedBy: 'template' | 'job_type'
  matchLabel: string
}

const MIN_SAMPLE_SIZE = 3
const WARNING_THRESHOLD_PCT = 10

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function roundUpHalfHour(value: number): number {
  return Math.ceil(value * 2) / 2
}

function insufficient(reason: string): QuoteIntelligence {
  return { status: 'insufficient', show_warning: false, analysis: null, reason }
}

function unavailable(reason: string): QuoteIntelligence {
  return { status: 'unavailable', show_warning: false, analysis: null, reason }
}

/** Ren jämförelsekärna: samma indata ger alltid samma kvitto. */
export function buildQuoteRealityCheck(input: RealityCheckInput): QuoteIntelligence {
  const { insight, budget, matchedBy, matchLabel } = input
  if (insight.unavailable) {
    return unavailable('Efterkalkylerna kunde inte läsas säkert just nu.')
  }
  if (insight.insufficient || insight.count < MIN_SAMPLE_SIZE) {
    return insufficient(`Minst ${MIN_SAMPLE_SIZE} jämförbara avslutade jobb krävs.`)
  }

  const quotedHours = Number(budget.budget_hours)
  if (!Number.isFinite(quotedHours) || quotedHours <= 0) {
    return insufficient('Offerten saknar jämförbara timmar.')
  }

  if (insight.avg_hours_diff_pct == null) {
    return insufficient('De jämförbara jobben saknar säker tidsavvikelse.')
  }
  const averageDiff = Number(insight.avg_hours_diff_pct)
  if (!Number.isFinite(averageDiff)) {
    return insufficient('De jämförbara jobben saknar säker tidsavvikelse.')
  }

  const positiveOverrun = Math.max(0, averageDiff)
  const recommendedHours = roundUpHalfHour(quotedHours * (1 + positiveOverrun / 100))
  const bufferHours = round1(Math.max(0, recommendedHours - quotedHours))
  const showWarning = averageDiff >= WARNING_THRESHOLD_PCT
  const confidence: QuoteRealityConfidence = insight.count >= 10
    ? 'starkt'
    : insight.count >= 5
      ? 'gott'
      : 'begränsat'

  const message = showWarning
    ? `Liknande jobb har i snitt tagit ${round1(averageDiff).toLocaleString('sv-SE')} % mer tid än offererat. En historiskt förankrad kontrollnivå är ${recommendedHours.toLocaleString('sv-SE')} timmar.`
    : `Kontrollerad mot ${insight.count} liknande jobb. Historiken visar ingen tydlig återkommande tidsrisk.`

  return {
    status: 'ready',
    show_warning: showWarning,
    analysis: {
      matched_by: matchedBy,
      match_label: matchLabel,
      similar_jobs: insight.count,
      financial_jobs: insight.financial_count ?? 0,
      quoted_hours: round1(quotedHours),
      avg_hours_diff_pct: round1(averageDiff),
      recommended_hours: recommendedHours,
      suggested_buffer_hours: bufferHours,
      avg_realized_margin_pct: insight.avg_margin_pct == null || !Number.isFinite(Number(insight.avg_margin_pct))
        ? null
        : round1(Number(insight.avg_margin_pct)),
      confidence,
      message,
    },
    reason: null,
  }
}

/**
 * Tenantbunden I/O-gräns. Offertens egna, explicit sparade klassificering
 * avgör jämförelsen; fritext eller prisintervall används aldrig som gissning.
 */
export async function analyzeQuoteBeforeSend(
  quoteId: string,
  businessId: string,
  supabase: SupabaseClient = getServerSupabase(),
): Promise<QuoteIntelligence> {
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('quote_id, template_id, job_type')
    .eq('business_id', businessId)
    .eq('quote_id', quoteId)
    .maybeSingle()

  if (quoteError) {
    console.error('[quote-reality-check] offertuppslag misslyckades:', quoteError)
    return unavailable('Offerten kunde inte läsas säkert just nu.')
  }
  if (!quote) return unavailable('Offerten hittades inte i företaget.')

  const templateId = typeof quote.template_id === 'string' && quote.template_id.trim()
    ? quote.template_id.trim()
    : null
  const jobType = typeof quote.job_type === 'string' && quote.job_type.trim()
    ? quote.job_type.trim()
    : null
  if (!templateId && !jobType) {
    return insufficient('Offerten saknar mall eller jobbtyp att jämföra på.')
  }

  let budget: QuoteBudgetDerivation
  try {
    budget = await getQuoteBudgetDerivation(supabase, quoteId, businessId)
  } catch (error) {
    console.error('[quote-reality-check] budgethärledning misslyckades:', error)
    return unavailable('Offertens timmar kunde inte läsas säkert just nu.')
  }

  const insight = await getEfterkalkylInsight(supabase, businessId, {
    templateId,
    jobType: templateId ? null : jobType,
  })

  return buildQuoteRealityCheck({
    insight,
    budget,
    matchedBy: templateId ? 'template' : 'job_type',
    matchLabel: templateId || jobType || '',
  })
}
