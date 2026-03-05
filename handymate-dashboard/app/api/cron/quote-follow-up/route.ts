import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'

/**
 * GET /api/cron/quote-follow-up - Automatisk uppföljning av offerter via AI agent.
 * Keeps: Finding candidates, marking expired quotes, updating follow_up_count.
 * Delegates: SMS/email composition and sending to AI agent.
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

    // 1. Mark expired quotes (keep — simple DB op)
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
        quote_id, business_id, customer_id, total, customer_pays,
        created_at, valid_until, follow_up_count, last_follow_up_at,
        customer:customer_id (name, phone_number, email)
      `)
      .eq('status', 'sent')
      .gte('valid_until', today)

    if (error) throw error

    // Group candidates by business
    const byBusiness = new Map<string, Array<{ quote: any; daysSinceSent: number; channel: string }>>()

    for (const quote of sentQuotes || []) {
      const customer = quote.customer as any
      if (!customer) continue

      const daysSinceSent = Math.floor((now.getTime() - new Date(quote.created_at).getTime()) / (1000 * 60 * 60 * 24))
      const followUpCount = quote.follow_up_count || 0

      let channel = ''
      if (daysSinceSent >= 3 && followUpCount === 0) channel = 'sms'
      else if (daysSinceSent >= 7 && followUpCount === 1) channel = 'email'
      else if (daysSinceSent >= 14 && followUpCount === 2) channel = 'sms'
      else continue

      // Update follow-up count (keep — DB tracking)
      await supabase.from('quotes').update({
        follow_up_count: followUpCount + 1,
        last_follow_up_at: now.toISOString(),
      }).eq('quote_id', quote.quote_id)

      const list = byBusiness.get(quote.business_id) || []
      list.push({ quote, daysSinceSent, channel })
      byBusiness.set(quote.business_id, list)
      followUpsSent++
    }

    // Trigger agent per business
    let agentTriggered = 0
    for (const [businessId, items] of Array.from(byBusiness)) {
      const quoteList = items.map((item: any) => {
        const c = item.quote.customer as any
        const daysLeft = Math.floor((new Date(item.quote.valid_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return `- Offert ${item.quote.quote_id} till ${c?.name || 'Okänd'}: ${(item.quote.customer_pays || item.quote.total || 0).toLocaleString('sv-SE')} kr, skickad för ${item.daysSinceSent} dagar sedan, giltig ${daysLeft} dagar till. Kontakt: telefon ${c?.phone_number || 'saknas'}, email ${c?.email || 'saknas'}. Kanal: ${item.channel}`
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
