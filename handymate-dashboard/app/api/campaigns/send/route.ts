import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness, checkSmsRateLimit } from '@/lib/auth'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

async function sendSMS(to: string, message: string, from: string): Promise<{ success: boolean; elksId?: string; error?: string }> {
  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: from.substring(0, 11),
        to: to,
        message: message,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return { success: false, error: result.message || 'Unknown error' }
    }

    return { success: true, elksId: result.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const body = await request.json()
    const { campaignId } = body

    // Accept either user auth or internal cron secret
    const cronSecret = request.headers.get('x-cron-secret')
    const isCronCall = cronSecret === process.env.CRON_SECRET

    let businessId: string

    if (isCronCall) {
      // Cron call: look up business_id from campaign directly
      const { data: camp } = await supabase
        .from('sms_campaign')
        .select('business_id')
        .eq('campaign_id', campaignId)
        .single()
      if (!camp) return NextResponse.json({ error: 'Kampanj hittades inte' }, { status: 404 })
      businessId = camp.business_id
    } else {
      // User call: verify ownership via auth
      const business = await getAuthenticatedBusiness(request)
      if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      businessId = business.business_id
    }

    // Hämta kampanj och verifiera ägarskap
    const { data: campaign, error: campaignError } = await supabase
      .from('sms_campaign')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('business_id', businessId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Kampanj hittades inte' }, { status: 404 })
    }

    // Hämta mottagare
    const { data: recipients, error: recipientsError } = await supabase
      .from('sms_campaign_recipient')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')

    if (recipientsError || !recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'Inga mottagare hittades' }, { status: 404 })
    }

    // Rate limit check
    const rateLimit = checkSmsRateLimit(businessId)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    // Get sender name from business_config
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('business_id', businessId)
      .single()
    const senderName = biz?.business_name || 'Handymate'
    let deliveredCount = 0
    let failedCount = 0

    // Mark campaign as sending
    await supabase
      .from('sms_campaign')
      .update({ status: 'sending' })
      .eq('campaign_id', campaignId)

    // Skicka SMS till varje mottagare
    for (const recipient of recipients) {
      const smsRateLimit = checkSmsRateLimit(businessId)
      if (!smsRateLimit.allowed) {
        // Sluta skicka om rate limit nås
        await supabase
          .from('sms_campaign_recipient')
          .update({
            status: 'rate_limited',
            error_message: 'Rate limit exceeded'
          })
          .eq('id', recipient.id)
        failedCount++
        continue
      }

      const result = await sendSMS(recipient.phone_number, campaign.message, senderName)

      if (result.success) {
        deliveredCount++
        await supabase
          .from('sms_campaign_recipient')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            elks_id: result.elksId
          })
          .eq('id', recipient.id)
      } else {
        failedCount++
        await supabase
          .from('sms_campaign_recipient')
          .update({
            status: 'failed',
            error_message: result.error
          })
          .eq('id', recipient.id)
      }

      // Liten paus för att inte överbelasta API:et
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Uppdatera kampanjstatus
    await supabase
      .from('sms_campaign')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        delivered_count: deliveredCount,
        failed_count: failedCount
      })
      .eq('campaign_id', campaignId)

    return NextResponse.json({
      success: true,
      delivered: deliveredCount,
      failed: failedCount
    })

  } catch (error: any) {
    console.error('Campaign send error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
