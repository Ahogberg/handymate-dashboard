/**
 * V25 — Lönsamhetsanalys
 *
 * Beräknar projektlönsamhet baserat på offert, tid, material, ÄTA och extrakostnader.
 * Karins varningar triggas vid 75%, 90% och 100%+ av budget.
 */

import { getServerSupabase } from '@/lib/supabase'
import { computeProjectEconomics } from '@/lib/projects/compute-economics'
import { byggLonsamhetsVarning } from '@/lib/projects/margin-guardian'

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

/**
 * @deprecated (2026-08-12) Sista anroparen migrerad till computeProjectEconomics
 * (lib/projects/compute-economics.ts) samma dag — mobile-profitability-routen,
 * agentverktyget get_project_profitability, Karins observationsunderlag och
 * Daniels offert-intelligens. Läser stale project.actual_*-snapshotkolumner
 * som en DB-trigger fyller med KUNDENS pris (time_entry.hourly_rate) i
 * stället för intern kostnad — falsk marginal. Lämnad orörd men anropslös;
 * radera i en egen städomgång när ingen ny konsument tillkommit på ett tag.
 */
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
 *
 * Flyttad (2026-08-12) från de legacy `project.actual_*`-snapshotkolumnerna
 * till den kanoniska ekonomimotorn (compute-economics.ts) via
 * lib/projects/margin-guardian.ts. De gamla kolumnerna underhölls av en
 * DB-trigger som räknade arbetskostnad på KUNDPRISET (time_entry.hourly_rate),
 * missade supplier_invoices helt och räknade bara ÄTA med status 'approved'
 * (aldrig kundsignerade 'signed'). calculateProfitability() ovan rör vi INTE
 * — den har andra konsumenter kvar.
 *
 * Dedup: pending-livstid, inte per dag. Ett projekt i riskzonen ska hålla
 * SAMMA kort (uppdaterat) tills det löses — inte stapla ett nytt varje dygn.
 * Ett projekt som friskförklaras (kortet avvisas/godkänns) och senare
 * försämras igen ska däremot få ett nytt kort — därför dedupas bara mot
 * status='pending', inte mot hela projektets historik.
 */
export async function checkProfitabilityWarnings(businessId: string): Promise<number> {
  const supabase = getServerSupabase()

  const { data: projects } = await supabase
    .from('project')
    .select('project_id, name, budget_hours, budget_amount')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .gt('budget_amount', 0)

  if (!projects || projects.length === 0) return 0

  let warningsCreated = 0

  for (const project of projects) {
    const economics = await computeProjectEconomics(supabase, project.project_id, businessId)
    if (!economics) continue

    // Äldsta obesvarade ÄTA-förslags-kort för projektet — dess ålder är en
    // av orsaksraderna (ett förslag som väntat länge kostar tid och pengar).
    const { data: ataCards } = await supabase
      .from('pending_approvals')
      .select('id, created_at')
      .eq('business_id', businessId)
      .eq('approval_type', 'create_ata_draft')
      .eq('status', 'pending')
      .contains('payload', { project_id: project.project_id })
      .order('created_at', { ascending: true })
      .limit(1)

    const oldestAta = ataCards?.[0]
    const aldstaDagar = oldestAta
      ? Math.floor((Date.now() - new Date(oldestAta.created_at).getTime()) / (24 * 60 * 60 * 1000))
      : null

    const result = byggLonsamhetsVarning(
      economics,
      { project_id: project.project_id, name: project.name || '', budget_hours: project.budget_hours || 0 },
      { aldsta_dagar: aldstaDagar, approval_id: oldestAta?.id ?? null },
    )
    if (!result) continue

    const isOverBudget = result.status === 'over_budget'
    const title = isOverBudget
      ? `Budget överskriden — ${project.name}`
      : `Riskerar överskridning — ${project.name}`

    const enMening = isOverBudget
      ? `${result.cost_percent}% av kalkylerad kostnad använt — budgeten är överskriden.`
      : `${result.cost_percent}% av kalkylerad kostnad använt.`
    const description = result.orsaker.length > 0
      ? `${enMening} Orsaker: ${result.orsaker.map(o => o.text).join(' · ')}`
      : enMening

    const payload = {
      agent_id: 'karin',
      project_id: project.project_id,
      project_name: project.name,
      cost_percent: result.cost_percent,
      margin_percent: result.margin_percent,
      projected_overrun: result.projected_overrun,
      status: result.status,
      orsaker: result.orsaker,
      // Gratis radrendering på Jarvis-hemmet (JarvisHome.tsx:1158-1173) —
      // samma preview.items-form som create_ata_draft och review_auto_invoice.
      preview: {
        items: result.orsaker.map(o => ({
          description: o.kind === 'UPPSKATTAT' ? `${o.text} (uppskattat)` : o.text,
          amount_kr: o.amount_kr,
        })),
      },
    }
    const riskLevel = isOverBudget ? 'high' : 'medium'
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: existing } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'profitability_warning')
      .eq('status', 'pending')
      .contains('payload', { project_id: project.project_id })
      .limit(1)

    if (existing && existing.length > 0) {
      await supabase
        .from('pending_approvals')
        .update({
          title: `${isOverBudget ? '🔴' : '⚠️'} ${title}`,
          description,
          payload,
          risk_level: riskLevel,
          expires_at: expiresAt,
        })
        .eq('id', existing[0].id)
      continue
    }

    await supabase.from('pending_approvals').insert({
      business_id: businessId,
      approval_type: 'profitability_warning',
      title: `${isOverBudget ? '🔴' : '⚠️'} ${title}`,
      description,
      status: 'pending',
      risk_level: riskLevel,
      expires_at: expiresAt,
      payload,
    })

    // Push-notis till hantverkaren — realtidslarm. Bara vid FÖRSTA kortet för
    // ett projekt, inte varje gång cronen uppdaterar ett redan pending kort
    // (samma buggklass som 8394ac9d/ee73c915 — trösklar som fyrar om varje
    // körning så länge villkoret förblir sant).
    //
    // Bara over_budget pushar. at_risk (75%) är information — hantverkaren ser
    // kortet i kön ändå — medan over_budget (95%) är ett larm. Att pusha på
    // båda ger notiströtthet: 75%-varningen är väntad i de flesta projekt
    // mot slutet och skulle bli brus.
    if (isOverBudget) {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      try {
        await fetch(`${APP_URL}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            title: '🔴 Budget överskriden',
            body: `${project.name}: ${result.cost_percent}% av kalkylen använt — skapa ÄTA?`,
            url: `/dashboard/projects/${project.project_id}`,
          }),
        })
      } catch {
        // Push är best-effort — kortet finns i kön oavsett.
      }
    }

    warningsCreated++
  }

  return warningsCreated
}
