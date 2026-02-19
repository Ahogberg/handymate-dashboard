import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/campaigns/analytics - Kampanjstatistik
 * Query: campaignId (valfritt, för specifik kampanj)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const campaignId = request.nextUrl.searchParams.get('campaignId')

    if (campaignId) {
      // Specific campaign analytics
      const { data: campaign, error } = await supabase
        .from('sms_campaign')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('business_id', business.business_id)
        .single()

      if (error || !campaign) {
        return NextResponse.json({ error: 'Kampanj hittades inte' }, { status: 404 })
      }

      // Get delivery stats from sms_log
      const { data: logs } = await supabase
        .from('sms_log')
        .select('status, created_at')
        .eq('business_id', business.business_id)
        .eq('trigger_type', 'campaign')
        .eq('trigger_id', campaignId)

      const delivered = (logs || []).filter((l: any) => l.status === 'sent' || l.status === 'delivered').length
      const failed = (logs || []).filter((l: any) => l.status === 'failed').length
      const pending = (logs || []).filter((l: any) => l.status === 'pending').length

      // Check for customer responses within 48h of campaign
      let responseCount = 0
      if (campaign.sent_at) {
        const sentTime = new Date(campaign.sent_at)
        const windowEnd = new Date(sentTime.getTime() + 48 * 60 * 60 * 1000)

        const { count } = await supabase
          .from('sms_log')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.business_id)
          .eq('direction', 'incoming')
          .gte('created_at', sentTime.toISOString())
          .lte('created_at', windowEnd.toISOString())

        responseCount = count || 0
      }

      return NextResponse.json({
        campaign: {
          ...campaign,
          analytics: {
            total_recipients: campaign.recipient_count,
            delivered,
            failed,
            pending,
            delivery_rate: campaign.recipient_count > 0
              ? Math.round((delivered / campaign.recipient_count) * 100)
              : 0,
            response_count: responseCount,
            response_rate: campaign.recipient_count > 0
              ? Math.round((responseCount / campaign.recipient_count) * 100)
              : 0,
          },
        },
      })
    }

    // Overview analytics for all campaigns
    const { data: campaigns, error } = await supabase
      .from('sms_campaign')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const allCampaigns = campaigns || []
    const sentCampaigns = allCampaigns.filter((c: any) => c.status === 'sent')

    const totalRecipients = sentCampaigns.reduce((sum: number, c: any) => sum + (c.recipient_count || 0), 0)
    const totalDelivered = sentCampaigns.reduce((sum: number, c: any) => sum + (c.delivered_count || 0), 0)

    // Monthly trend
    const monthlyData = new Map<string, { sent: number; delivered: number; campaigns: number }>()
    for (const c of sentCampaigns as any[]) {
      const month = (c.sent_at || c.created_at).substring(0, 7) // YYYY-MM
      const existing = monthlyData.get(month) || { sent: 0, delivered: 0, campaigns: 0 }
      existing.sent += c.recipient_count || 0
      existing.delivered += c.delivered_count || 0
      existing.campaigns += 1
      monthlyData.set(month, existing)
    }

    const trend: Array<{ month: string; sent: number; delivered: number; campaigns: number }> = []
    monthlyData.forEach((data, month) => {
      trend.push({ month, ...data })
    })
    trend.sort((a, b) => a.month.localeCompare(b.month))

    return NextResponse.json({
      overview: {
        total_campaigns: allCampaigns.length,
        sent_campaigns: sentCampaigns.length,
        draft_campaigns: allCampaigns.filter((c: any) => c.status === 'draft').length,
        total_recipients: totalRecipients,
        total_delivered: totalDelivered,
        avg_delivery_rate: totalRecipients > 0
          ? Math.round((totalDelivered / totalRecipients) * 100)
          : 0,
        avg_recipients: sentCampaigns.length > 0
          ? Math.round(totalRecipients / sentCampaigns.length)
          : 0,
      },
      trend,
      recent: allCampaigns.slice(0, 5),
    })
  } catch (error: any) {
    console.error('Campaign analytics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
