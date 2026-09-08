import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkSmsRateLimitDb } from '@/lib/rate-limit-db'
import { sendSmsViaElks } from '@/lib/sms-send'
import { checkSmsAllowance } from '@/lib/sms-usage'

function summarize(rows: Array<{ status?: string | null }>) {
  const delivered = rows.filter(row => row.status === 'sent').length
  const failed = rows.filter(row => ['failed', 'rate_limited'].includes(row.status || '')).length
  const uncertain = rows.filter(row => row.status === 'unknown').length
  const in_flight = rows.filter(row => row.status === 'sending').length
  const pending = rows.filter(row => row.status === 'pending').length
  return { delivered, failed, uncertain, in_flight, pending, total: rows.length }
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

    if (recipientsError || !recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'Inga mottagare hittades' }, { status: 404 })
    }

    // Rate limit check
    const rateLimit = await checkSmsRateLimitDb(businessId)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    // Get sender name from business_config
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name, subscription_plan')
      .eq('business_id', businessId)
      .single()
    const senderName = biz?.business_name || 'Handymate'
    const plan = (biz?.subscription_plan || 'starter') as any

    // Kvotkontroll: kampanjutskick räknades INTE mot SMS-kvoten förut → kunde
    // blasta obegränsat. Stoppa om kvoten är slut.
    const allowance = await checkSmsAllowance(businessId, plan)
    if (!allowance.allowed) {
      return NextResponse.json({ error: 'SMS-kvoten är slut för månaden — uppgradera planen för fler SMS.' }, { status: 429 })
    }

    const pendingRecipients = recipients.filter(recipient => recipient.status === 'pending')
    if (pendingRecipients.length === 0) {
      const counts = summarize(recipients)
      return NextResponse.json({ success: counts.failed === 0 && counts.uncertain === 0 && counts.in_flight === 0 && counts.pending === 0, idempotent: true, ...counts })
    }

    // Mark campaign as sending
    await supabase
      .from('sms_campaign')
      .update({ status: 'sending' })
      .eq('campaign_id', campaignId)
      .eq('business_id', businessId)

    // Skicka SMS till varje mottagare
    for (const recipient of pendingRecipients) {
      // Per-recipient CAS: två cron-/webbanrop kan läsa samma pending-lista,
      // men bara ett får gå vidare till den externa effekten.
      const { data: claimed, error: claimError } = await supabase.from('sms_campaign_recipient')
        .update({ status: 'sending', error_message: null }).eq('id', recipient.id).eq('campaign_id', campaignId).eq('status', 'pending').select('id')
      if (claimError || !claimed?.length) continue
      const smsRateLimit = await checkSmsRateLimitDb(businessId)
      if (!smsRateLimit.allowed) {
        // Sluta skicka om rate limit nås
        await supabase
          .from('sms_campaign_recipient')
          .update({
            status: 'rate_limited',
            error_message: 'Rate limit exceeded'
          })
          .eq('id', recipient.id)
          .eq('campaign_id', campaignId)
          .eq('status', 'sending')
        continue
      }

      // Använd kanoniska sändaren → loggar till sms_log (kampanjer var osynliga
      // för analytics/audit förut då lokala sendSMS inte loggade).
      let result
      try {
        result = await sendSmsViaElks({
          supabase, businessId, businessName: senderName, to: recipient.phone_number,
          message: campaign.message, customerId: recipient.customer_id || null,
          relatedId: campaignId, messageType: 'campaign',
          approvalId: `campaign:${campaignId}:${recipient.id}`,
          recipient: 'customer', purpose: 'proactive',
        })
      } catch (sendError) {
        await supabase.from('sms_campaign_recipient').update({ status: 'unknown', error_message: sendError instanceof Error ? sendError.message : String(sendError) })
          .eq('id', recipient.id).eq('campaign_id', campaignId).eq('status', 'sending')
        continue
      }

      if (result.success) {
        // Etapp K (SMS-kvoten i strypunkten, 2026-08-17): sendSmsViaElks
        // räknar nu upp kvoten själv per SMS — och kollar den fail-closed
        // FÖR VARJE mottagare, inte bara en gång vid kampanjstart. Träffar
        // kampanjen hardCap:et halvvägs igenom mottagarlistan blockeras
        // resterande mottagare individuellt (status 'failed' nedan) i
        // stället för att blåsa förbi taket som tidigare.
        await supabase
          .from('sms_campaign_recipient')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            elks_id: result.elksId
          })
          .eq('id', recipient.id)
          .eq('campaign_id', campaignId)
          .eq('status', 'sending')
      } else {
        await supabase
          .from('sms_campaign_recipient')
          .update({
            status: typeof result.status === 'number' ? 'failed' : 'unknown',
            error_message: result.error
          })
          .eq('id', recipient.id)
          .eq('campaign_id', campaignId)
          .eq('status', 'sending')
      }

      // Liten paus för att inte överbelasta API:et
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Slutstatus härleds från beständiga mottagarrader, inte lokala räknare.
    const { data: finalRows, error: finalError } = await supabase.from('sms_campaign_recipient')
      .select('id, status').eq('campaign_id', campaignId)
    if (finalError || !finalRows) return NextResponse.json({ error: 'Mottagarutfallet kunde inte verifieras. Skicka inte kampanjen igen innan status har kontrollerats.' }, { status: 500 })
    const counts = summarize(finalRows)
    const finalStatus = counts.uncertain > 0 ? 'needs_reconciliation' : counts.pending > 0 ? 'scheduled' : counts.in_flight > 0 ? 'sending' : counts.failed > 0 ? 'partial' : 'sent'
    const finalUpdate = counts.in_flight > 0 ? { error: null, data: [{ campaign_id: campaignId }] } : await supabase.from('sms_campaign').update({
        status: finalStatus,
        sent_at: finalStatus === 'sent' ? new Date().toISOString() : null,
        delivered_count: counts.delivered,
        failed_count: counts.failed
      }).eq('campaign_id', campaignId).eq('business_id', businessId).select('campaign_id')
    if (finalUpdate.error || !finalUpdate.data?.length) return NextResponse.json({ error: 'Kampanjens slutstatus kunde inte sparas. Kontrollera mottagarraderna innan ett nytt försök.' }, { status: 500 })

    return NextResponse.json({
      success: finalStatus === 'sent',
      status: finalStatus,
      ...counts,
      ...(counts.uncertain ? { warning: 'Minst ett SMS har osäkert leveransläge. Skicka inte igen innan leverantören har kontrollerats.' } : {})
    })

  } catch (error: any) {
    console.error('Campaign send error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
