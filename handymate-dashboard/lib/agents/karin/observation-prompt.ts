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
import { sendApprovalPush } from '@/lib/notifications/approval-push'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export interface KarinObservation {
  knowledge_type: 'insight' | 'pattern' | 'anomaly' | 'recommendation'
  title: string
  observation: string
  suggestion: string | null
  confidence: number
  data_basis: Record<string, unknown>
}

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

export interface KarinDebugInfo {
  prompt_maturity: 'early_stage' | 'full_analysis'
  system_prompt_length: number
  user_message_length: number
  api_status: number
  api_status_text?: string
  api_error_body?: string
  stop_reason?: string
  content_block_count: number
  content_block_types: string[]
  thinking_full?: string
  raw_text?: string
  raw_text_length: number
  regex_match_found: boolean
  matched_substring?: string
  parse_error?: string
  parsed_count: number
  validation_dropped: number
  validation_drop_reasons?: string[]
  parsed_observations?: KarinObservation[]
}

interface InvoiceRow {
  invoice_id: string
  invoice_number: string | null
  customer_id: string | null
  total: number
  invoice_date: string
  due_date: string | null
  paid_at: string | null
  status: string
  rot_work_cost: number | null
  rot_rut_deduction: number | null
  rot_rut_type: string | null
}

interface ProjectRow {
  project_id: string
  name: string | null
  customer_id: string | null
  status: string
  budget_hours: number | null
  budget_amount: number | null
  actual_hours: number | null
  actual_labor_cost: number | null
  actual_material_cost: number | null
  profitability_status: string | null
  completed_at: string | null
}

interface QuoteRow {
  quote_id: string
  status: string
  total: number | null
  signed_at: string | null
  accepted_at: string | null
  created_at: string
}

interface InvoiceStats {
  count: number
  total_invoiced_kr: number
  total_paid_kr: number
  total_overdue_kr: number
  paid_count: number
  overdue_count: number
  sent_pending_count: number
  avg_days_to_payment: number | null
  payment_rate_percent: number
  rot_invoiced_kr: number
  rot_count: number
}

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
// Aggregation
// ─────────────────────────────────────────────────────────────────

