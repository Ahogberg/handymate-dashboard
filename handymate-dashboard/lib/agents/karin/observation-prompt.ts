/**
 * Karins observation-pipeline — Väg 1 Commit 3 (hypotes-driven revised).
 *
 * Skiftar från generisk "tänk noga"-prompt till hypotes-driven analys
 * baserad på kvalificerade hypoteser om svenska hantverkar-verksamheter.
 * Karin får fyra konkreta fokus-områden att leta i:
 *   1. Betalningsmönster per kund-typ (BRF/privat/företag)
 *   2. Lönsamhets-trender (material-tunga vs arbetskraft-tunga projekt)
 *   3. Pricing-möjligheter (timpris-stagnation, kund-elasticitet)
 *   4. Cash flow-risker (specifika kunder på gränsen)
 *
 * Tre-nivåer fallback baserat på data-mognad:
 *   - 0-4 fakturor: skip ('insufficient_data')
 *   - 5-9 fakturor: 'early_stage' — relation-byggande observation
 *   - 10+ fakturor: 'full_analysis' — hypotes-driven djupanalys
 *
 * Extended-thinking budget 8000 tokens via raw fetch (SDK 0.17.0 i
 * repot är för gammal för thinking-parametern).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEMA_BLOCK } from '@/lib/agents/shared/schema-block'
import { type AgentObservation } from '@/lib/agents/shared/normalize'
import {
  InvoiceRow,
  ProjectRow,
  QuoteRow,
  InvoiceStats,
  computeInvoiceStats,
  ymKey,
} from '@/lib/agents/shared/business-aggregate'
import {
  callAgentWithThinking,
  type AgentDebugInfo,
} from '@/lib/agents/shared/thinking-call'
import { saveAndPush } from '@/lib/agents/shared/save-and-push'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

// KarinObservation är ett alias för den delade AgentObservation-typen.
// Behålls som re-export för bakåt-kompatibilitet med call-sites som
// importerar KarinObservation direkt.
export type KarinObservation = AgentObservation

export interface KarinRunResult {
  skipped?: string
  reason?: string
  aggregate?: KarinAggregate
  data_maturity?: 'early_stage' | 'full_analysis'
  observations_total?: number
  saved?: number
  approvals_created?: number
  insights_pushed?: number
  thinking_preview?: string
  error?: string
  debug?: KarinDebugInfo
}

// Bump denna sträng vid varje meningsfull ändring av observation-pipeline.
// Syns i debug-response så vi direkt kan verifiera att rätt deploy kör.
// v3 (2026-05-15 deploy-check): bumpa för att verifiera att Vercel faktiskt
// deployar denna fil. Test-endpoint visar fortfarande gammal validator-text
// "missing title,observation" som inte finns någonstans i nuvarande kod —
// indikerar att Vercel kör äldre commit. Trigga test-endpoint efter push och
// kolla result.debug.code_version: matchar = ny kod kör; matchar inte =
// deploy-problem (kolla Vercel dashboard, build-status, branch-konfiguration).
export const KARIN_CODE_VERSION = 'shared-extract-A2-2026-05-18'

// KarinDebugInfo är ett alias för AgentDebugInfo från shared.
// Behålls som re-export för bakåt-kompatibilitet.
export type KarinDebugInfo = AgentDebugInfo

// InvoiceRow, ProjectRow, QuoteRow, InvoiceStats, computeInvoiceStats, ymKey
// importerade från @/lib/agents/shared/business-aggregate (Phase A2).

export interface KarinAggregate {
  period_days: 90
  last_90d: InvoiceStats
  trend_30d_vs_prev_30d: {
    last_30d_invoiced_kr: number
    prev_30d_invoiced_kr: number
    pct_change: number | null
  }
  by_customer_type: Record<string, InvoiceStats>
  sent_pending_breakdown: {
    total_outstanding_kr: number
    avg_days_old: number | null
    oldest_days: number | null
    oldest_invoice_number: string | null
  }
  projects_90d: {
    total_count: number
    completed_count: number
    over_budget_count: number
    at_risk_count: number
    over_budget_samples: Array<{
      project_id: string
      name: string
      budget_amount: number
      actual_total_cost: number
      pct_over: number
    }>
    avg_margin_pct: number | null
  }
  quotes_90d: {
    total_count: number
    sent_count: number
    accepted_count: number
    declined_count: number
    acceptance_rate_pct: number
    avg_days_to_acceptance: number | null
    accepted_total_kr: number
  }
  cash_flow_3mo: Array<{
    month: string
    paid_kr: number
    pending_due_kr: number
  }>
}

// ─────────────────────────────────────────────────────────────────
// Aggregation (Karin-specifik — invoice + projects + quotes + cash flow)
// computeInvoiceStats + ymKey importerade från shared/business-aggregate
// ─────────────────────────────────────────────────────────────────

async function buildAggregate(
  supabase: SupabaseClient,
  businessId: string,
): Promise<KarinAggregate | null> {
  const now = Date.now()
  const ninetyDaysAgo = new Date(now - 90 * 86400000)
  const sixtyDaysAgo = new Date(now - 60 * 86400000)
  const thirtyDaysAgo = new Date(now - 30 * 86400000)

  // ── Invoices (90d) ─────────────────────────────────────────
  const { data: invoicesData, error: invoicesError } = await supabase
    .from('invoice')
    .select('invoice_id, invoice_number, customer_id, total, invoice_date, due_date, paid_at, status, rot_work_cost, rot_rut_deduction, rot_rut_type')
    .eq('business_id', businessId)
    .gte('invoice_date', ninetyDaysAgo.toISOString())

  if (invoicesError) {
    console.error('[karin/aggregate] invoice query error:', invoicesError)
    return null
  }

  if (!invoicesData || invoicesData.length === 0) {
    return null
  }

  const invoices = invoicesData as InvoiceRow[]
  const last90d = computeInvoiceStats(invoices)

  // Trend 30d vs prev 30d
  const last30d = invoices.filter(i => new Date(i.invoice_date) >= thirtyDaysAgo)
  const prev30d = invoices.filter(i => {
    const d = new Date(i.invoice_date)
    return d >= sixtyDaysAgo && d < thirtyDaysAgo
  })
  const last30Total = last30d.reduce((s, i) => s + Number(i.total || 0), 0)
  const prev30Total = prev30d.reduce((s, i) => s + Number(i.total || 0), 0)
  const pctChange =
    prev30Total > 0 ? Math.round(((last30Total - prev30Total) / prev30Total) * 100) : null

  // ── Customer types ─────────────────────────────────────────
  const customerIds = Array.from(
    new Set(invoices.map(r => r.customer_id).filter((id): id is string => !!id)),
  )

  const customerTypeMap: Record<string, string> = {}
  const customerNameMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, customer_type, name')
      .in('customer_id', customerIds)
      .eq('business_id', businessId)
    for (const c of customers || []) {
      // Härled BRF från namn-mönster om customer_type saknas
      const declaredType = c.customer_type
      const name = (c.name || '').toLowerCase()
      const likelyBrf = !declaredType && (name.includes('brf') || name.includes('bostadsrätts'))
      customerTypeMap[c.customer_id] = declaredType || (likelyBrf ? 'brf' : 'private')
      customerNameMap[c.customer_id] = c.name || ''
    }
  }

  const byType: Record<string, InvoiceRow[]> = {}
  for (const r of invoices) {
    const type = r.customer_id ? customerTypeMap[r.customer_id] || 'unknown' : 'no_customer'
    if (!byType[type]) byType[type] = []
    byType[type].push(r)
  }
  const byCustomerType: Record<string, InvoiceStats> = {}
  for (const [type, rs] of Object.entries(byType)) {
    byCustomerType[type] = computeInvoiceStats(rs)
  }

  // ── Sent-pending breakdown ─────────────────────────────────
  const sentPending = invoices.filter(i => i.status === 'sent')
  const totalOutstanding = sentPending.reduce((s, i) => s + Number(i.total || 0), 0)
  let avgAgeDays: number | null = null
  let oldestDays: number | null = null
  let oldestInvoiceNumber: string | null = null
  if (sentPending.length > 0) {
    const withAges = sentPending.map(i => ({
      i,
      age: (now - new Date(i.invoice_date).getTime()) / 86400000,
    }))
    avgAgeDays = Math.round(withAges.reduce((s, x) => s + x.age, 0) / withAges.length)
    const oldest = withAges.reduce((m, x) => (x.age > m.age ? x : m), withAges[0])
    oldestDays = Math.round(oldest.age)
    oldestInvoiceNumber = oldest.i.invoice_number
  }

  // ── Projects (90d) ─────────────────────────────────────────
  const { data: projectsData } = await supabase
    .from('project')
    .select('project_id, name, customer_id, status, budget_hours, budget_amount, actual_hours, actual_labor_cost, actual_material_cost, profitability_status, completed_at, created_at')
    .eq('business_id', businessId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(200)

  const projects = (projectsData || []) as Array<ProjectRow & { created_at: string }>
  const completedProjects = projects.filter(p => p.status === 'completed')
  const overBudget = projects.filter(p => p.profitability_status === 'over_budget')
  const atRisk = projects.filter(p => p.profitability_status === 'at_risk')

  const overBudgetSamples = overBudget
    .map(p => {
      const totalCost = Number(p.actual_labor_cost || 0) + Number(p.actual_material_cost || 0)
      const budget = Number(p.budget_amount || 0)
      const pctOver = budget > 0 ? Math.round(((totalCost - budget) / budget) * 100) : 0
      return {
        project_id: p.project_id,
        name: p.name || '(namnlöst)',
        budget_amount: Math.round(budget),
        actual_total_cost: Math.round(totalCost),
        pct_over: pctOver,
      }
    })
    .sort((a, b) => b.pct_over - a.pct_over)
    .slice(0, 5)

  let avgMarginPct: number | null = null
  const completedWithBudget = completedProjects.filter(p => Number(p.budget_amount || 0) > 0)
  if (completedWithBudget.length > 0) {
    const margins = completedWithBudget.map(p => {
      const cost = Number(p.actual_labor_cost || 0) + Number(p.actual_material_cost || 0)
      const budget = Number(p.budget_amount || 0)
      return budget > 0 ? ((budget - cost) / budget) * 100 : 0
    })
    avgMarginPct = Math.round(margins.reduce((s, m) => s + m, 0) / margins.length)
  }

  // ── Quotes (90d) ───────────────────────────────────────────
  const { data: quotesData } = await supabase
    .from('quotes')
    .select('quote_id, status, total, signed_at, accepted_at, created_at')
    .eq('business_id', businessId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(200)

  const quotes = (quotesData || []) as QuoteRow[]
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted' || q.status === 'signed')
  const declinedQuotes = quotes.filter(q => q.status === 'declined')
  const sentQuotes = quotes.filter(q => q.status === 'sent')
  const acceptedTotal = acceptedQuotes.reduce((s, q) => s + Number(q.total || 0), 0)
  const evaluatedQuotes = acceptedQuotes.length + declinedQuotes.length
  const acceptanceRate = evaluatedQuotes > 0
    ? Math.round((acceptedQuotes.length / evaluatedQuotes) * 100)
    : 0

  let avgDaysToAcceptance: number | null = null
  const acceptedWithDates = acceptedQuotes.filter(q => q.accepted_at && q.created_at)
  if (acceptedWithDates.length > 0) {
    const days = acceptedWithDates.map(q =>
      (new Date(q.accepted_at as string).getTime() - new Date(q.created_at).getTime()) / 86400000,
    )
    avgDaysToAcceptance = Math.round(days.reduce((s, d) => s + d, 0) / days.length)
  }

  // ── Cash flow per månad (senaste 3) ────────────────────────
  const monthBuckets: Record<string, { paid: number; pendingDue: number }> = {}
  for (let i = 0; i < 3; i++) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    monthBuckets[ymKey(d)] = { paid: 0, pendingDue: 0 }
  }

  for (const inv of invoices) {
    if (inv.status === 'paid' && inv.paid_at) {
      const key = ymKey(new Date(inv.paid_at))
      if (monthBuckets[key]) monthBuckets[key].paid += Number(inv.total || 0)
    }
    if (inv.status === 'sent' && inv.due_date) {
      const key = ymKey(new Date(inv.due_date))
      if (monthBuckets[key]) monthBuckets[key].pendingDue += Number(inv.total || 0)
    }
  }
  const cashFlow3Mo = Object.entries(monthBuckets)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => ({
      month,
      paid_kr: Math.round(v.paid),
      pending_due_kr: Math.round(v.pendingDue),
    }))

  return {
    period_days: 90,
    last_90d: last90d,
    trend_30d_vs_prev_30d: {
      last_30d_invoiced_kr: Math.round(last30Total),
      prev_30d_invoiced_kr: Math.round(prev30Total),
      pct_change: pctChange,
    },
    by_customer_type: byCustomerType,
    sent_pending_breakdown: {
      total_outstanding_kr: Math.round(totalOutstanding),
      avg_days_old: avgAgeDays,
      oldest_days: oldestDays,
      oldest_invoice_number: oldestInvoiceNumber,
    },
    projects_90d: {
      total_count: projects.length,
      completed_count: completedProjects.length,
      over_budget_count: overBudget.length,
      at_risk_count: atRisk.length,
      over_budget_samples: overBudgetSamples,
      avg_margin_pct: avgMarginPct,
    },
    quotes_90d: {
      total_count: quotes.length,
      sent_count: sentQuotes.length,
      accepted_count: acceptedQuotes.length,
      declined_count: declinedQuotes.length,
      acceptance_rate_pct: acceptanceRate,
      avg_days_to_acceptance: avgDaysToAcceptance,
      accepted_total_kr: Math.round(acceptedTotal),
    },
    cash_flow_3mo: cashFlow3Mo,
  }
}

// ─────────────────────────────────────────────────────────────────
// Hypotes-driven prompt
// SCHEMA_BLOCK importerad från lib/agents/shared/schema-block.ts
// ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(businessName: string, maturity: 'early_stage' | 'full_analysis'): string {
  if (maturity === 'early_stage') {
    return `Du är Karin, ekonomi-ansvarig hos ${businessName}. Du är ny på företaget och har precis fått tillgång till siffrorna.

Du ser att det finns lite data — färre än 10 fakturor. Det räcker inte för djupanalys, men det är dags att presentera sig och bygga relation.

Generera EXAKT 1 observation av typen "early-stage relation-byggande". Anpassa siffrorna till verkliga aggregatet du får. Var vänlig, professionell, kort.

REGLER:
- 1 observation, inte fler.
- knowledge_type: 'insight'
- suggestion: null (ren introduktion, ingen action)
- confidence: 0.9 (du är säker på att du är ny)
- data_basis: { period_days, invoice_count, customer_count, note: 'early_stage_introduction' }

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen, anpassa siffrorna:

[
  {
    "knowledge_type": "insight",
    "title": "Jag börjar förstå din verksamhet",
    "observation": "Hej! Jag är Karin, din nya ekonomi-ansvarig. Hittills har jag sett 7 fakturor till 4 kunder de senaste 90 dagarna — det räcker för att börja känna mönstret. Säg gärna till om något specifikt du vill att jag håller extra koll på framöver.",
    "suggestion": null,
    "confidence": 0.9,
    "data_basis": {
      "period_days": 90,
      "invoice_count": 7,
      "customer_count": 4,
      "note": "early_stage_introduction"
    }
  }
]`
  }

  return `Du är Karin, ekonomi-ansvarig hos ${businessName}. Analysera datan med dessa konkreta hypoteser om svenska hantverkar-verksamheter:

1. **Betalningsmönster per kund-typ:**
   - Betalar BRF-kunder senare än privatkunder? Hur många dagar i snitt?
   - Är det en specifik kund som drar upp BRF-snittet?
   - Behöver förfallodatum justeras per kund-typ?

2. **Lönsamhets-trender:**
   - Är material-tunga projekt mindre lönsamma än arbetskraft-tunga?
   - Vilka projekt har gått 20%+ över estimat (ÄTA-kandidater)?
   - Finns kund-typer med systematiskt lägre marginal?

3. **Pricing-möjligheter:**
   - När justerades timpris senast? (Indirekt: har avg pris/h ökat eller stått stilla?)
   - Har material-kostnader ökat utan motsvarande prisjustering?
   - Finns återkommande kunder som kan tåla 5-7% prisjustering?

4. **Cash flow-risker:**
   - Vilken månad har störst cash flow-dipp på grund av sena betalningar?
   - Finns specifika kunder som alltid ligger på gränsen?

Generera 1-3 KORTA observationer (max 2 meningar var) med konkret suggestion när det är vettigt.

Var inte trivial. "Du har X förfallna fakturor" = data, inte observation.
"BRF Lindgården betalar 12d senare än snittet — vill du justera deras förfallodatum till 45 dagar?" = observation.

REGLER:
- 1-3 observationer max. Färre är bättre om du inte ser något viktigt.
- "title" max 60 tecken, konkret.
- "observation" max 2-3 meningar, första-person, vänlig ton.
- "suggestion" konkret action max 1 mening ELLER null om bara info.
- "confidence" 0-1, var ärlig. Under 0.5 om du gissar.

Om allt ser bra ut — säg det med 1 positiv observation. Återhåll dig från att hitta på problem.

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen:

[
  {
    "knowledge_type": "pattern",
    "title": "BRF betalar 11d senare än privatkunder",
    "observation": "Jag märker att BRF-kunderna betalar i snitt 38 dagar, medan privatkunder ligger på 27 dagar. BRF Lindgården är värst — de drar upp snittet med över två veckor.",
    "suggestion": "Sätt 45 dagars förfallodatum för BRF-kunder framöver.",
    "confidence": 0.85,
    "data_basis": {
      "period_days": 90,
      "metric": "avg_days_to_payment_by_customer_type",
      "brf_avg_dso": 38,
      "private_avg_dso": 27
    }
  }
]`
}

// ─────────────────────────────────────────────────────────────────
// Claude-anrop + save+push: tunna wrappers kring shared-helpers.
// callAgentWithThinking och saveAndPush importerade från shared/.
// ─────────────────────────────────────────────────────────────────

async function callKarinWithThinking(
  businessName: string,
  aggregate: KarinAggregate,
  maturity: 'early_stage' | 'full_analysis',
) {
  const systemPrompt = buildSystemPrompt(businessName, maturity)
  const userMessage = `Här är ${businessName}s siffror senaste 90 dagarna:

${JSON.stringify(aggregate, null, 2)}

Tänk igenom det och returnera JSON-array.`

  return callAgentWithThinking({
    agentId: 'karin',
    codeVersion: KARIN_CODE_VERSION,
    promptMaturity: maturity,
    systemPrompt,
    userMessage,
  })
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export async function runKarinObservation(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  options: { includeDebug?: boolean } = {},
): Promise<KarinRunResult> {
  // Otvetydig entry-log så Vercel function logs direkt visar att den nya
  // koden faktiskt exekveras. Om denna rad inte syns i loggarna kör Vercel
  // en äldre commit — då är frågan deploy/cache, inte normalizer-bugg.
  console.log(`[karin/run] entry version=${KARIN_CODE_VERSION} business=${businessId}`)
  const aggregate = await buildAggregate(supabase, businessId)
  if (!aggregate) {
    return { skipped: 'no_invoices_last_90d' }
  }

  // 3-nivåer fallback baserat på data-mognad
  const invoiceCount = aggregate.last_90d.count
  if (invoiceCount < 5) {
    return {
      skipped: 'insufficient_data',
      reason: 'fewer_than_5_invoices',
      aggregate,
    }
  }

  const maturity: 'early_stage' | 'full_analysis' =
    invoiceCount < 10 ? 'early_stage' : 'full_analysis'

  const { observations, thinkingPreview, debug } = await callKarinWithThinking(
    businessName,
    aggregate,
    maturity,
  )

  if (observations.length === 0) {
    return {
      skipped: 'no_observations_returned',
      aggregate,
      data_maturity: maturity,
      thinking_preview: thinkingPreview,
      ...(options.includeDebug ? { debug } : {}),
    }
  }

  const counts = await saveAndPush(supabase, businessId, 'karin', observations)

  return {
    aggregate,
    data_maturity: maturity,
    observations_total: observations.length,
    thinking_preview: thinkingPreview,
    ...counts,
    ...(options.includeDebug ? { debug } : {}),
  }
}
