import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/agent-observations
 *
 * Vecko-cron som låter agenter (Karin v1) göra "riktiga anställda"-
 * observationer av hantverkarens verksamhet. Inte data-rapporter —
 * insights med konkreta förslag.
 *
 * Schema: söndag + onsdag 06 UTC (2/vecka, inte spam).
 *
 * Flöde per business:
 * 1. Aggregera 90d invoice-data (Karin v1 fokuserar på ekonomi)
 * 2. Anropa Claude Sonnet med Karins persona-prompt
 * 3. Parsa 1-3 observationer (JSON-array)
 * 4. Spara varje i business_knowledge
 * 5. Om suggestion finns → skapa pending_approval + push
 *    (approval_type='agent_observation')
 *    Annars → bara push utan approval-rad
 *    (approval_type='agent_insight')
 *
 * v1: ENBART Karin. Övriga agenter (matte/daniel/lars/hanna/lisa)
 * följer när Karin-prompten validerats mot Christoffer-feedback.
 *
 * v1: BASIC inline-prompt. Commit 3 extraherar till
 * lib/agents/karin/observation-prompt.ts med extended-thinking +
 * utökad business-data-aggregation (project_profitability, customer-
 * type-split, etc).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: businesses, error: bizError } = await supabase
    .from('business_config')
    .select('business_id, business_name')

  if (bizError) {
    console.error('[cron/agent-observations] business_config error:', bizError)
    return NextResponse.json(
      { error: bizError.message, stage: 'business_config' },
      { status: 500 },
    )
  }

  const results: Array<Record<string, unknown>> = []

  for (const biz of businesses || []) {
    try {
      const result = await runKarinObservation(supabase, biz.business_id, biz.business_name || 'företaget')
      results.push({ business_id: biz.business_id, ...result })
    } catch (err) {
      console.error('[cron/agent-observations] business error:', {
        business_id: biz.business_id,
        error: err instanceof Error ? err.message : String(err),
      })
      results.push({
        business_id: biz.business_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    businesses_processed: results.length,
    results,
  })
}

// ─────────────────────────────────────────────────────────────────
// Karin v1 — basic inline-prompt. Commit 3 byter ut.
// ─────────────────────────────────────────────────────────────────

interface KarinObservation {
  knowledge_type: 'insight' | 'pattern' | 'anomaly' | 'recommendation'
  title: string
  observation: string
  suggestion: string | null
  confidence: number
  data_basis: Record<string, unknown>
}

async function runKarinObservation(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
): Promise<Record<string, unknown>> {
  // 1. Aggregera senaste 90d invoice-data
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoice')
    .select('invoice_id, invoice_number, customer_id, total, invoice_date, due_date, paid_at, status')
    .eq('business_id', businessId)
    .gte('invoice_date', ninetyDaysAgo)

  if (invoicesError) {
    return { stage: 'invoice_query', error: invoicesError.message }
  }

  if (!invoices || invoices.length === 0) {
    return { skipped: 'no_invoices_last_90d' }
  }

  // Bygg aggregat — basic v1, commit 3 utökar med project-profitability
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'paid' && i.paid_at)
  const overdueInvoices = invoices.filter(i => i.status === 'overdue')
  const sentInvoices = invoices.filter(i => i.status === 'sent')

  const totalPaid = paidInvoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const totalOverdue = overdueInvoices.reduce((s, i) => s + Number(i.total || 0), 0)

  // DSO — snitt-dagar från invoice_date till paid_at
  let avgDso: number | null = null
  if (paidInvoices.length > 0) {
    const totalDays = paidInvoices.reduce((s, i) => {
      const days = (new Date(i.paid_at as string).getTime() - new Date(i.invoice_date).getTime()) / 86400000
      return s + days
    }, 0)
    avgDso = Math.round(totalDays / paidInvoices.length)
  }

  const aggregate = {
    period_days: 90,
    invoice_count: invoices.length,
    total_invoiced_kr: Math.round(totalInvoiced),
    total_paid_kr: Math.round(totalPaid),
    total_overdue_kr: Math.round(totalOverdue),
    avg_days_to_payment: avgDso,
    paid_count: paidInvoices.length,
    overdue_count: overdueInvoices.length,
    sent_pending_count: sentInvoices.length,
    payment_rate: Math.round((paidInvoices.length / invoices.length) * 100),
  }

  // 2. Anropa Karin
  const observations = await callKarin(businessName, aggregate)

  if (observations.length === 0) {
    return { skipped: 'no_observations_returned', aggregate }
  }

  // 3. Spara + trigga push per observation
  let savedCount = 0
  let approvalCount = 0
  let insightCount = 0

  for (const obs of observations) {
    const { data: saved, error: saveErr } = await supabase
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
      console.error('[karin] save error:', saveErr)
      continue
    }
    savedCount++

    const knowledgeId = saved?.id || null

    if (obs.suggestion && obs.suggestion.trim().length > 0) {
      // A — observation med konkret action: approval + push
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
      approvalCount++
    } else {
      // B — ren info: bara push, ingen approval-rad
      void sendApprovalPush({
        business_id: businessId,
        approval_type: 'agent_insight',
        payload: {
          agent_id: 'karin',
          title: obs.title,
          observation: obs.observation,
        },
      })
      insightCount++
    }
  }

  return {
    aggregate_used: aggregate,
    observations_total: observations.length,
    saved: savedCount,
    approvals_created: approvalCount,
    insights_pushed: insightCount,
  }
}

async function callKarin(businessName: string, aggregate: Record<string, unknown>): Promise<KarinObservation[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[karin] ANTHROPIC_API_KEY not set, skipping')
    return []
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = `Du är Karin, ekonom hos ${businessName}. Du har studerat siffrorna senaste 90 dagarna och har 1-3 observationer.

Du är inte en data-rapport. Du är en riktig anställd som lägger märke till saker och föreslår åtgärder.

Skriv som du pratar:
- "Jag märker att..."
- "Jag tror vi borde..."
- "Det här ser inte rätt ut..."

Inte: "Analys visar att..." eller bullet-listor.

REGLER:
- 1-3 observationer max. Färre är bättre om du inte ser något viktigt.
- Returnera EXAKT JSON-array, ingen prolog eller efterord.
- "title" max 80 tecken.
- "observation" 2-4 meningar, första-person, vänlig ton.
- "suggestion" konkret action (max 1 mening) ELLER null om bara info.
- "confidence" 0-1, var ärlig. Under 0.5 om du gissar.
- "data_basis" objekt med period_days + metric + relevanta IDs.
- "knowledge_type" en av: insight, pattern, anomaly, recommendation.`

  const userMessage = `Här är ${businessName}s siffror senaste 90 dagarna:

${JSON.stringify(aggregate, null, 2)}

Vad lägger du märke till? Returnera JSON-array med 1-3 observationer.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  // Extract JSON array — Claude kan ibland wrappa i markdown-fence
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) {
    console.error('[karin] no JSON array in response:', text.slice(0, 200))
    return []
  }

  try {
    const parsed = JSON.parse(match[0]) as KarinObservation[]
    // Validera och filtrera ut ofullständiga
    return parsed.filter(o =>
      o.knowledge_type && o.title && o.observation && typeof o.confidence === 'number'
    )
  } catch (parseErr) {
    console.error('[karin] JSON parse failed:', parseErr, text.slice(0, 200))
    return []
  }
}