function computeInvoiceStats(invoices: InvoiceRow[]): InvoiceStats {
  const count = invoices.length
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const paid = invoices.filter(i => i.status === 'paid' && i.paid_at)
  const overdue = invoices.filter(i => i.status === 'overdue')
  const sent = invoices.filter(i => i.status === 'sent')

  const totalPaid = paid.reduce((s, i) => s + Number(i.total || 0), 0)
  const totalOverdue = overdue.reduce((s, i) => s + Number(i.total || 0), 0)

  let avgDso: number | null = null
  if (paid.length > 0) {
    const totalDays = paid.reduce((s, i) => {
      const days = (new Date(i.paid_at as string).getTime() - new Date(i.invoice_date).getTime()) / 86400000
      return s + days
    }, 0)
    avgDso = Math.round(totalDays / paid.length)
  }

  const rotInvoices = invoices.filter(i => (Number(i.rot_work_cost) || 0) > 0)
  const rotTotal = rotInvoices.reduce((s, i) => s + Number(i.total || 0), 0)

  return {
    count,
    total_invoiced_kr: Math.round(totalInvoiced),
    total_paid_kr: Math.round(totalPaid),
    total_overdue_kr: Math.round(totalOverdue),
    paid_count: paid.length,
    overdue_count: overdue.length,
    sent_pending_count: sent.length,
    avg_days_to_payment: avgDso,
    payment_rate_percent: count > 0 ? Math.round((paid.length / count) * 100) : 0,
    rot_invoiced_kr: Math.round(rotTotal),
    rot_count: rotInvoices.length,
  }
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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
// ─────────────────────────────────────────────────────────────────

const SCHEMA_BLOCK = `═══ SCHEMA — STRIKT, FÖLJ EXAKT ═══

Returnera ENDAST en JSON-array. Varje observation MÅSTE ha exakt dessa fält:

{
  "knowledge_type": "insight" | "pattern" | "anomaly" | "recommendation",
  "title": string,              // max 60 tecken, kort sammanfattning
  "observation": string,         // 2-3 meningar, full beskrivning
  "suggestion": string | null,   // konkret nästa-steg ELLER null om ren info
  "confidence": number,          // 0-1
  "data_basis": object           // metadata: period_days, metric, relevanta IDs/tal
}

FÖRBJUDNA FÄLT: använd INTE "message", "text", "body", "description", "summary"
eller andra synonyma fält. Den enda "långa" texten heter "observation".

Returnera ARRAY, inte ett enskilt objekt eller en wrapper med "observations"-key.
Ingen prolog, ingen efterord, ingen markdown-fence — bara raw JSON.`

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
// Claude-anrop med extended-thinking
// ─────────────────────────────────────────────────────────────────

async function callKarinWithThinking(
  businessName: string,
  aggregate: KarinAggregate,
  maturity: 'early_stage' | 'full_analysis',
): Promise<{
  observations: KarinObservation[]
  thinkingPreview: string
  debug: KarinDebugInfo
}> {
  const systemPrompt = buildSystemPrompt(businessName, maturity)
  const userMessage = `Här är ${businessName}s siffror senaste 90 dagarna:

${JSON.stringify(aggregate, null, 2)}

Tänk igenom det och returnera JSON-array.`

  const debug: KarinDebugInfo = {
    prompt_maturity: maturity,
    system_prompt_length: systemPrompt.length,
    user_message_length: userMessage.length,
    api_status: 0,
    content_block_count: 0,
    content_block_types: [],
    raw_text_length: 0,
    regex_match_found: false,
    parsed_count: 0,
    validation_dropped: 0,
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[karin/call] ANTHROPIC_API_KEY not set')
    debug.api_error_body = 'ANTHROPIC_API_KEY not configured'
    return { observations: [], thinkingPreview: '', debug }
  }

  // Raw fetch — SDK 0.17.0 är för gammal för thinking-parametern.
  // Sonnet 4.6 stödjer extended-thinking utan beta-header.
  // Budget 8000 av total max 12000 = generöst tankearbete för
  // hypotes-driven analys.
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 12000,
      thinking: { type: 'enabled', budget_tokens: 8000 },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  debug.api_status = response.status
  debug.api_status_text = response.statusText

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error('[karin/call] Anthropic API error:', {
      status: response.status,
      body: errText.slice(0, 500),
    })
    debug.api_error_body = errText.slice(0, 1000)
    return { observations: [], thinkingPreview: `error: ${response.status}`, debug }
  }

  const data: any = await response.json()
  const blocks: Array<{ type: string; text?: string; thinking?: string }> =
    data.content || []

  debug.stop_reason = data.stop_reason
  debug.content_block_count = blocks.length
  debug.content_block_types = blocks.map(b => b.type)

  const thinkingBlock = blocks.find(b => b.type === 'thinking')
  const textBlock = blocks.find(b => b.type === 'text')

  const thinkingFull = thinkingBlock?.thinking || ''
  const thinkingPreview = thinkingFull.slice(0, 300)
  debug.thinking_full = thinkingFull

  // VIKTIGT: använd undefined-check istället för `|| '[]'`-fallback.
  // Den gamla fallbacken maskerade att text-blocket saknades helt —
  // '[]'-string passerar regex-match och JSON.parse, vilket gav tom
  // array istället för tydligt fel. Vi vill veta om Claude faktiskt
  // skickade text eller bara thinking.
  const text = textBlock?.text
  debug.raw_text = text
  debug.raw_text_length = text?.length || 0

  // ALWAYS-on diagnostic-logg så Vercel ser hela bilden vid varje run
  console.log('[karin/call] response shape:', {
    stop_reason: data.stop_reason,
    block_count: blocks.length,
    block_types: blocks.map(b => b.type),
    thinking_length: thinkingFull.length,
    text_present: !!text,
    text_length: text?.length || 0,
    text_preview: text?.slice(0, 200),
  })

  if (!text) {
    console.error('[karin/call] no text block in response — model returned only thinking?')
    return { observations: [], thinkingPreview, debug }
  }

  const match = text.match(/\[[\s\S]*\]/)
  if (!match) {
    console.error('[karin/call] no JSON array in response text:', text.slice(0, 300))
    return { observations: [], thinkingPreview, debug }
  }

  debug.regex_match_found = true
  debug.matched_substring = match[0].slice(0, 1000)

  try {
    const parsedRaw = JSON.parse(match[0]) as unknown[]
    debug.parsed_count = Array.isArray(parsedRaw) ? parsedRaw.length : 0
    debug.parsed_observations = parsedRaw as KarinObservation[]

    const normalizeNotes: string[] = []
    const dropReasons: string[] = []
    const valid: KarinObservation[] = []

    for (let i = 0; i < (parsedRaw as any[]).length; i++) {
      const raw = (parsedRaw as any[])[i]
      const normalized = normalizeObservation(raw, i, normalizeNotes)
      if (normalized) {
        valid.push(normalized)
      } else {
        dropReasons.push(`obs[${i}]: no salvageable observation/message field`)
      }
    }

    debug.validation_dropped = (parsedRaw as any[]).length - valid.length
    debug.validation_drop_reasons = [...dropReasons, ...normalizeNotes]

    if (valid.length === 0 && (parsedRaw as any[]).length > 0) {
      console.warn('[karin/call] parsed observations but all dropped:', dropReasons)
    }
    if (normalizeNotes.length > 0) {
      console.log('[karin/call] schema normalization applied:', normalizeNotes)
    }

    return { observations: valid, thinkingPreview, debug }
  } catch (parseErr) {
    const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
    console.error('[karin/call] JSON parse failed:', errMsg, match[0].slice(0, 300))
    debug.parse_error = errMsg
    return { observations: [], thinkingPreview, debug }
  }
}

