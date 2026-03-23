/**
 * V26 — Daniels offert-intelligens
 *
 * Analyserar historiska jobb och varnar om en offert verkar underprissatt.
 */

import { getServerSupabase } from '@/lib/supabase'

export interface QuoteIntelligence {
  similar_jobs: number
  avg_actual_hours: number
  avg_quoted_hours: number
  overrun_percent: number
  suggested_price: number
  current_price: number
  confidence: 'low' | 'medium' | 'high'
  message: string
  show_warning: boolean
}

export async function analyzeQuoteBeforeSend(
  quoteId: string,
  businessId: string
): Promise<QuoteIntelligence | null> {
  const supabase = getServerSupabase()

  // Hämta offerten
  const { data: quote } = await supabase
    .from('quotes')
    .select('quote_id, title, total, labor_total, material_total, description')
    .eq('quote_id', quoteId)
    .single()

  if (!quote || !quote.total) return null

  // Hämta offertrader för att identifiera jobbtyp
  const { data: items } = await supabase
    .from('quote_items')
    .select('description, category_slug, quantity, unit, unit_price, total')
    .eq('quote_id', quoteId)
    .eq('item_type', 'item')

  // Identifiera jobbtyp baserat på titel, beskrivning och kategorier
  const jobKeywords = extractJobType(quote.title, quote.description, items || [])

  // Hämta historiska accepterade offerter med samma typ
  const { data: historicQuotes } = await supabase
    .from('quotes')
    .select('quote_id, total, labor_total')
    .eq('business_id', businessId)
    .in('status', ['accepted', 'completed'])
    .neq('quote_id', quoteId)

  if (!historicQuotes || historicQuotes.length === 0) return null

  // Filtrera liknande jobb (±30% av pris + liknande keywords)
  const priceRange = { min: quote.total * 0.5, max: quote.total * 2.0 }
  const similarQuotes = historicQuotes.filter(
    (q: any) => q.total >= priceRange.min && q.total <= priceRange.max
  )

  if (similarQuotes.length < 3) return null

  // Hämta faktisk tid för dessa projekt
  const quoteIds = similarQuotes.map((q: any) => q.quote_id)
  const { data: projects } = await supabase
    .from('project')
    .select('project_id, quote_id, budget_hours, actual_hours, actual_labor_cost, budget_amount')
    .eq('business_id', businessId)
    .in('quote_id', quoteIds)

  if (!projects || projects.length < 3) return null

  // Beräkna snitt
  const projectsWithData = projects.filter((p: any) => p.actual_hours > 0 && p.budget_hours > 0)
  if (projectsWithData.length < 3) return null

  const avgActualHours = projectsWithData.reduce((sum: number, p: any) => sum + (p.actual_hours || 0), 0) / projectsWithData.length
  const avgQuotedHours = projectsWithData.reduce((sum: number, p: any) => sum + (p.budget_hours || 0), 0) / projectsWithData.length
  const avgBudget = projectsWithData.reduce((sum: number, p: any) => sum + (p.budget_amount || 0), 0) / projectsWithData.length
  const avgActualCost = projectsWithData.reduce((sum: number, p: any) => sum + (p.actual_labor_cost || 0), 0) / projectsWithData.length

  const overrunPercent = avgQuotedHours > 0
    ? Math.round(((avgActualHours - avgQuotedHours) / avgQuotedHours) * 100)
    : 0

  // Confidence baserat på antal jobb
  const confidence: 'low' | 'medium' | 'high' =
    projectsWithData.length >= 10 ? 'high' :
    projectsWithData.length >= 5 ? 'medium' :
    'low'

  // Föreslagen justering
  const adjustmentFactor = overrunPercent > 0 ? 1 + (overrunPercent / 100) : 1
  const suggestedPrice = Math.round(quote.total * adjustmentFactor)

  // Visa bara varning om överskridning > 10% och confidence >= medium
  const showWarning = overrunPercent > 10 && confidence !== 'low'

  // Generera meddelande
  const message = showWarning
    ? `Dina senaste ${projectsWithData.length} liknande jobb tog i snitt ${overrunPercent}% längre tid än estimerat. Den här offerten kan vara ${overrunPercent}% för låg. Vill du justera till ${formatSEK(suggestedPrice)} istället?`
    : ''

  return {
    similar_jobs: projectsWithData.length,
    avg_actual_hours: Math.round(avgActualHours * 10) / 10,
    avg_quoted_hours: Math.round(avgQuotedHours * 10) / 10,
    overrun_percent: overrunPercent,
    suggested_price: suggestedPrice,
    current_price: quote.total,
    confidence,
    message,
    show_warning: showWarning,
  }
}

function extractJobType(title: string | null, description: string | null, items: any[]): string[] {
  const text = [title, description, ...items.map(i => i.description)].filter(Boolean).join(' ').toLowerCase()
  const keywords: string[] = []

  const jobTypes: Record<string, string[]> = {
    badrum: ['badrum', 'dusch', 'kakel', 'klinker', 'våtrum'],
    kök: ['kök', 'bänkskiva', 'diskbänk', 'köksluckor'],
    el: ['el', 'elcentral', 'jordfelsbrytare', 'belysning', 'uttag'],
    vvs: ['vvs', 'rör', 'avlopp', 'värmepump', 'radiator'],
    måleri: ['målning', 'tapetsering', 'spackling'],
    bygg: ['bygg', 'renovering', 'tillbyggnad', 'attefall'],
  }

  for (const [type, words] of Object.entries(jobTypes)) {
    if (words.some(w => text.includes(w))) keywords.push(type)
  }

  return keywords.length > 0 ? keywords : ['general']
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount) + ' kr'
}
