/**
 * V7 T2: Prissättningsintelligens
 *
 * Nattlig analys av historiska offerter → pricing_intelligence tabell.
 * Används av ekonomi-agenten för datadrivna prisförslag.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'

const MODEL = 'claude-haiku-4-5-20251001'

interface PricingData {
  job_type: string
  avg_price: number
  min_price: number
  max_price: number
  median_price: number
  total_quotes: number
  won_quotes: number
  lost_quotes: number
  win_rate: number | null
  avg_margin: number | null
  price_trend: 'rising' | 'falling' | 'stable'
}

interface QuoteForClassification {
  quote_id: string
  items: Array<{ description?: string; name?: string }>
  title?: string
  description?: string
}

interface QuoteRecord {
  quote_id: string
  total_amount: number
  status: string
  job_type: string | null
  outcome: string | null
  created_at: string
  title?: string
  description?: string
}

/**
 * Klassificera jobbtyp för offerter som saknar det.
 * Använder Claude Haiku för att kategorisera baserat på offertens rader.
 */
async function classifyJobTypes(
  _businessId: string,
  quotes: QuoteForClassification[]
): Promise<Map<string, string>> {
  if (quotes.length === 0) return new Map()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const quoteSummaries = quotes.map((q: QuoteForClassification, i: number) => {
    const itemDescs = (q.items || [])
      .map((item: { description?: string; name?: string }) => item.description || item.name || '')
      .filter(Boolean)
      .join(', ')
    return `${i + 1}. ID: ${q.quote_id} | Titel: ${q.title || 'Ingen'} | Rader: ${itemDescs || 'Inga'}`
  }).join('\n')

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Klassificera varje offert nedan till en jobbtyp. Använd korta, svenska termer som "badrumsrenovering", "målning", "elinstallation", "VVS", "snickeri", "takarbete", "fasadrenovering", "trädgård", "golvläggning", "köksrenovering", "fönsterbyte", "dörrmontage", "kakelläggning", "totalrenovering", "tillbyggnad", "altan/trall", "isolering", "rivning" etc.

Svara EXAKT i formatet (en per rad):
QUOTE_ID|jobbtyp

Offerter:
${quoteSummaries}`
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const result = new Map<string, string>()

    for (const line of text.split('\n')) {
      const parts = line.trim().split('|')
      if (parts.length === 2) {
        const quoteId = parts[0].trim()
        const jobType = parts[1].trim().toLowerCase()
        if (quoteId && jobType) {
          result.set(quoteId, jobType)
        }
      }
    }

    return result
  } catch (err) {
    console.error('[PricingEngine] classifyJobTypes error:', err)
    return new Map()
  }
}

/**
 * Analysera historisk prisdata och uppdatera pricing_intelligence.
 * Kallas nattligt från cron.
 */
export async function updatePricingIntelligence(businessId: string): Promise<{
  success: boolean
  jobTypesAnalyzed: number
  quotesClassified: number
  error?: string
}> {
  const supabase = getServerSupabase()

  try {
    // 1. Hämta alla offerter med belopp
    const { data: allQuotes, error: quotesError } = await supabase
      .from('quotes')
      .select('quote_id, total_amount, status, job_type, outcome, created_at, title, description')
      .eq('business_id', businessId)
      .not('total_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (quotesError || !allQuotes) {
      return { success: false, jobTypesAnalyzed: 0, quotesClassified: 0, error: quotesError?.message }
    }

    if (allQuotes.length < 3) {
      return { success: true, jobTypesAnalyzed: 0, quotesClassified: 0, error: 'För få offerter för analys (minimum 3)' }
    }

    // 2. Hämta quote_items för offerter som saknar job_type
    const unclassified = allQuotes.filter((q: QuoteRecord) => !q.job_type)

    let quotesClassified = 0
    if (unclassified.length > 0) {
      const quoteIds = unclassified.map((q: QuoteRecord) => q.quote_id)
      const { data: items } = await supabase
        .from('quote_items')
        .select('quote_id, description, name')
        .in('quote_id', quoteIds)

      const itemsByQuote: Record<string, Array<{ description?: string; name?: string }>> = {}
      for (const item of items || []) {
        if (!itemsByQuote[item.quote_id]) {
          itemsByQuote[item.quote_id] = []
        }
        itemsByQuote[item.quote_id].push(item)
      }

      const quotesToClassify: QuoteForClassification[] = unclassified.map((q: QuoteRecord) => ({
        quote_id: q.quote_id,
        items: itemsByQuote[q.quote_id] || [],
        title: q.title,
        description: q.description,
      }))

      // Klassificera i batchar om max 30
      const batches: QuoteForClassification[][] = []
      for (let i = 0; i < quotesToClassify.length; i += 30) {
        batches.push(quotesToClassify.slice(i, i + 30))
      }

      for (const batch of batches) {
        const classifications = await classifyJobTypes(businessId, batch)

        const entries = Array.from(classifications.entries())
        for (const entry of entries) {
          const quoteId = entry[0]
          const jobType = entry[1]
          await supabase
            .from('quotes')
            .update({ job_type: jobType })
            .eq('quote_id', quoteId)
            .eq('business_id', businessId)
          quotesClassified++
        }
      }
    }

    // 3. Auto-klassificera outcome från status
    //    accepted = won, rejected/expired = lost
    const needOutcome = allQuotes.filter((q: QuoteRecord) => !q.outcome && (q.status === 'accepted' || q.status === 'rejected' || q.status === 'expired'))
    for (const q of needOutcome) {
      const outcome = q.status === 'accepted' ? 'won' : 'lost'
      await supabase
        .from('quotes')
        .update({ outcome, outcome_at: new Date().toISOString() })
        .eq('quote_id', q.quote_id)
        .eq('business_id', businessId)
    }

    // 4. Re-fetch med uppdaterade job_types
    const { data: updatedQuotes } = await supabase
      .from('quotes')
      .select('quote_id, total_amount, status, job_type, outcome, created_at')
      .eq('business_id', businessId)
      .not('total_amount', 'is', null)
      .not('job_type', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (!updatedQuotes || updatedQuotes.length === 0) {
      return { success: true, jobTypesAnalyzed: 0, quotesClassified, error: 'Inga klassificerade offerter att analysera' }
    }

    // 5. Aggregera per jobbtyp
    const byJobType: Record<string, QuoteRecord[]> = {}
    for (const q of updatedQuotes) {
      const jt = q.job_type as string
      if (!byJobType[jt]) {
        byJobType[jt] = []
      }
      byJobType[jt].push(q as QuoteRecord)
    }

    const pricingRows: PricingData[] = []

    const jobTypeKeys = Object.keys(byJobType)
    for (const jobType of jobTypeKeys) {
      const quotes = byJobType[jobType]
      const prices = quotes.map((q: QuoteRecord) => Number(q.total_amount)).filter((p: number) => p > 0).sort((a: number, b: number) => a - b)
      if (prices.length === 0) continue

      const won = quotes.filter((q: QuoteRecord) => q.outcome === 'won').length
      const lost = quotes.filter((q: QuoteRecord) => q.outcome === 'lost').length
      const total = quotes.length

      // Median
      const mid = Math.floor(prices.length / 2)
      const median = prices.length % 2 === 0
        ? (prices[mid - 1] + prices[mid]) / 2
        : prices[mid]

      // Trend — jämför senaste 30% mot äldsta 30%
      let trend: 'rising' | 'falling' | 'stable' = 'stable'
      if (prices.length >= 4) {
        const recentCount = Math.max(1, Math.floor(quotes.length * 0.3))
        const recentQuotes = quotes.slice(0, recentCount)
        const olderQuotes = quotes.slice(-recentCount)
        const recentAvg = recentQuotes.reduce((s: number, q: QuoteRecord) => s + Number(q.total_amount), 0) / recentCount
        const olderAvg = olderQuotes.reduce((s: number, q: QuoteRecord) => s + Number(q.total_amount), 0) / recentCount
        const change = (recentAvg - olderAvg) / olderAvg

        if (change > 0.1) trend = 'rising'
        else if (change < -0.1) trend = 'falling'
      }

      const winRate = (won + lost) > 0 ? won / (won + lost) : null

      pricingRows.push({
        job_type: jobType,
        avg_price: Math.round(prices.reduce((s: number, p: number) => s + p, 0) / prices.length),
        min_price: prices[0],
        max_price: prices[prices.length - 1],
        median_price: Math.round(median),
        total_quotes: total,
        won_quotes: won,
        lost_quotes: lost,
        win_rate: winRate !== null ? Math.round(winRate * 100) / 100 : null,
        avg_margin: null,
        price_trend: trend,
      })
    }

    // 6. Upsert till pricing_intelligence
    for (const row of pricingRows) {
      await supabase
        .from('pricing_intelligence')
        .upsert(
          {
            business_id: businessId,
            job_type: row.job_type,
            avg_price: row.avg_price,
            min_price: row.min_price,
            max_price: row.max_price,
            median_price: row.median_price,
            total_quotes: row.total_quotes,
            won_quotes: row.won_quotes,
            lost_quotes: row.lost_quotes,
            win_rate: row.win_rate,
            avg_margin: row.avg_margin,
            price_trend: row.price_trend,
            last_analyzed_at: new Date().toISOString(),
          },
          { onConflict: 'business_id,job_type' }
        )
    }

    console.log(`[PricingEngine] ${businessId}: ${pricingRows.length} jobbtyper analyserade, ${quotesClassified} offerter klassificerade`)

    return {
      success: true,
      jobTypesAnalyzed: pricingRows.length,
      quotesClassified,
    }
  } catch (err: any) {
    console.error('[PricingEngine] Error:', err)
    return { success: false, jobTypesAnalyzed: 0, quotesClassified: 0, error: err.message }
  }
}

/**
 * Hämta prisförslag för en jobbtyp.
 * Returnerar historisk data + rekommendation.
 */
export async function getPricingSuggestion(
  businessId: string,
  jobType: string,
  _details?: string
): Promise<{
  found: boolean
  suggestion?: {
    recommended_price_range: { min: number; max: number }
    avg_price: number
    median_price: number
    win_rate: number | null
    total_quotes: number
    price_trend: string
    advice: string
  }
  similar_types?: string[]
}> {
  const supabase = getServerSupabase()

  // Exakt match
  const { data: exact } = await supabase
    .from('pricing_intelligence')
    .select('*')
    .eq('business_id', businessId)
    .eq('job_type', jobType.toLowerCase())
    .single()

  if (exact) {
    const margin = exact.win_rate !== null && exact.win_rate > 0.6
      ? 0.1
      : 0.15

    const min = Math.round(Number(exact.median_price) * (1 - margin))
    const max = Math.round(Number(exact.median_price) * (1 + margin * 1.5))

    let advice = ''
    if (exact.win_rate !== null) {
      if (exact.win_rate > 0.7) {
        advice = `Hög vinstfrekvens (${Math.round(Number(exact.win_rate) * 100)}%). Du kan troligen höja priset något.`
      } else if (exact.win_rate < 0.3) {
        advice = `Låg vinstfrekvens (${Math.round(Number(exact.win_rate) * 100)}%). Överväg att sänka priset eller förbättra offertens mervärde.`
      } else {
        advice = `Normal vinstfrekvens (${Math.round(Number(exact.win_rate) * 100)}%).`
      }
    }

    if (exact.price_trend === 'rising') {
      advice += ' Priserna har ökat på sistone.'
    } else if (exact.price_trend === 'falling') {
      advice += ' Priserna har sjunkit på sistone.'
    }

    return {
      found: true,
      suggestion: {
        recommended_price_range: { min, max },
        avg_price: Number(exact.avg_price),
        median_price: Number(exact.median_price),
        win_rate: exact.win_rate !== null ? Number(exact.win_rate) : null,
        total_quotes: exact.total_quotes,
        price_trend: exact.price_trend,
        advice,
      },
    }
  }

  // Fuzzy match — hitta liknande jobbtyper
  const { data: allTypes } = await supabase
    .from('pricing_intelligence')
    .select('job_type')
    .eq('business_id', businessId)

  const similarTypes = (allTypes || [])
    .map((t: { job_type: string }) => t.job_type)
    .filter((t: string) => {
      const jt = jobType.toLowerCase()
      return t.includes(jt) || jt.includes(t) || levenshteinSimilar(t, jt)
    })

  return {
    found: false,
    similar_types: similarTypes.length > 0 ? similarTypes : undefined,
  }
}

/**
 * Enkel likhetskontroll — returnerar true om strängarna är tillräckligt lika.
 */
function levenshteinSimilar(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false
  const wordsA = a.split(/\s+/)
  const wordsB = b.split(/\s+/)
  const setB = new Set(wordsB)
  let common = 0
  for (let i = 0; i < wordsA.length; i++) {
    if (setB.has(wordsA[i])) common++
  }
  return common > 0 && common >= Math.min(wordsA.length, wordsB.length) * 0.5
}
