import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Stage everything before making the campaign visible to the send cron.
 * Never replay a campaign after an uncertain outcome. Operators can inspect
 * the existing campaign; retrying an approval must not create a second one.
 */
export async function queueSeasonalCampaign(db: SupabaseClient, businessId: string, approvalId: string, p: Record<string, any>) {
  const campaignId = `camp_${createHash('sha256').update(`${businessId}:${approvalId}`).digest('hex').slice(0,24)}`
  const existing = await db.from('sms_campaign').select('campaign_id, status').eq('campaign_id', campaignId).eq('business_id', businessId).maybeSingle()
  if (existing.error) return { action: 'seasonal_campaign', ok: false, error: 'Kunde inte kontrollera tidigare kampanj.' }
  if (existing.data) return { action: 'seasonal_campaign', ok: false, campaign_id: campaignId,
    error: 'Kampanjen har redan skapats. Kontrollera dess utskicksstatus innan ett nytt utskick görs.' }
  const created = await db.from('sms_campaign').insert({
    campaign_id: campaignId, business_id: businessId, name: `Säsong: ${p.theme || p.month_name}`,
    message: p.sms_text, status: 'draft', scheduled_at: null,
    recipient_count: p.customers.length, campaign_type: 'broadcast',
  })
  if (created.error) return { action: 'seasonal_campaign', ok: false, error: 'Kunde inte skapa kampanjutkastet.' }
  const recipients = await db.from('sms_campaign_recipient').insert(p.customers.map((c: any) => ({
    campaign_id: campaignId, customer_id: c.customer_id, phone_number: c.phone_number, status: 'pending',
  })))
  if (recipients.error) return { action: 'seasonal_campaign', ok: false, campaign_id: campaignId, error: 'Mottagarna kunde inte sparas. Kampanjen är inte köad.' }
  const scheduled = await db.from('sms_campaign').update({ status: 'scheduled', scheduled_at: new Date().toISOString() })
    .eq('campaign_id', campaignId).eq('business_id', businessId).eq('status', 'draft').select('campaign_id')
  if (scheduled.error || scheduled.data?.length !== 1) return { action: 'seasonal_campaign', ok: false, campaign_id: campaignId, error: 'Köningen kunde inte bekräftas. Kontrollera kampanjens status innan du försöker igen.' }
  if (p.month && p.year) {
    const marked = await db.from('seasonal_campaigns').update({ status: 'approved' }).eq('business_id', businessId).eq('year', p.year).eq('month', p.month)
    if (marked.error) console.error('[seasonal_campaign] status metadata update failed', { campaignId })
  }
  return { action: 'seasonal_campaign', ok: true, queued: true, campaign_id: campaignId, recipients: p.customers.length,
    receipt: `Kampanjen är köad för SMS-utskick till ${p.customers.length} mottagare.` }
}
