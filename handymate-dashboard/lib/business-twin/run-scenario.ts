/**
 * Tenantbunden dataladdare för Business Twin Scenario Engine V1.
 *
 * Den här filen är den enda I/O-gränsen. Alla uppslag filtreras uttryckligt
 * på business_id och alla källfel kastas — ett trasigt uppslag får aldrig se
 * ut som noll kronor. Själva scenariomatiken bor i scenario-engine.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleCashRadar } from '@/lib/cash-radar-data'
import { svDateStr } from '@/lib/dates'
import { getExplicitMarginTarget } from '@/lib/profitability'
import { computeProjectEconomics } from '@/lib/projects/compute-economics'
import { buildProjectMarginFingerprint } from './forecast-fingerprint'
import type {
  BusinessScenarioKind,
  BusinessScenarioResult,
  ProjectMarginWatchRequest,
} from './scenario-contract'
import {
  buildBlockedBusinessScenario,
  simulateCashDelay,
  simulateProjectMargin,
  simulateRevenuePace,
} from './scenario-engine'

export interface BusinessScenarioRequest {
  scenario_type: BusinessScenarioKind
  project_id?: string
  project_name?: string
  extra_hours?: number
  material_cost_change_pct?: number
  additional_revenue_kr?: number
  delay_days?: number
  invoice_amount_kr?: number
}

interface ProjectRef {
  project_id: string
  name: string | null
  status: string | null
}

function nowIso(now: Date): string {
  return now.toISOString()
}

function block(kind: BusinessScenarioKind, reason: string, now: Date): BusinessScenarioResult {
  const titles: Record<BusinessScenarioKind, string> = {
    project_margin: 'Om jobbet förändras',
    cash_delay: 'Om kundbetalningarna dröjer',
    revenue_pace: 'Om ni fakturerar mer nu',
  }
  return buildBlockedBusinessScenario({
    kind,
    title: titles[kind],
    subject: kind === 'project_margin' ? 'Projekt' : kind === 'cash_delay' ? 'Kommande fem veckor' : 'Årsmålet',
    reason,
    nowIso: nowIso(now),
  })
}

async function resolveProject(
  supabase: SupabaseClient,
  businessId: string,
  input: BusinessScenarioRequest,
): Promise<{ project: ProjectRef | null; reason?: string }> {
  if (input.project_id) {
    const { data, error } = await supabase
      .from('project')
      .select('project_id, name, status')
      .eq('business_id', businessId)
      .eq('project_id', input.project_id)
      .maybeSingle()
    if (error) throw new Error(`Projektuppslag misslyckades: ${error.message}`)
    return data
      ? { project: data as ProjectRef }
      : { project: null, reason: 'Projektet finns inte i det här företaget.' }
  }

  const query = String(input.project_name || '').trim().toLocaleLowerCase('sv-SE')
  if (!query) return { project: null, reason: 'Ange vilket projekt scenariot gäller.' }

  const { data, error } = await supabase
    .from('project')
    .select('project_id, name, status')
    .eq('business_id', businessId)
    .limit(100)
  if (error) throw new Error(`Projektuppslag misslyckades: ${error.message}`)

  const projects = (data || []) as ProjectRef[]
  const exact = projects.filter(p => String(p.name || '').trim().toLocaleLowerCase('sv-SE') === query)
  const matches = exact.length > 0
    ? exact
    : projects.filter(p => String(p.name || '').toLocaleLowerCase('sv-SE').includes(query))
  if (matches.length === 1) return { project: matches[0] }
  if (matches.length === 0) return { project: null, reason: `Jag hittar inget projekt som matchar ”${input.project_name}”.` }

  const names = matches.slice(0, 4).map(p => p.name || p.project_id).join(', ')
  return { project: null, reason: `Flera projekt matchar: ${names}. Välj ett projekt innan scenariot körs.` }
}

/** Kör ett läsande scenario mot det autentiserade företagets faktiska data. */
export async function runBusinessScenario(
  supabase: SupabaseClient,
  businessId: string,
  input: BusinessScenarioRequest,
  now = new Date(),
): Promise<BusinessScenarioResult> {
  if (input.scenario_type === 'project_margin') {
    const resolved = await resolveProject(supabase, businessId, input)
    if (!resolved.project) return block('project_margin', resolved.reason || 'Projektet kunde inte bestämmas.', now)

    const economics = await computeProjectEconomics(supabase, resolved.project.project_id, businessId)
    if (!economics) return block('project_margin', 'Projektets ekonomi kunde inte läsas.', now)
    const explicitMarginTargetPct = await getExplicitMarginTarget(supabase, businessId)

    const result = simulateProjectMargin({
      projectId: resolved.project.project_id,
      projectName: resolved.project.name || 'Namnlöst projekt',
      economics,
      extraHours: Number(input.extra_hours || 0),
      materialCostChangePct: Number(input.material_cost_change_pct || 0),
      additionalRevenueKr: Number(input.additional_revenue_kr || 0),
      explicitMarginTargetPct,
      nowIso: nowIso(now),
    })
    if (result.status !== 'ready' || resolved.project.status === 'completed') return result

    const request: ProjectMarginWatchRequest = {
      scenario_type: 'project_margin',
      project_id: resolved.project.project_id,
      extra_hours: Number(input.extra_hours ?? 0),
      material_cost_change_pct: Number(input.material_cost_change_pct ?? 0),
      additional_revenue_kr: Number(input.additional_revenue_kr ?? 0),
    }
    return {
      ...result,
      watch: {
        projectId: resolved.project.project_id,
        fingerprint: buildProjectMarginFingerprint(request, result),
        request,
      },
    }
  }

  if (input.scenario_type === 'cash_delay') {
    const radar = await assembleCashRadar(supabase, businessId)
    return simulateCashDelay({
      weeks: radar.weeks,
      normalKr: radar.normal_kr,
      normalReady: radar.ready,
      delayDays: Number(input.delay_days),
      nowIso: nowIso(now),
    })
  }

  if (input.scenario_type === 'revenue_pace') {
    const today = svDateStr(now)
    const year = today.slice(0, 4)
    const [configResult, invoiceResult] = await Promise.all([
      supabase
        .from('business_config')
        .select('revenue_target_annual_sek')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase
        .from('invoice')
        .select('total')
        .eq('business_id', businessId)
        .not('status', 'in', '("draft","cancelled","credited")')
        .gte('invoice_date', `${year}-01-01`)
        .lte('invoice_date', today),
    ])
    if (configResult.error) throw new Error(`Måluppslag misslyckades: ${configResult.error.message}`)
    if (invoiceResult.error) throw new Error(`Fakturauppslag misslyckades: ${invoiceResult.error.message}`)

    const targetRaw = configResult.data?.revenue_target_annual_sek
    const target = targetRaw == null ? null : Number(targetRaw)
    const invoicedYtd = (invoiceResult.data || []).reduce((sum, row) => sum + (Number(row.total) || 0), 0)
    return simulateRevenuePace({
      revenueTargetAnnualSek: target,
      invoicedYtdSek: invoicedYtd,
      additionalInvoiceKr: Number(input.invoice_amount_kr),
      todayIso: today,
      nowIso: nowIso(now),
    })
  }

  return block('revenue_pace', 'Okänd scenariotyp.', now)
}
