import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'

/**
 * GET /api/cron/quote-follow-up - Automatisk uppföljning av offerter via AI agent.
 *
 * Flöde:
 * 1. Markera utgångna offerter som 'expired'
 * 2. Hämta alla skickade offerter som fortfarande är giltiga
 * 3. Bestäm vilka som behöver uppföljning baserat på automation_settings
 * 4. Logga i v3_automation_logs
 * 5. Trigga AI-agent per företag för SMS/email-komposition
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    let followUpsSent = 0

    // 1. Mark expired quotes
    const { data: expiredQuotes } = await supabase
      .from('quotes')
      .update({ status: 'expired' })
      .eq('status', 'sent')
      .lt('valid_until', today)
      .select('quote_id')

    const expiredCount = expiredQuotes?.length || 0

    // 2. Find sent quotes needing follow-up
    const { data: sentQuotes, error } = await supabase
      .from('quotes')
      .select(`
        quote_id, business_id, customer_id, title, total, customer_pays,
        sent_at, valid_until, follow_up_count, last_follow_up_at,
        customer:customer_id (name, phone_number, email)
      `)
      .eq('status', 'sent')
      .gte('valid_until', today)

    if (error) throw error

    // 3. Load automation settings per business (for quote_followup_days)
    const businessIds = Array.from(new Set((sentQuotes || []).map((q: any) => q.business_id as string)))
    const settingsMap = new Map<string, number>()

    if (businessIds.length > 0) {
      const { data: settingsRows } = await supabase
        .from('v3_automation_settings')
        .select('business_id, quote_followup_days')
        .in('business_id', businessIds)

      for (const s of settingsRows || []) {
        settingsMap.set(s.business_id, s.quote_followup_days || 5)
      }
    }

    // 4. Group candidates by business
    const byBusiness = new Map<string, Array<{ quote: any; daysSinceSent: number; channel: string }>>()

    for (const quote of sentQuotes || []) {
      const customer = quote.customer as any
      if (!customer) continue

      // Use sent_at (not created_at) for accurate timing
      const sentDate = quote.sent_at || quote.valid_until
      if (!sentDate) continue

      const daysSinceSent = Math.floor((now.getTime() - new Date(sentDate).getTime()) / (1000 * 60 * 60 * 24))
      const followUpCount = quote.follow_up_count || 0

      // Read follow-up interval from settings, default 5 days
      const followupDays = settingsMap.get(quote.business_id) || 5

      // Determine channel based on follow-up count and days elapsed
      // Round 1: SMS efter followupDays dagar
      // Round 2: Email efter followupDays*2 dagar
      // Round 3: SMS efter followupDays*3 dagar (sista)
      let channel = ''
      if (daysSinceSent >= followupDays && followUpCount === 0) channel = 'sms'
      else if (daysSinceSent >= followupDays * 2 && followUpCount === 1) channel = 'email'
      else if (daysSinceSent >= followupDays * 3 && followUpCount === 2) channel = 'sms'
      else continue

      // Update follow-up count
      await supabase.from('quotes').update({
        follow_up_count: followUpCount + 1,
        last_follow_up_at: now.toISOString(),
      }).eq('quote_id', quote.quote_id)

      // Log to automation logs
      await supabase.from('v3_automation_logs').insert({
        business_id: quote.business_id,
        rule_id: null,
        rule_name: 'Offertuppföljning (cron)',
        action_type: `send_${channel}`,
        status: 'success',
        context: {
          quote_id: quote.quote_id,
          customer_id: quote.customer_id,
          days_since_sent: daysSinceSent,
          follow_up_round: followUpCount + 1,
          channel,
        },
      })

      const list = byBusiness.get(quote.business_id) || []
      list.push({ quote, daysSinceSent, channel })
      byBusiness.set(quote.business_id, list)
      followUpsSent++
    }

    // 5. Trigger agent per business
    let agentTriggered = 0
    for (const [businessId, items] of Array.from(byBusiness)) {
      const quoteList = items.map((item: any) => {
        const c = item.quote.customer as any
        const daysLeft = Math.floor((new Date(item.quote.valid_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return `- Offert "${item.quote.title || item.quote.quote_id}" till ${c?.name || 'Okänd'}: ${(item.quote.customer_pays || item.quote.total || 0).toLocaleString('sv-SE')} kr, skickad för ${item.daysSinceSent} dagar sedan, giltig ${daysLeft} dagar till. Kontakt: telefon ${c?.phone_number || 'saknas'}, email ${c?.email || 'saknas'}. Kanal: ${item.channel}`
      }).join('\n')

      const result = await triggerAgentInternal(
        businessId,
        'cron',
        {
          cron_type: 'quote_followup',
          instruction: `Följ upp dessa offerter. Använd angiven kanal (SMS eller email). Var personlig och fråga om kunden har funderingar:\n\n${quoteList}`,
        },
        makeIdempotencyKey('qfu', businessId, today)
      )
      if (result.success) agentTriggered++
    }

    return NextResponse.json({
      success: true,
      follow_ups_sent: followUpsSent,
      expired_count: expiredCount,
      agent_triggered: agentTriggered,
    })
  } catch (error: any) {
    console.error('Quote follow-up cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
