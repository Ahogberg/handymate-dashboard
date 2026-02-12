import { getServerSupabase } from '@/lib/supabase'
import {
  getCommunicationSettings,
  resolveMessageVariables,
  interpolateMessage,
  canSendMessage,
  sendSmartMessage,
  type CommunicationRule,
  type CommunicationSettings,
} from '@/lib/smart-communication'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// ── Types ──────────────────────────────────────────────────────

interface CustomerCommunicationState {
  customerId: string
  customerName: string
  customerPhone: string | null
  dealStage: string | null
  daysSinceContact: number | null
  daysSinceMessage: number | null
  messageCountThisWeek: number
  pendingQuote: { id: string; total: number; sentAt: string } | null
  upcomingBooking: { date: string; time: string } | null
  overdueInvoice: { id: string; number: string; amount: number; dueDate: string } | null
  paidInvoiceNoReview: { id: string; paidAt: string } | null
  recentCallSummary: string | null
}

export interface AIDecision {
  shouldSend: boolean
  ruleId?: string
  customMessage?: string
  reason: string
  confidence: number
}

// ── AI Evaluation ─────────────────────────────────────────────

export async function evaluateCustomerCommunication(
  businessId: string,
  customerId: string
): Promise<AIDecision> {
  const supabase = getServerSupabase()
  const settings = await getCommunicationSettings(businessId)

  // Build customer state
  const state = await buildCustomerState(businessId, customerId, settings)

  if (!state.customerPhone) {
    return { shouldSend: false, reason: 'Kunden saknar telefonnummer', confidence: 100 }
  }

  // Check rate limits first
  const canSend = await canSendMessage(businessId, customerId)
  if (!canSend.allowed) {
    return { shouldSend: false, reason: canSend.reason || 'Rate limit', confidence: 100 }
  }

  // Get available rules
  const { data: rules } = await supabase
    .from('communication_rule')
    .select('*')
    .eq('is_enabled', true)
    .or(`business_id.is.null,business_id.eq.${businessId}`)
    .order('sort_order')

  const conditionRules = (rules || []).filter((r: any) => r.trigger_type === 'condition')

  // Simple rule-based evaluation first (no AI needed for clear-cut cases)
  const simpleDecision = evaluateSimpleRules(state, conditionRules, settings)
  if (simpleDecision) return simpleDecision

  // If no clear rule matches, use AI for complex cases
  if (ANTHROPIC_API_KEY && state.daysSinceContact !== null && state.daysSinceContact > 5) {
    return await evaluateWithAI(state, conditionRules, settings)
  }

  return { shouldSend: false, reason: 'Ingen åtgärd behövs just nu', confidence: 80 }
}

// ── Simple Rule Evaluation (No AI) ──────────────────────────

function evaluateSimpleRules(
  state: CustomerCommunicationState,
  rules: CommunicationRule[],
  settings: CommunicationSettings
): AIDecision | null {
  // 1. Overdue invoice reminder
  if (state.overdueInvoice && settings.send_invoice_reminder) {
    const rule = rules.find((r) => r.trigger_config?.condition === 'invoice_overdue')
    if (rule) {
      const daysSince = Math.floor(
        (Date.now() - new Date(state.overdueInvoice.dueDate).getTime()) / 86400000
      )
      const threshold = rule.trigger_config?.days_since || 5
      if (daysSince >= threshold) {
        return {
          shouldSend: true,
          ruleId: rule.id,
          reason: `Faktura #${state.overdueInvoice.number} förföll för ${daysSince} dagar sedan`,
          confidence: 95,
        }
      }
    }
  }

  // 2. Quote follow-up
  if (state.pendingQuote && settings.send_quote_followup) {
    const rule = rules.find((r) => r.trigger_config?.condition === 'quote_pending')
    if (rule) {
      const daysSince = Math.floor(
        (Date.now() - new Date(state.pendingQuote.sentAt).getTime()) / 86400000
      )
      const threshold = rule.trigger_config?.days_since || 3
      if (daysSince >= threshold) {
        return {
          shouldSend: true,
          ruleId: rule.id,
          reason: `Offert obesvarad i ${daysSince} dagar`,
          confidence: 90,
        }
      }
    }
  }

  // 3. Booking reminder (tomorrow)
  if (state.upcomingBooking && settings.send_day_before_reminder) {
    const rule = rules.find((r) => r.trigger_config?.condition === 'booking_tomorrow')
    if (rule) {
      const bookingDate = new Date(state.upcomingBooking.date)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      if (
        bookingDate.toDateString() === tomorrow.toDateString() &&
        new Date().getHours() >= 17 // Send after 17:00
      ) {
        return {
          shouldSend: true,
          ruleId: rule.id,
          reason: 'Bokning imorgon - automatisk påminnelse',
          confidence: 95,
        }
      }
    }
  }

  // 4. Review request after payment
  if (state.paidInvoiceNoReview && settings.send_review_request) {
    const rule = rules.find((r) => r.trigger_config?.condition === 'invoice_paid')
    if (rule) {
      const daysSince = Math.floor(
        (Date.now() - new Date(state.paidInvoiceNoReview.paidAt).getTime()) / 86400000
      )
      const threshold = rule.trigger_config?.days_since || 2
      if (daysSince >= threshold) {
        return {
          shouldSend: true,
          ruleId: rule.id,
          reason: `Faktura betald för ${daysSince} dagar sedan - be om recension`,
          confidence: 85,
        }
      }
    }
  }

  return null
}

