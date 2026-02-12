import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const now = new Date()

    // This week
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Monday
    weekStart.setHours(0, 0, 0, 0)

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Today
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // Week stats
    const { count: weekTotal } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .gte('created_at', weekStart.toISOString())

    const { count: weekSent } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .gte('created_at', weekStart.toISOString())
      .in('status', ['sent', 'delivered'])

    const { count: weekFailed } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .gte('created_at', weekStart.toISOString())
      .eq('status', 'failed')

    // Month stats
    const { count: monthTotal } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .gte('created_at', monthStart.toISOString())

    // Today stats
    const { count: todayTotal } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .gte('created_at', todayStart.toISOString())

    // By channel
    const { data: channelStats } = await supabase
      .from('communication_log')
      .select('channel')
      .eq('business_id', business.business_id)
      .gte('created_at', weekStart.toISOString())

    const smsCount = (channelStats || []).filter((c: any) => c.channel === 'sms').length
    const emailCount = (channelStats || []).filter((c: any) => c.channel === 'email').length

    const deliveryRate = (weekTotal || 0) > 0
      ? Math.round(((weekSent || 0) / (weekTotal || 1)) * 100)
      : 100

    return NextResponse.json({
      today: todayTotal || 0,
      week: {
        total: weekTotal || 0,
        sent: weekSent || 0,
        failed: weekFailed || 0,
        deliveryRate,
      },
      month: {
        total: monthTotal || 0,
      },
      channels: {
        sms: smsCount,
        email: emailCount,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