// ─────────────────────────────────────────────────────────────────
// Normalizer — räddar observations där Claude använt fel fält-namn
// ─────────────────────────────────────────────────────────────────

const VALID_KNOWLEDGE_TYPES = new Set(['insight', 'pattern', 'anomaly', 'recommendation'])

function normalizeObservation(
  raw: any,
  index: number,
  notes: string[],
): KarinObservation | null {
  if (!raw || typeof raw !== 'object') {
    notes.push(`obs[${index}]: not an object`)
    return null
  }

  // observation: acceptera synonyma fält
  let observation: string | undefined =
    raw.observation || raw.message || raw.text || raw.body || raw.description || raw.summary
  if (!observation || typeof observation !== 'string' || observation.trim().length === 0) {
    return null
  }
  observation = observation.trim()
  if (!raw.observation) {
    notes.push(`obs[${index}]: used fallback field for observation`)
  }

  // title: härled från observation om saknas
  let title: string = (raw.title || '').toString().trim()
  if (!title) {
    // Första meningen (period eller frågetecken eller utropstecken)
    const sentenceMatch = observation.match(/^[^.!?\n]+[.!?]?/)
    title = (sentenceMatch ? sentenceMatch[0] : observation).trim()
    if (title.length > 60) {
      title = title.slice(0, 57).trimEnd() + '…'
    }
    notes.push(`obs[${index}]: title härledd från observation`)
  } else if (title.length > 80) {
    title = title.slice(0, 77).trimEnd() + '…'
  }

  // knowledge_type: default 'insight'
  let knowledgeType = (raw.knowledge_type || raw.type || 'insight').toString().toLowerCase()
  if (!VALID_KNOWLEDGE_TYPES.has(knowledgeType)) {
    notes.push(`obs[${index}]: knowledge_type '${knowledgeType}' okänd, faller till 'insight'`)
    knowledgeType = 'insight'
  }

  // confidence: default 0.5 (medium-osäker)
  let confidence: number
  if (typeof raw.confidence === 'number') {
    confidence = Math.max(0, Math.min(1, raw.confidence))
  } else if (typeof raw.confidence === 'string' && !isNaN(parseFloat(raw.confidence))) {
    confidence = Math.max(0, Math.min(1, parseFloat(raw.confidence)))
    notes.push(`obs[${index}]: confidence string → number`)
  } else {
    confidence = 0.5
    notes.push(`obs[${index}]: confidence saknades, default 0.5`)
  }

  // suggestion: null tolereras, tomt sträng → null
  let suggestion: string | null = null
  const rawSugg = raw.suggestion ?? raw.action ?? raw.next_step
  if (typeof rawSugg === 'string' && rawSugg.trim().length > 0) {
    suggestion = rawSugg.trim()
  }

  // data_basis: tom object om saknas
  const dataBasis: Record<string, unknown> =
    raw.data_basis && typeof raw.data_basis === 'object' ? raw.data_basis : {}

  return {
    knowledge_type: knowledgeType as KarinObservation['knowledge_type'],
    title,
    observation,
    suggestion,
    confidence,
    data_basis: dataBasis,
  }
}

