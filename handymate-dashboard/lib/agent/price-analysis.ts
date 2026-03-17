/**
 * V16 — Automatisk prisjustering
 *
 * Analyserar estimerad vs faktisk tid per jobbtyp/kategori.
 * Om faktisk tid konsekvent > estimerad med 15%+ → skapar approval-förslag.
 * Kräver 3+ avslutade jobb av samma typ som underlag.
 */

import { getServerSupabase } from '@/lib/supabase'

interface CategoryAnalysis {
  category: string
  categoryLabel: string
  jobCount: number
  avgEstimatedHours: number
  avgActualHours: number
  overrunPercent: number
  currentHourlyRate: number | null
  suggestedHourlyRate: number | null
  priceListId: string | null
}

export async function analyzePriceAdjustments(businessId: string): Promise<{
  success: boolean
  analyzed: number
  suggestions: number
  error?: string
}> {
  const supabase = getServerSupabase()

  try {
    // 1. Find completed projects with linked quotes
    const { data: projects } = await supabase
      .from('project')
      .select('project_id, quote_id, name, status')
      .eq('business_id', businessId)
      .in('status', ['completed', 'done', 'invoiced'])
      .not('quote_id', 'is', null)

    if (!projects || projects.length === 0) {
      return { success: true, analyzed: 0, suggestions: 0 }
    }

    const quoteIds = projects.map((p: any) => p.quote_id).filter(Boolean) as string[]
    const projectIds = projects.map((p: any) => p.project_id)

    // 2. Get estimated hours per category from quote_items
    const { data: quoteItems } = await supabase
      .from('quote_items')
      .select('quote_id, category_slug, quantity, unit')
      .in('quote_id', quoteIds)
      .eq('item_type', 'item')
      .eq('unit', 'tim')

    // 3. Get actual worked hours per project
    const { data: timeEntries } = await supabase
      .from('time_entry')
      .select('project_id, duration_minutes, work_category')
      .in('project_id', projectIds)

    if (!quoteItems || !timeEntries) {
      return { success: true, analyzed: 0, suggestions: 0 }
    }

    // 4. Build lookup: project_id → quote_id
    const projectToQuote = new Map<string, string>()
    for (const p of projects) {
      if (p.quote_id) projectToQuote.set(p.project_id, p.quote_id)
    }

    // 5. Aggregate estimated hours per category per quote
    const estimatedByCategory = new Map<string, { totalHours: number; count: number }>()
    for (const item of quoteItems) {
      const cat = item.category_slug || 'ovrigt'
      const existing = estimatedByCategory.get(`${item.quote_id}:${cat}`)
      if (existing) {
        existing.totalHours += item.quantity || 0
      } else {
        estimatedByCategory.set(`${item.quote_id}:${cat}`, {
          totalHours: item.quantity || 0,
          count: 1,
        })
      }
    }

    // 6. Aggregate actual hours per category per project → quote
    const actualByCategory = new Map<string, number>()
    for (const te of timeEntries) {
      if (te.work_category && te.work_category !== 'work') continue // only count actual work
      const quoteId = projectToQuote.get(te.project_id)
      if (!quoteId) continue
      // We don't have category on time_entry, so aggregate per quote
      const key = `${quoteId}:all`
      actualByCategory.set(key, (actualByCategory.get(key) || 0) + (te.duration_minutes || 0) / 60)
    }

    // 7. Compare estimated vs actual per category across all quotes
    const categoryStats = new Map<string, { estimated: number[]; actual: number[] }>()

    for (const [key, est] of Array.from(estimatedByCategory.entries())) {
      const [quoteId, cat] = key.split(':')
      const actualKey = `${quoteId}:all`
      const actualHours = actualByCategory.get(actualKey)
      if (actualHours === undefined) continue

      if (!categoryStats.has(cat)) {
        categoryStats.set(cat, { estimated: [], actual: [] })
      }
      const stats = categoryStats.get(cat)!
      stats.estimated.push(est.totalHours)
      stats.actual.push(actualHours)
    }

    // 8. Find categories with consistent overrun (15%+, 3+ jobs)
    const analyses: CategoryAnalysis[] = []

    for (const [cat, stats] of Array.from(categoryStats.entries())) {
      if (stats.estimated.length < 3) continue // minimum 3 jobs

      const avgEstimated = stats.estimated.reduce((a, b) => a + b, 0) / stats.estimated.length
      const avgActual = stats.actual.reduce((a, b) => a + b, 0) / stats.actual.length

      if (avgEstimated <= 0) continue

      const overrunPercent = ((avgActual - avgEstimated) / avgEstimated) * 100

      if (overrunPercent < 15) continue // only flag 15%+ overrun

      // Get category label
      const catLabel = getCategoryLabel(cat)

      // Get current hourly rate from default price list
      const { data: defaultPl } = await supabase
        .from('price_lists_v2')
        .select('id, hourly_rate_normal')
        .eq('business_id', businessId)
        .eq('is_default', true)
        .single()

      const currentRate = defaultPl?.hourly_rate_normal || null
      const suggestedRate = currentRate
        ? Math.round(currentRate * (1 + overrunPercent / 100) / 5) * 5 // Round to nearest 5
        : null

      analyses.push({
        category: cat,
        categoryLabel: catLabel,
        jobCount: stats.estimated.length,
        avgEstimatedHours: Math.round(avgEstimated * 10) / 10,
        avgActualHours: Math.round(avgActual * 10) / 10,
        overrunPercent: Math.round(overrunPercent),
        currentHourlyRate: currentRate,
        suggestedHourlyRate: suggestedRate,
        priceListId: defaultPl?.id || null,
      })
    }

    // 9. Create approvals for each suggestion
    let suggestions = 0
    for (const analysis of analyses) {
      // Check if we already suggested this recently (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: existing } = await supabase
        .from('v3_automation_logs')
        .select('id')
        .eq('business_id', businessId)
        .eq('rule_name', 'price_adjustment_suggestion')
        .gte('created_at', thirtyDaysAgo)
        .contains('context', { category: analysis.category })
        .limit(1)

      if (existing && existing.length > 0) continue // already suggested recently

      const rateText = analysis.currentHourlyRate && analysis.suggestedHourlyRate
        ? ` Vill du att jag justerar timpriset från ${analysis.currentHourlyRate} kr → ${analysis.suggestedHourlyRate} kr i din prislista?`
        : ' Överväg att justera dina priser för denna kategori.'

      // Create approval
      await supabase.from('pending_approvals').insert({
        id: crypto.randomUUID(),
        business_id: businessId,
        approval_type: 'price_adjustment',
        title: `Prisjustering — ${analysis.categoryLabel}`,
        description: `Jag har märkt att ${analysis.categoryLabel.toLowerCase()}-jobb tar ${analysis.overrunPercent}% längre tid än du estimerar (snitt ${analysis.avgEstimatedHours}h estimerat vs ${analysis.avgActualHours}h faktiskt, baserat på ${analysis.jobCount} avslutade jobb).${rateText}`,
        payload: {
          category: analysis.category,
          category_label: analysis.categoryLabel,
          job_count: analysis.jobCount,
          avg_estimated_hours: analysis.avgEstimatedHours,
          avg_actual_hours: analysis.avgActualHours,
          overrun_percent: analysis.overrunPercent,
          current_rate: analysis.currentHourlyRate,
          suggested_rate: analysis.suggestedHourlyRate,
          price_list_id: analysis.priceListId,
        },
        status: 'pending',
        risk_level: 'medium',
      })

      // Log to automation_logs
      await supabase.from('v3_automation_logs').insert({
        business_id: businessId,
        rule_name: 'price_adjustment_suggestion',
        trigger_type: 'cron',
        action_type: 'create_approval',
        status: 'success',
        context: {
          category: analysis.category,
          category_label: analysis.categoryLabel,
          job_count: analysis.jobCount,
          avg_estimated_hours: analysis.avgEstimatedHours,
          avg_actual_hours: analysis.avgActualHours,
          overrun_percent: analysis.overrunPercent,
          current_rate: analysis.currentHourlyRate,
          suggested_rate: analysis.suggestedHourlyRate,
        },
      })

      suggestions++
    }

    return {
      success: true,
      analyzed: categoryStats.size,
      suggestions,
    }
  } catch (err: any) {
    console.error('[price-analysis] Error:', err)
    return { success: false, analyzed: 0, suggestions: 0, error: err.message }
  }
}

function getCategoryLabel(slug: string): string {
  const labels: Record<string, string> = {
    arbete_el: 'El-arbete',
    arbete_vvs: 'VVS-arbete',
    arbete_bygg: 'Byggjobb',
    arbete_maleri: 'Måleri',
    arbete_rut: 'RUT-arbete',
    material_el: 'Elmaterial',
    material_vvs: 'VVS-material',
    material_bygg: 'Byggmaterial',
    resa: 'Resekostnad',
    ovrigt: 'Övrigt arbete',
    all: 'Generellt',
  }
  return labels[slug] || slug
}
