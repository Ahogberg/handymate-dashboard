/**
 * V25 — Lönsamhetsanalys
 *
 * Beräknar projektlönsamhet baserat på offert, tid, material, ÄTA och extrakostnader.
 * Karins varningar triggas vid 75%, 90% och 100%+ av budget.
 */

import { getServerSupabase } from '@/lib/supabase'

export interface ProjectProfitability {
  project_id: string
  project_name: string

  // Budget (från offert)
  budget_amount: number
  budget_hours: number
  budget_labor: number
  budget_material: number

  // Faktiskt
  actual_hours: number
  actual_labor_cost: number
  actual_material_cost: number
  actual_extra_cost: number
  actual_total_cost: number

  // ÄTA
  ata_additions: number
  ata_hours: number

  // Beräknat
  total_budget: number  // budget + ÄTA
  completion_percent: number
  cost_percent: number
  margin: number
  margin_percent: number

  // Prognos
  projected_final_cost: number
  projected_overrun: number

  // Status
  status: 'on_track' | 'at_risk' | 'over_budget'
}

export async function calculateProfitability(
  projectId: string,
  businessId: string
): Promise<ProjectProfitability | null> {
  const supabase = getServerSupabase()

  // Hämta projekt
  const { data: project } = await supabase
    .from('project')
    .select('project_id, name, quote_id, budget_hours, budget_amount, actual_hours, actual_labor_cost, actual_material_cost, status')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (!project) return null

  // Hämta offert-detaljer
  let budgetLabor = 0
  let budgetMaterial = 0
  if (project.quote_id) {
    const { data: quote } = await supabase
      .from('quotes')
      .select('labor_total, material_total, total')
      .eq('quote_id', project.quote_id)
      .single()
    if (quote) {
      budgetLabor = quote.labor_total || 0
      budgetMaterial = quote.material_total || 0
    }
  }

  // Hämta godkända ÄTA
  const { data: changes } = await supabase
    .from('project_change')
    .select('change_type, amount, hours')
    .eq('project_id', projectId)
    .eq('status', 'approved')

  const ataAdditions = (changes || [])
    .filter(c => c.change_type === 'addition' || c.change_type === 'change')
    .reduce((sum, c) => sum + (c.amount || 0), 0)
  const ataHours = (changes || []).reduce((sum, c) => sum + (c.hours || 0), 0)

  // Hämta extrakostnader
  const { data: extraCosts } = await supabase
    .from('project_cost')
    .select('amount')
    .eq('project_id', projectId)

  const actualExtraCost = (extraCosts || []).reduce((sum, c) => sum + (c.amount || 0), 0)

  // Beräkna
  const budgetAmount = project.budget_amount || 0
  const budgetHours = project.budget_hours || 0
  const actualHours = project.actual_hours || 0
  const actualLaborCost = project.actual_labor_cost || 0
  const actualMaterialCost = project.actual_material_cost || 0
  const actualTotalCost = actualLaborCost + actualMaterialCost + actualExtraCost

  const totalBudget = budgetAmount + ataAdditions
  const totalBudgetHours = budgetHours + ataHours

  const completionPercent = totalBudgetHours > 0
    ? Math.round((actualHours / totalBudgetHours) * 100)
    : 0
  const costPercent = totalBudget > 0
    ? Math.round((actualTotalCost / totalBudget) * 100)
    : 0

  const margin = totalBudget - actualTotalCost
  const marginPercent = totalBudget > 0
    ? Math.round((margin / totalBudget) * 100)
    : 0

  // Prognos: om vi är 50% klara och har använt X kr → slutkostnaden blir ~X/0.5
  const projectedFinalCost = completionPercent > 10
    ? Math.round(actualTotalCost / (completionPercent / 100))
    : actualTotalCost
  const projectedOverrun = Math.max(0, projectedFinalCost - totalBudget)

  // Status
  let status: 'on_track' | 'at_risk' | 'over_budget' = 'on_track'
  if (costPercent > 95) status = 'over_budget'
  else if (costPercent > 75) status = 'at_risk'

  return {
    project_id: project.project_id,
    project_name: project.name || '',
    budget_amount: budgetAmount,
    budget_hours: budgetHours,
    budget_labor: budgetLabor,
    budget_material: budgetMaterial,
    actual_hours: Math.round(actualHours * 100) / 100,
    actual_labor_cost: Math.round(actualLaborCost),
    actual_material_cost: Math.round(actualMaterialCost),
    actual_extra_cost: Math.round(actualExtraCost),
    actual_total_cost: Math.round(actualTotalCost),
    ata_additions: Math.round(ataAdditions),
    ata_hours: Math.round(ataHours * 100) / 100,
    total_budget: Math.round(totalBudget),
    completion_percent: completionPercent,
    cost_percent: costPercent,
    margin: Math.round(margin),
    margin_percent: marginPercent,
    projected_final_cost: projectedFinalCost,
    projected_overrun: projectedOverrun,
    status,
  }
}

/**
 * Karin-varning: kolla alla aktiva projekt och skapa varningar vid behov.
 */
export async function checkProfitabilityWarnings(businessId: string): Promise<number> {
  const supabase = getServerSupabase()

  const { data: projects } = await supabase
    .from('project')
    .select('project_id, name, budget_amount, actual_hours, actual_labor_cost, actual_material_cost, budget_hours')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .gt('budget_amount', 0)

  if (!projects || projects.length === 0) return 0

  let warningsCreated = 0

  for (const project of projects) {
    const prof = await calculateProfitability(project.project_id, businessId)
    if (!prof || prof.status === 'on_track') continue

    // Kolla om vi redan skapat en varning för detta projekt idag
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'profitability_warning')
      .gte('created_at', today)
      .contains('payload', { project_id: project.project_id })
      .limit(1)

    if (existing && existing.length > 0) continue

    // Skapa varning
    const isOverBudget = prof.status === 'over_budget'
    const title = isOverBudget
      ? `Budget överskriden — ${prof.project_name}`
      : `Riskerar överskridning — ${prof.project_name}`

    const description = isOverBudget
      ? `${prof.cost_percent}% av budget använt. Prognos: ${formatSEK(prof.projected_final_cost)} (budget: ${formatSEK(prof.total_budget)}). Skapa ÄTA-tillägg?`
      : `${prof.cost_percent}% av budget använt (${formatSEK(prof.actual_total_cost)} av ${formatSEK(prof.total_budget)}). Tid: ${prof.actual_hours}h / ${prof.budget_hours}h.`

    await supabase.from('pending_approvals').insert({
      business_id: businessId,
      approval_type: 'profitability_warning',
      title: `${isOverBudget ? '🔴' : '⚠️'} ${title}`,
      description,
      status: 'pending',
      priority: isOverBudget ? 'high' : 'medium',
      payload: {
        agent_id: 'karin',
        project_id: prof.project_id,
        project_name: prof.project_name,
        cost_percent: prof.cost_percent,
        margin_percent: prof.margin_percent,
        projected_overrun: prof.projected_overrun,
        status: prof.status,
      },
    })

    // Push-notis till hantverkaren — realtidslarm
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    fetch(`${APP_URL}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        title: isOverBudget ? '🔴 Budget överskriden' : '⚠️ Lönsamhetslarm',
        body: `${prof.project_name}: ${prof.cost_percent}% av budget använt${isOverBudget ? ' — skapa ÄTA?' : ''}`,
        url: `/dashboard/projects/${prof.project_id}`,
      }),
    }).catch(() => {})

    warningsCreated++
  }

  return warningsCreated
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'decimal', maximumFractionDigits: 0 }).format(amount) + ' kr'
}