// ─────────────────────────────────────────────────────────────────
// Save + push
// ─────────────────────────────────────────────────────────────────

async function saveAndPush(
  supabase: SupabaseClient,
  businessId: string,
  observations: KarinObservation[],
): Promise<{ saved: number; approvals_created: number; insights_pushed: number }> {
  let saved = 0
  let approvalsCreated = 0
  let insightsPushed = 0

  for (const obs of observations) {
    const { data: savedRow, error: saveErr } = await supabase
      .from('business_knowledge')
      .insert({
        business_id: businessId,
        agent_id: 'karin',
        knowledge_type: obs.knowledge_type,
        title: obs.title,
        observation: obs.observation,
        suggestion: obs.suggestion,
        confidence: obs.confidence,
        data_basis: obs.data_basis,
        status: 'active',
      })
      .select('id')
      .single()

    if (saveErr) {
      console.error('[karin/save] insert error:', saveErr)
      continue
    }
    saved++

    const knowledgeId = savedRow?.id || null

    if (obs.suggestion && obs.suggestion.trim().length > 0) {
      const { data: approval } = await supabase
        .from('pending_approvals')
        .insert({
          business_id: businessId,
          approval_type: 'agent_observation',
          title: obs.title,
          description: obs.observation,
          payload: {
            agent_id: 'karin',
            business_knowledge_id: knowledgeId,
            observation: obs.observation,
            suggestion: obs.suggestion,
            confidence: obs.confidence,
            data_basis: obs.data_basis,
            knowledge_type: obs.knowledge_type,
            routed_agent: 'karin',
          },
          status: 'pending',
          risk_level: obs.confidence > 0.8 ? 'medium' : 'low',
        })
        .select('id')
        .single()

      if (approval?.id && knowledgeId) {
        await supabase
          .from('business_knowledge')
          .update({ related_approval_id: approval.id })
          .eq('id', knowledgeId)
      }

      void sendApprovalPush({
        business_id: businessId,
        approval_type: 'agent_observation',
        payload: {
          agent_id: 'karin',
          title: obs.title,
          observation: obs.observation,
        },
      })
      approvalsCreated++
    } else {
      void sendApprovalPush({
        business_id: businessId,
        approval_type: 'agent_insight',
        payload: {
          agent_id: 'karin',
          title: obs.title,
          observation: obs.observation,
        },
      })
      insightsPushed++
    }
  }

  return { saved, approvals_created: approvalsCreated, insights_pushed: insightsPushed }
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

  const counts = await saveAndPush(supabase, businessId, observations)

  return {
    aggregate,
    data_maturity: maturity,
    observations_total: observations.length,
    thinking_preview: thinkingPreview,
    ...counts,
    ...(options.includeDebug ? { debug } : {}),
  }
}
