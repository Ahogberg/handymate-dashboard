/**
 * Karins observation-pipeline — Väg 1 Commit 3.
 *
 * Extraherar prompt + data-aggregation + Claude-anrop från
 * /api/cron/agent-observations till denna fil. Cron-routen blir tunn
 * wrapper. Test-endpoint i commit 5 anropar runKarinObservation()
 * direkt utan att gå via cron-routen.
 *
 * Två förbättringar mot commit 2 inline-versionen:
 *
 * 1. Extended-thinking via raw Anthropic API (SDK 0.17.0 i repot är
 *    för gammal för thinking-parametern — använd raw fetch istället
 *    för att inte kräva SDK-uppgradering som kan bryta andra delar).
 *    Sonnet 4 (claude-sonnet-4-20250514) stödjer extended-thinking
 *    utan beta-header.
 *
 * 2. Utökad data-aggregation:
 *    - 90d invoice base (som tidigare)
 *    - Senaste-30d vs föregående-30d trend (month-over-month)
 *    - Per-customer-type-split (private/company/brf) med DSO + payment-rate
 *    - Sent-pending breakdown (totalvärde + snitt-dagar gammalt)
 *
 *    Project-profitability skippas v1 — kräver join på project +
 *    quotes + project_change + project_material + time_entry per
 *    projekt. Lägg till i v2 om Karin visar att hon kan vara
 *    värdefull på de simpler aggregaten först.
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
  aggregate?: KarinAggregate
  observations_total?: number
  saved?: number
  approvals_created?: number
  insights_pushed?: number
  thinking_preview?: string
  error?: string
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
  }
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
  }
}

async function buildAggregate(
  supabase: SupabaseClient,
  businessId: string,
): Promise<KarinAggregate | null> {
  const now = Date.now()
  const ninetyDaysAgo = new Date(now - 90 * 86400000)
  const sixtyDaysAgo = new Date(now - 60 * 86400000)
  const thirtyDaysAgo = new Date(now - 30 * 86400000)

  const { data: invoices, error } = await supabase
    .from('invoice')
    .select('invoice_id, invoice_number, customer_id, total, invoice_date, due_date, paid_at, status')
    .eq('business_id', businessId)
    .gte('invoice_date', ninetyDaysAgo.toISOString())

  if (error) {
    console.error('[karin/aggregate] invoice query error:', error)
    return null
  }

  if (!invoices || invoices.length === 0) {
    return null
  }

  const rows = invoices as InvoiceRow[]
  const last90d = computeInvoiceStats(rows)

  // Trend: senaste 30d vs föregående 30d (dvs 30-60d back)
  const last30d = rows.filter(i => new Date(i.invoice_date) >= thirtyDaysAgo)
  const prev30d = rows.filter(i => {
    const d = new Date(i.invoice_date)
    return d >= sixtyDaysAgo && d < thirtyDaysAgo
  })
  const last30Total = last30d.reduce((s, i) => s + Number(i.total || 0), 0)
  const prev30Total = prev30d.reduce((s, i) => s + Number(i.total || 0), 0)
  const pctChange =
    prev30Total > 0 ? Math.round(((last30Total - prev30Total) / prev30Total) * 100) : null

  // Per-customer-type split — hämta customer_type för alla unika customer_ids
  const customerIds = Array.from(
    new Set(rows.map(r => r.customer_id).filter((id): id is string => !!id)),
  )

  const customerTypeMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, customer_type')
      .in('customer_id', customerIds)
      .eq('business_id', businessId)
    for (const c of customers || []) {
      customerTypeMap[c.customer_id] = c.customer_type || 'private'
    }
  }

  const byType: Record<string, InvoiceRow[]> = {}
  for (const r of rows) {
    const type = r.customer_id ? customerTypeMap[r.customer_id] || 'unknown' : 'no_customer'
    if (!byType[type]) byType[type] = []
    byType[type].push(r)
  }
  const byCustomerType: Record<string, InvoiceStats> = {}
  for (const [type, rs] of Object.entries(byType)) {
    byCustomerType[type] = computeInvoiceStats(rs)
  }

  // Sent-pending breakdown — hur gammal är den utestående portföljen?
  const sentPending = rows.filter(i => i.status === 'sent')
  const totalOutstanding = sentPending.reduce((s, i) => s + Number(i.total || 0), 0)
  let avgAgeDays: number | null = null
  let oldestDays: number | null = null
  if (sentPending.length > 0) {
    const ages = sentPending.map(i => (now - new Date(i.invoice_date).getTime()) / 86400000)
    avgAgeDays = Math.round(ages.reduce((s, a) => s + a, 0) / ages.length)
    oldestDays = Math.round(Math.max(...ages))
  }

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
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// Claude-anrop med extended-thinking
// ─────────────────────────────────────────────────────────────────

const KARIN_SYSTEM_PROMPT = `Du är Karin, ekonom hos hantverkarens företag. Du har studerat företagets siffror senaste 90 dagarna och har 1-3 observationer att dela.

Du är inte en data-rapport. Du är en riktig anställd som lägger märke till saker och föreslår åtgärder.

Skriv som du pratar:
- "Jag märker att..."
- "Jag tror vi borde..."
- "Det här ser inte rätt ut..."
- "Det är värt att kolla..."

Inte: "Analys visar att..." eller bullet-listor eller stela företags-fraser.

Tänk noga innan du svarar:
- Vad är det verkligt INTRESSANTA i datan? Inte vad som är obvious.
- Skiljer sig olika kundtyper? Hur?
- Är det någon trend som accelererar i fel riktning?
- Finns sent-pending-fakturor som börjar bli oroväckande gamla?
- Om allt ser bra ut — säg det. Återhåll dig från att hitta på problem.

REGLER FÖR OUTPUT:
- 1-3 observationer max. Färre är bättre om du inte ser något viktigt.
- Returnera EXAKT JSON-array, ingen prolog eller efterord.
- "title" max 80 tecken, korta och tydliga.
- "observation" 2-4 meningar, första-person, vänlig professionell ton.
- "suggestion" konkret action max 1 mening ELLER null om bara info.
- "confidence" 0-1, var ärlig. Under 0.5 om du gissar baserat på lite data.
- "data_basis" objekt med period_days + metric-namn + relevanta tal.
- "knowledge_type" en av: insight, pattern, anomaly, recommendation.

Skillnad observation vs suggestion:
- Observation: "Jag märker att kassaflödet ökade 18% senaste 30 dagarna" → suggestion: null (ren info)
- Observation: "Tre BRF-fakturor är över 60 dagar gamla" → suggestion: "Skicka manuell påminnelse till BRF Solgården" (konkret action)`

async function callKarinWithThinking(
  businessName: string,
  aggregate: KarinAggregate,
): Promise<{ observations: KarinObservation[]; thinkingPreview: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[karin/call] ANTHROPIC_API_KEY not set')
    return { observations: [], thinkingPreview: '' }
  }

  const userMessage = `Här är ${businessName}s siffror senaste 90 dagarna:

${JSON.stringify(aggregate, null, 2)}

Tänk igenom det och returnera JSON-array med 1-3 observationer.`

  // Raw fetch — SDK 0.17.0 är för gammal för thinking-parametern.
  // Sonnet 4 stödjer extended-thinking utan beta-header.
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      thinking: { type: 'enabled', budget_tokens: 2000 },
      system: KARIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error('[karin/call] Anthropic API error:', {
      status: response.status,
      body: errText.slice(0, 500),
    })
    return { observations: [], thinkingPreview: `error: ${response.status}` }
  }

  const data: any = await response.json()
  const blocks: Array<{ type: string; text?: string; thinking?: string }> =
    data.content || []

  const thinkingBlock = blocks.find(b => b.type === 'thinking')
  const textBlock = blocks.find(b => b.type === 'text')

  const thinkingPreview = thinkingBlock?.thinking?.slice(0, 200) || ''
  const text = textBlock?.text || '[]'

  const match = text.match(/\[[\s\S]*\]/)
  if (!match) {
    console.error('[karin/call] no JSON array in response:', text.slice(0, 200))
    return { observations: [], thinkingPreview }
  }

  try {
    const parsed = JSON.parse(match[0]) as KarinObservation[]
    const valid = parsed.filter(o =>
      o.knowledge_type && o.title && o.observation && typeof o.confidence === 'number',
    )
    return { observations: valid, thinkingPreview }
  } catch (parseErr) {
    console.error('[karin/call] JSON parse failed:', parseErr, text.slice(0, 200))
    return { observations: [], thinkingPreview }
  }
}

// ─────────────────────────────────────────────────────────────────
// Save + push (samma logik som inline-versionen i commit 2)
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
): Promise<KarinRunResult> {
  const aggregate = await buildAggregate(supabase, businessId)
  if (!aggregate) {
    return { skipped: 'no_invoices_last_90d' }
  }

  const { observations, thinkingPreview } = await callKarinWithThinking(businessName, aggregate)
  if (observations.length === 0) {
    return { skipped: 'no_observations_returned', aggregate, thinking_preview: thinkingPreview }
  }

  const counts = await saveAndPush(supabase, businessId, observations)

  return {
    aggregate,
    observations_total: observations.length,
    thinking_preview: thinkingPreview,
    ...counts,
  }
}
