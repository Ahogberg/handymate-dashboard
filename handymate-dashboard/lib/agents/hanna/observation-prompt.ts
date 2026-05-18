/**
 * Hannas observation-pipeline — Marknadsansvarig med fokus på reaktivering,
 * säsongs-trender, recension-effektivitet och återkommande-kund-andel.
 *
 * Klonad från Karin-mönstret 2026-05-18 (Phase D1). Använder shared:
 * - lib/agents/shared/schema-block (SCHEMA_BLOCK)
 * - lib/agents/shared/normalize (AgentObservation + normalizeObservation)
 * - lib/agents/shared/thinking-call (callAgentWithThinking + AgentDebugInfo)
 * - lib/agents/shared/save-and-push (saveAndPush med agentId='hanna')
 *
 * 180d-fönster (längre än Daniel/Lars för retention-analys).
 *
 * Tre-nivåer fallback:
 *   - 0 kunder 180d: skip 'no_customers_last_180d'
 *   - 1-4 kunder: skip 'insufficient_data'
 *   - 5-9 kunder: 'early_stage' — relation-byggande
 *   - 10+ kunder: 'full_analysis' — hypotes-driven djupanalys
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEMA_BLOCK } from '@/lib/agents/shared/schema-block'
import { type AgentObservation } from '@/lib/agents/shared/normalize'
import {
  callAgentWithThinking,
  type AgentDebugInfo,
} from '@/lib/agents/shared/thinking-call'
import { saveAndPush } from '@/lib/agents/shared/save-and-push'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export type HannaObservation = AgentObservation
export type HannaDebugInfo = AgentDebugInfo

export const HANNA_CODE_VERSION = 'hanna-v1-2026-05-18'

export interface HannaRunResult {
  skipped?: string
  reason?: string
  aggregate?: HannaAggregate
  data_maturity?: 'early_stage' | 'full_analysis'
  observations_total?: number
  saved?: number
  approvals_created?: number
  insights_pushed?: number
  thinking_preview?: string
  error?: string
  debug?: HannaDebugInfo
}

// ─────────────────────────────────────────────────────────────────
// Aggregate-typer
// ─────────────────────────────────────────────────────────────────

interface CustomerRow {
  customer_id: string
  name: string | null
  customer_type: string | null
  created_at: string
  review_request_sent_at: string | null
}

interface LeadRow {
  lead_id: string
  source: string | null
  status: string
  created_at: string
}

interface InvoiceRow {
  customer_id: string | null
  total: number | null
  created_at: string
}

interface BookingRow {
  customer_id: string | null
  scheduled_start: string | null
  created_at: string
}

export interface HannaAggregate {
  period_days: 180
  customers_180d: {
    total_count: number
    new_count: number
    avg_lifetime_value_kr: number | null
  }
  by_customer_type: Record<
    string,
    {
      count: number
      total_lifetime_value_kr: number
      avg_lifetime_value_kr: number | null
    }
  >
  reactivation_candidates: Array<{
    customer_id: string
    name: string | null
    customer_type: string
    days_since_last_contact: number
    lifetime_value_kr: number
  }>
  leads_by_month: Record<
    string,
    {
      count: number
      won_count: number
      lost_count: number
    }
  >
  review_flow: {
    sent_count: number
    pending_review_count: number
    eligible_count: number
    coverage_pct: number | null
  }
  repeat_customers: {
    customers_with_invoices: number
    repeat_count: number
    repeat_rate_pct: number | null
    avg_invoices_per_repeat: number | null
  }
}

// ─────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────

function ymKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function buildHannaAggregate(
  supabase: SupabaseClient,
  businessId: string,
): Promise<HannaAggregate | null> {
  const now = Date.now()
  const oneHundredEightyDaysAgo = new Date(now - 180 * 86400000)

  // ── Customers (180d, basen för Hanna) ──────────────────────
  const { data: customersData, error: customersError } = await supabase
    .from('customer')
    .select('customer_id, name, customer_type, created_at, review_request_sent_at')
    .eq('business_id', businessId)
    .gte('created_at', oneHundredEightyDaysAgo.toISOString())
    .limit(500)

  if (customersError) {
    console.error('[hanna/aggregate] customers query error:', customersError)
    return null
  }

  // Om < 5 nya kunder, ge tillbaka null så runHannaObservation kan skippa.
  if (!customersData || customersData.length === 0) {
    return null
  }

  const customers = customersData as CustomerRow[]

  // ── Invoices för lifetime-value (180d-fönster) ────────────
  const { data: invoicesData } = await supabase
    .from('invoice')
    .select('customer_id, total, created_at')
    .eq('business_id', businessId)
    .gte('created_at', oneHundredEightyDaysAgo.toISOString())
    .limit(1000)

  const invoices = (invoicesData || []) as InvoiceRow[]

  const invoicesByCustomer: Record<string, InvoiceRow[]> = {}
  for (const inv of invoices) {
    if (!inv.customer_id) continue
    if (!invoicesByCustomer[inv.customer_id]) invoicesByCustomer[inv.customer_id] = []
    invoicesByCustomer[inv.customer_id].push(inv)
  }

  const lifetimeValueByCustomer: Record<string, number> = {}
  for (const [cid, invs] of Object.entries(invoicesByCustomer)) {
    lifetimeValueByCustomer[cid] = invs.reduce((s, i) => s + Number(i.total || 0), 0)
  }

  // ── Bookings för last_contact-härledning (180d-fönster) ───
  const { data: bookingsData } = await supabase
    .from('booking')
    .select('customer_id, scheduled_start, created_at')
    .eq('business_id', businessId)
    .gte('created_at', oneHundredEightyDaysAgo.toISOString())
    .limit(1000)

  const bookings = (bookingsData || []) as BookingRow[]

  // Härlett last_contact_at: max(invoice.created_at, booking.scheduled_start, booking.created_at)
  const lastContactByCustomer: Record<string, number> = {}
  for (const inv of invoices) {
    if (!inv.customer_id) continue
    const ts = new Date(inv.created_at).getTime()
    if (!lastContactByCustomer[inv.customer_id] || ts > lastContactByCustomer[inv.customer_id]) {
      lastContactByCustomer[inv.customer_id] = ts
    }
  }
  for (const b of bookings) {
    if (!b.customer_id) continue
    const ts = Math.max(
      b.scheduled_start ? new Date(b.scheduled_start).getTime() : 0,
      new Date(b.created_at).getTime(),
    )
    if (!lastContactByCustomer[b.customer_id] || ts > lastContactByCustomer[b.customer_id]) {
      lastContactByCustomer[b.customer_id] = ts
    }
  }

  // ── Customer-stats per typ ─────────────────────────────────
  const byType: Record<string, CustomerRow[]> = {}
  for (const c of customers) {
    const declaredType = c.customer_type
    const name = (c.name || '').toLowerCase()
    const likelyBrf = !declaredType && (name.includes('brf') || name.includes('bostadsrätts'))
    const type = declaredType || (likelyBrf ? 'brf' : 'private')
    if (!byType[type]) byType[type] = []
    byType[type].push(c)
  }
  const byCustomerType: HannaAggregate['by_customer_type'] = {}
  for (const [type, cs] of Object.entries(byType)) {
    const totalLtv = cs.reduce((s, c) => s + (lifetimeValueByCustomer[c.customer_id] || 0), 0)
    byCustomerType[type] = {
      count: cs.length,
      total_lifetime_value_kr: Math.round(totalLtv),
      avg_lifetime_value_kr: cs.length > 0 ? Math.round(totalLtv / cs.length) : null,
    }
  }

  const totalLtvAll = customers.reduce((s, c) => s + (lifetimeValueByCustomer[c.customer_id] || 0), 0)

  // ── Reaktiverings-kandidater (60+ dagar sedan kontakt + LTV >= 5000) ──
  const sixtyDaysAgoMs = now - 60 * 86400000
  const reactivationCandidates = customers
    .filter(c => {
      const lastTs = lastContactByCustomer[c.customer_id]
      if (!lastTs) return false
      const ltv = lifetimeValueByCustomer[c.customer_id] || 0
      return lastTs < sixtyDaysAgoMs && ltv >= 5000
    })
    .map(c => {
      const declaredType = c.customer_type
      const name = (c.name || '').toLowerCase()
      const likelyBrf = !declaredType && (name.includes('brf') || name.includes('bostadsrätts'))
      return {
        customer_id: c.customer_id,
        name: c.name,
        customer_type: declaredType || (likelyBrf ? 'brf' : 'private'),
        days_since_last_contact: Math.round(
          (now - lastContactByCustomer[c.customer_id]) / 86400000,
        ),
        lifetime_value_kr: Math.round(lifetimeValueByCustomer[c.customer_id] || 0),
      }
    })
    .sort((a, b) => b.lifetime_value_kr - a.lifetime_value_kr)
    .slice(0, 5)

  // ── Leads per månad (säsongs-mönster, 180d) ───────────────
  const { data: leadsData } = await supabase
    .from('leads')
    .select('lead_id, source, status, created_at')
    .eq('business_id', businessId)
    .gte('created_at', oneHundredEightyDaysAgo.toISOString())
    .limit(500)

  const leads = (leadsData || []) as LeadRow[]

  const leadsByMonth: HannaAggregate['leads_by_month'] = {}
  for (const l of leads) {
    const key = ymKey(l.created_at)
    if (!leadsByMonth[key]) {
      leadsByMonth[key] = { count: 0, won_count: 0, lost_count: 0 }
    }
    leadsByMonth[key].count++
    if (l.status === 'won' || l.status === 'completed') leadsByMonth[key].won_count++
    if (l.status === 'lost') leadsByMonth[key].lost_count++
  }

  // ── Review-flow ────────────────────────────────────────────
  // "Eligible" = kunder med minst 1 invoice senaste 180d (jobbet är klart, kan be om recension)
  const customersWithInvoices = Object.keys(invoicesByCustomer).length
  const reviewSentCustomers = customers.filter(c => c.review_request_sent_at !== null).length
  const eligibleCustomers = customersWithInvoices
  const pendingReview = Math.max(0, eligibleCustomers - reviewSentCustomers)

  const reviewFlow = {
    sent_count: reviewSentCustomers,
    pending_review_count: pendingReview,
    eligible_count: eligibleCustomers,
    coverage_pct: eligibleCustomers > 0
      ? Math.round((reviewSentCustomers / eligibleCustomers) * 100)
      : null,
  }

  // ── Repeat-customers (kunder med 2+ fakturor) ─────────────
  const customerInvoiceCounts = Object.entries(invoicesByCustomer).map(
    ([_, invs]) => invs.length,
  )
  const repeatCount = customerInvoiceCounts.filter(c => c >= 2).length
  const totalInvoiceCount = customerInvoiceCounts.reduce((s, c) => s + c, 0)
  const repeatCustomers = {
    customers_with_invoices: customersWithInvoices,
    repeat_count: repeatCount,
    repeat_rate_pct: customersWithInvoices > 0
      ? Math.round((repeatCount / customersWithInvoices) * 100)
      : null,
    avg_invoices_per_repeat: repeatCount > 0
      ? Math.round((totalInvoiceCount / repeatCount) * 10) / 10
      : null,
  }

  return {
    period_days: 180,
    customers_180d: {
      total_count: customers.length,
      new_count: customers.length, // alla customers i 180d-fönstret = "new in window"
      avg_lifetime_value_kr: customers.length > 0
        ? Math.round(totalLtvAll / customers.length)
        : null,
    },
    by_customer_type: byCustomerType,
    reactivation_candidates: reactivationCandidates,
    leads_by_month: leadsByMonth,
    review_flow: reviewFlow,
    repeat_customers: repeatCustomers,
  }
}

// ─────────────────────────────────────────────────────────────────
// Hypotes-driven prompt
// ─────────────────────────────────────────────────────────────────

function buildHannaSystemPrompt(
  businessName: string,
  maturity: 'early_stage' | 'full_analysis',
): string {
  if (maturity === 'early_stage') {
    return `Du är Hanna, marknadsansvarig hos ${businessName}. Du är ny i rollen och har precis fått tillgång till kund- och kampanj-datat.

Du ser att det finns lite data — färre än 10 kunder senaste 180 dagarna. Det räcker inte för djupanalys, men det är dags att presentera sig och flagga vad du tänker hålla extra koll på.

Generera EXAKT 1 observation av typen "early-stage relation-byggande". Anpassa siffrorna till verkliga aggregatet. Var personlig och datadriven — du letar efter mönster i kund-flödet, inte säljer.

REGLER:
- 1 observation, inte fler.
- knowledge_type: 'insight'
- suggestion: null (ren introduktion, ingen action)
- confidence: 0.9
- data_basis: { period_days, customer_count, repeat_count, note: 'early_stage_introduction' }

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen, anpassa siffrorna:

[
  {
    "knowledge_type": "insight",
    "title": "Jag börjar förstå kund-flödet",
    "observation": "Hej! Hanna här, er marknadsansvariga. Jag har nu tittat på 7 kunder från senaste 180 dagarna — 3 har redan kommit tillbaka och beställt mer. Det är ett litet underlag men det finns ett mönster att bygga vidare på. Säg gärna till vilka kund-segment du vill att jag spanar mer på.",
    "suggestion": null,
    "confidence": 0.9,
    "data_basis": {
      "period_days": 180,
      "customer_count": 7,
      "repeat_count": 3,
      "note": "early_stage_introduction"
    }
  }
]`
  }

  return `Du är Hanna, marknadsansvarig hos ${businessName}. Du har ögon för retention och säsongsmönster — du spårar kund-flödet över tid och spottar var marknadsföringen läcker. Du analyserar senaste 180 dagarnas kunder, leads och fakturor med dessa konkreta hypoteser:

1. **Reaktiverings-möjligheter (inaktiva högt-värde-kunder):**
   - Vilka kunder med tidigare högt LTV har inte hörts på 60+ dagar?
   - Är det rätt tid för ett "vi tänkte på dig"-utskick?
   - Vilken kund-typ är mest värd att jaga aktivt?

2. **Säsongs-trender i lead-inflow:**
   - Vilka månader ger flest leads? Vilka är magrast?
   - Bör marknads-budgeten skiftas mellan månader?
   - Finns det en månad där win-rate är extra hög?

3. **Recension-effektivitet:**
   - Hur stor andel av kunderna med klart jobb har vi bett om recension från?
   - Är "coverage" under 50% → vi missar lågt hängande Google-stjärnor.
   - Skicka påminnelse till de som inte fått frågan än?

4. **Återkommande-kund-andel:**
   - Hur stor andel av faktura-kunderna har kommit tillbaka 2+ gånger?
   - Vilken kund-typ återkommer mest?
   - Är repeat-rate under 30% → relation-vården är svag.

Generera 1-3 KORTA observationer (max 2-3 meningar var) med konkret suggestion när det är vettigt.

Var inte trivial. "Du har X kunder" = data, inte observation.
"BRF Lindgården har inte hörts på 90 dagar trots LTV 47 000 kr — värt ett uppföljnings-mail?" = observation.

Använd KONKRETA kund-namn när du refererar till reactivation_candidates.

REGLER:
- 1-3 observationer max. Färre är bättre om du inte ser något viktigt.
- "title" max 60 tecken, konkret.
- "observation" max 2-3 meningar, första-person, marknadsförarens datadrivna lugn (inte säljarens energi).
- "suggestion" konkret action max 1 mening ELLER null om bara info.
- "confidence" 0-1, var ärlig. Under 0.5 om du gissar.

Om allt ser bra ut — säg det med 1 positiv observation. Återhåll dig från att hitta på problem.

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen:

[
  {
    "knowledge_type": "recommendation",
    "title": "BRF Lindgården tyst i 90 dagar — värt en check-in",
    "observation": "BRF Lindgården har LTV 47 000 kr men ingen kontakt på 90 dagar. Tre andra högt-värde-kunder har också blivit tysta. Hösten är högsäsong för underhåll — rätt timing för reaktivering.",
    "suggestion": "Skicka personlig check-in till de fyra reaktiverings-kandidaterna denna vecka.",
    "confidence": 0.85,
    "data_basis": {
      "period_days": 180,
      "metric": "reactivation_candidates",
      "candidate_count": 4,
      "highest_ltv_candidate_kr": 47000
    }
  }
]`
}

// ─────────────────────────────────────────────────────────────────
// Claude-anrop
// ─────────────────────────────────────────────────────────────────

async function callHannaWithThinking(
  businessName: string,
  aggregate: HannaAggregate,
  maturity: 'early_stage' | 'full_analysis',
) {
  const systemPrompt = buildHannaSystemPrompt(businessName, maturity)
  const userMessage = `Här är ${businessName}s kund- och kampanj-data senaste 180 dagarna:

${JSON.stringify(aggregate, null, 2)}

Tänk igenom det och returnera JSON-array.`

  return callAgentWithThinking({
    agentId: 'hanna',
    codeVersion: HANNA_CODE_VERSION,
    promptMaturity: maturity,
    systemPrompt,
    userMessage,
  })
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export async function runHannaObservation(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  options: { includeDebug?: boolean } = {},
): Promise<HannaRunResult> {
  console.log(`[hanna/run] entry version=${HANNA_CODE_VERSION} business=${businessId}`)

  const aggregate = await buildHannaAggregate(supabase, businessId)
  if (!aggregate) {
    return { skipped: 'no_customers_last_180d' }
  }

  const customerCount = aggregate.customers_180d.total_count
  if (customerCount < 5) {
    return {
      skipped: 'insufficient_data',
      reason: 'fewer_than_5_customers',
      aggregate,
    }
  }

  const maturity: 'early_stage' | 'full_analysis' =
    customerCount < 10 ? 'early_stage' : 'full_analysis'

  const { observations, thinkingPreview, debug } = await callHannaWithThinking(
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

  const counts = await saveAndPush(supabase, businessId, 'hanna', observations)

  return {
    aggregate,
    data_maturity: maturity,
    observations_total: observations.length,
    thinking_preview: thinkingPreview,
    ...counts,
    ...(options.includeDebug ? { debug } : {}),
  }
}