// ── AI Evaluation (Complex cases) ─────────────────────────────

async function evaluateWithAI(
  state: CustomerCommunicationState,
  rules: CommunicationRule[],
  settings: CommunicationSettings
): Promise<AIDecision> {
  try {
    const rulesDesc = rules
      .map((r) => `- ${r.id}: ${r.name} (${r.description || ''})`)
      .join('\n')

    const prompt = `Du är en smart assistent som hjälper hantverkare kommunicera med kunder.

Kundens situation:
- Namn: ${state.customerName}
- Pipeline-steg: ${state.dealStage || 'Okänt'}
- Senaste kontakt: ${state.daysSinceContact !== null ? `${state.daysSinceContact} dagar sedan` : 'Okänt'}
- Senaste meddelande från oss: ${state.daysSinceMessage !== null ? `${state.daysSinceMessage} dagar sedan` : 'Aldrig'}
- Meddelanden denna vecka: ${state.messageCountThisWeek}
- Max meddelanden per vecka: ${settings.max_sms_per_customer_per_week}

Status:
- Offert väntande: ${state.pendingQuote ? `Ja (${state.pendingQuote.total} kr)` : 'Nej'}
- Kommande bokning: ${state.upcomingBooking ? `${state.upcomingBooking.date} kl ${state.upcomingBooking.time}` : 'Nej'}
- Förfallen faktura: ${state.overdueInvoice ? `Ja (#${state.overdueInvoice.number}, ${state.overdueInvoice.amount} kr)` : 'Nej'}

Senaste samtalsnotering: "${state.recentCallSummary || 'Ingen'}"

Tillgängliga regler:
${rulesDesc}

Besluta om vi ska skicka ett meddelande nu.
Svara BARA med JSON (inget annat):
{
  "shouldSend": true/false,
  "ruleId": "rule_id om shouldSend är true, annars null",
  "reason": "Kort förklaring på svenska",
  "confidence": 0-100
}

Tänk på:
- Skicka inte för ofta (max ${settings.max_sms_per_customer_per_week} per vecka)
- Skicka inte om vi nyligen varit i kontakt
- Prioritera viktiga saker (förfallna fakturor, kommande bokningar)
- Var inte påträngande`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      return { shouldSend: false, reason: 'AI-utvärdering misslyckades', confidence: 0 }
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        shouldSend: parsed.shouldSend === true,
        ruleId: parsed.ruleId || undefined,
        reason: parsed.reason || 'AI-beslut',
        confidence: parsed.confidence || 50,
      }
    }

    return { shouldSend: false, reason: 'Kunde inte tolka AI-svar', confidence: 0 }
  } catch (err) {
    console.error('AI evaluation error:', err)
    return { shouldSend: false, reason: 'AI-utvärdering misslyckades', confidence: 0 }
  }
}

// ── Build Customer State ─────────────────────────────────────

async function buildCustomerState(
  businessId: string,
  customerId: string,
  settings: CommunicationSettings
): Promise<CustomerCommunicationState> {
  const supabase = getServerSupabase()

  // Customer basic info
  const { data: customer } = await supabase
    .from('customer')
    .select('name, phone_number')
    .eq('customer_id', customerId)
    .single()

  // Messages this week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { count: messageCount } = await supabase
    .from('communication_log')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .gte('created_at', weekAgo.toISOString())
    .in('status', ['sent', 'delivered'])

  // Last message sent
  const { data: lastMsg } = await supabase
    .from('communication_log')
    .select('created_at')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .in('status', ['sent', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Last contact (call or activity)
  const { data: lastActivity } = await supabase
    .from('customer_activity')
    .select('created_at')
    .eq('customer_id', customerId)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Deal info
  const { data: deal } = await supabase
    .from('deal')
    .select('stage_slug')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Pending quotes
  const { data: pendingQuote } = await supabase
    .from('quotes')
    .select('quote_id, total, updated_at')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('status', 'sent')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  // Upcoming bookings
  const today = new Date().toISOString().split('T')[0]
  const { data: nextBooking } = await supabase
    .from('booking')
    .select('booking_date, booking_time')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('status', 'confirmed')
    .gte('booking_date', today)
    .order('booking_date')
    .limit(1)
    .single()

  // Overdue invoices
  const { data: overdueInvoice } = await supabase
    .from('invoice')
    .select('invoice_id, invoice_number, total, customer_pays, due_date')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('status', 'overdue')
    .order('due_date')
    .limit(1)
    .single()

  // Paid invoice with no review request yet
  const { data: paidInvoice } = await supabase
    .from('invoice')
    .select('invoice_id, updated_at')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('status', 'paid')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  let paidInvoiceNoReview = null
  if (paidInvoice) {
    // Check if we already sent a review request for this
    const { count: reviewCount } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .eq('rule_id', 'rule_review_request')
      .gte('created_at', paidInvoice.updated_at)

    if ((reviewCount || 0) === 0) {
      paidInvoiceNoReview = {
        id: paidInvoice.invoice_id,
        paidAt: paidInvoice.updated_at,
      }
    }
  }

  // Recent call summary
  const { data: recentCall } = await supabase
    .from('call_recording')
    .select('transcript_summary')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .not('transcript_summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const daysSinceContact = lastActivity?.created_at
    ? Math.floor((Date.now() - new Date(lastActivity.created_at).getTime()) / 86400000)
    : null

  const daysSinceMessage = lastMsg?.created_at
    ? Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / 86400000)
    : null

  return {
    customerId,
    customerName: customer?.name || 'Kund',
    customerPhone: customer?.phone_number || null,
    dealStage: deal?.stage_slug || null,
    daysSinceContact,
    daysSinceMessage,
    messageCountThisWeek: messageCount || 0,
    pendingQuote: pendingQuote
      ? { id: pendingQuote.quote_id, total: pendingQuote.total, sentAt: pendingQuote.updated_at }
      : null,
    upcomingBooking: nextBooking
      ? { date: nextBooking.booking_date, time: nextBooking.booking_time || '' }
      : null,
    overdueInvoice: overdueInvoice
      ? {
          id: overdueInvoice.invoice_id,
          number: overdueInvoice.invoice_number || '',
          amount: overdueInvoice.customer_pays || overdueInvoice.total || 0,
          dueDate: overdueInvoice.due_date,
        }
      : null,
    paidInvoiceNoReview: paidInvoiceNoReview,
    recentCallSummary: recentCall?.transcript_summary || null,
  }
}

// ── Batch Run for Cron ──────────────────────────────────────

export async function runCommunicationAI(
  businessId: string
): Promise<{
  evaluated: number
  sent: number
  skipped: number
  decisions: Array<{ customerId: string; decision: AIDecision }>
}> {
  const supabase = getServerSupabase()

  // Get customers with recent activity (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: activeCustomers } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('business_id', businessId)
    .gte('updated_at', thirtyDaysAgo.toISOString())
    .limit(100)

  if (!activeCustomers || activeCustomers.length === 0) {
    return { evaluated: 0, sent: 0, skipped: 0, decisions: [] }
  }

  const decisions: Array<{ customerId: string; decision: AIDecision }> = []
  let sent = 0
  let skipped = 0

  for (const customer of activeCustomers) {
    const decision = await evaluateCustomerCommunication(businessId, customer.customer_id)
    decisions.push({ customerId: customer.customer_id, decision })

    if (decision.shouldSend && decision.ruleId) {
      // Get the rule
      const { data: rule } = await supabase
        .from('communication_rule')
        .select('*')
        .eq('id', decision.ruleId)
        .single()

      if (rule) {
        // Get customer phone
        const { data: cust } = await supabase
          .from('customer')
          .select('phone_number')
          .eq('customer_id', customer.customer_id)
          .single()

        if (cust?.phone_number) {
          const variables = await resolveMessageVariables({
            businessId,
            customerId: customer.customer_id,
          })
          const message = interpolateMessage(rule.message_template, variables)

          await sendSmartMessage({
            businessId,
            customerId: customer.customer_id,
            ruleId: rule.id,
            channel: 'sms',
            recipient: cust.phone_number,
            message,
            aiReason: decision.reason,
          })
          sent++
        } else {
          skipped++
        }
      }
    } else {
      skipped++
    }
  }

  return {
    evaluated: activeCustomers.length,
    sent,
    skipped,
    decisions,
  }
}
