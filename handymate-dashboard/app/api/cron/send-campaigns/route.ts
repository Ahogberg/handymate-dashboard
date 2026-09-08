import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * Cron: GET /api/cron/send-campaigns
 * Runs every 15 minutes. Finds campaigns with status='scheduled'
 * where scheduled_at <= now, and triggers sending.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = new Date().toISOString()

  // Find all campaigns due to be sent
  const { data: campaigns, error } = await supabase
    .from('sms_campaign')
    .select('campaign_id, business_id, name, recipient_count')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(50)

  if (error) {
    console.error('[send-campaigns] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ success: true, sent: 0, message: 'Inga kampanjer att skicka' })
  }

  const results: Array<{ campaignId: string; success: boolean; error?: string }> = []

  for (const campaign of campaigns) {
    try {
      const res = await fetch(`${APP_URL}/api/campaigns/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
        body: JSON.stringify({ campaignId: campaign.campaign_id }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success === true) {
        results.push({ campaignId: campaign.campaign_id, success: true })
        console.log(`[send-campaigns] Sent campaign ${campaign.campaign_id} (${campaign.name})`)
      } else {
        results.push({ campaignId: campaign.campaign_id, success: false, error: data.warning || data.error || `Kampanjen fick status ${data.status || res.status}` })
        // Sändrutten har redan sparat partial/needs_reconciliation per
        // mottagare. Cron får aldrig skriva över ett osäkert utfall med ett
        // generiskt failed som kan locka till en ny helsändning.
      }
    } catch (err: any) {
      console.error(`[send-campaigns] Error for ${campaign.campaign_id}:`, err)
      results.push({ campaignId: campaign.campaign_id, success: false, error: err.message })
    }
  }

  const sentCount = results.filter((r) => r.success).length
  console.log(`[send-campaigns] Done. Sent ${sentCount}/${campaigns.length}`)

  return NextResponse.json({
    success: true,
    sent: sentCount,
    total: campaigns.length,
    results,
  })
}
