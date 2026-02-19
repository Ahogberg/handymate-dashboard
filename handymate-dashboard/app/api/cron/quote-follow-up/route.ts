import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/cron/quote-follow-up - Automatisk uppföljning av offerter
 *
 * Schema:
 * - Dag 3: Vänlig påminnelse via SMS
 * - Dag 7: Uppföljning via e-post
 * - Dag 14: Sista påminnelse
 * - Efter valid_until: Markera som expired
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    let followUpsSent = 0
    let expiredCount = 0

    // 1. Mark expired quotes
    const { data: expiredQuotes } = await supabase
      .from('quotes')
      .update({ status: 'expired' })
      .eq('status', 'sent')
      .lt('valid_until', today)
      .select('quote_id')

    expiredCount = expiredQuotes?.length || 0

    // 2. Find sent quotes needing follow-up
    const { data: sentQuotes, error } = await supabase
      .from('quotes')
      .select(`
        quote_id, business_id, customer_id, total, customer_pays,
        created_at, valid_until, follow_up_count, last_follow_up_at,
        customer:customer_id (name, phone_number, email),
        business:business_id (business_name, contact_phone)
      `)
      .eq('status', 'sent')
      .gte('valid_until', today)

    if (error) throw error

    for (const quote of sentQuotes || []) {
      const customer = quote.customer as any
      const business = quote.business as any
      if (!customer) continue

      const daysSinceSent = Math.floor((now.getTime() - new Date(quote.created_at).getTime()) / (1000 * 60 * 60 * 24))
      const followUpCount = quote.follow_up_count || 0

      let shouldFollowUp = false
      let message = ''
      let sendSms = false
      let sendEmail = false

      // Day 3: First reminder (SMS)
      if (daysSinceSent >= 3 && followUpCount === 0) {
        shouldFollowUp = true
        sendSms = true
        message = `Hej ${customer.name}! Vi skickade en offert till dig för några dagar sedan. Har du haft möjlighet att titta på den? Hör gärna av dig om du har frågor. //${business?.business_name || 'Hantverkaren'}`
      }
      // Day 7: Second reminder (Email)
      else if (daysSinceSent >= 7 && followUpCount === 1) {
        shouldFollowUp = true
        sendEmail = true
        message = `Uppföljning av offert - har du funderingar?`
      }
      // Day 14: Final reminder (SMS)
      else if (daysSinceSent >= 14 && followUpCount === 2) {
        shouldFollowUp = true
        sendSms = true
        const daysLeft = Math.floor((new Date(quote.valid_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        message = `Hej ${customer.name}! Er offert på ${(quote.customer_pays || quote.total)?.toLocaleString('sv-SE')} kr gäller i ${daysLeft} dagar till. Vill du gå vidare? //${business?.business_name || 'Hantverkaren'}`
      }

      if (!shouldFollowUp) continue

      // Send SMS
      if (sendSms && customer.phone_number && process.env.ELKS_API_USER) {
        try {
          const auth = Buffer.from(`${process.env.ELKS_API_USER}:${process.env.ELKS_API_PASSWORD}`).toString('base64')
          await fetch('https://api.46elks.com/a1/sms', {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              from: business?.contact_phone || 'Handymate',
              to: customer.phone_number,
              message,
            }),
          })

          // Log SMS
          await supabase.from('sms_log').insert({
            business_id: quote.business_id,
            customer_id: quote.customer_id,
            direction: 'outgoing',
            phone_from: business?.contact_phone || 'system',
            phone_to: customer.phone_number,
            message,
            status: 'sent',
            trigger_type: 'quote_follow_up',
          })
        } catch (smsError) {
          console.error('SMS follow-up error:', smsError)
        }
      }

      // Send Email
      if (sendEmail && customer.email && process.env.RESEND_API_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${business?.business_name || 'Handymate'} <noreply@handymate.se>`,
              to: customer.email,
              subject: `Uppföljning: Er offert på ${(quote.customer_pays || quote.total)?.toLocaleString('sv-SE')} kr`,
              html: `
                <h2>Hej ${customer.name}!</h2>
                <p>Vi skickade en offert till dig för en vecka sedan på <strong>${(quote.customer_pays || quote.total)?.toLocaleString('sv-SE')} kr</strong>.</p>
                <p>Har du haft möjlighet att titta på den? Vi hjälper gärna till med eventuella frågor eller justeringar.</p>
                <p>Offerten gäller till ${new Date(quote.valid_until).toLocaleDateString('sv-SE')}.</p>
                <p>Vänliga hälsningar,<br>${business?.business_name || 'Hantverkaren'}</p>
              `,
            }),
          })
        } catch (emailError) {
          console.error('Email follow-up error:', emailError)
        }
      }

      // Update follow-up count
      await supabase
        .from('quotes')
        .update({
          follow_up_count: followUpCount + 1,
          last_follow_up_at: now.toISOString(),
        })
        .eq('quote_id', quote.quote_id)

      followUpsSent++
    }

    return NextResponse.json({
      success: true,
      follow_ups_sent: followUpsSent,
      expired_count: expiredCount,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error('Quote follow-up cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
