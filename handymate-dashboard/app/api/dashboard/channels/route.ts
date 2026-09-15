import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { channelPreflightEnabled, preflightChannel, type Channel } from '@/lib/channels/preflight'
import { morningReliabilityEnabled } from '@/lib/automation/morning-report'
import { svDateStr } from '@/lib/dates'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !['owner','admin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!channelPreflightEnabled() && !morningReliabilityEnabled()) return NextResponse.json({ error: 'Disabled' }, { status: 404 })
  const db = getServerSupabase()
  const channels = channelPreflightEnabled() ? await Promise.all((['sms','email','push'] as Channel[]).map(c => preflightChannel(db, business.business_id, c, { targetUserId: user.user_id }))) : []
  let morning = null
  if (morningReliabilityEnabled()) {
    const result = await db.from('morning_report_runs').select('status, notice, report, updated_at').eq('business_id', business.business_id).eq('day', svDateStr()).maybeSingle()
    if (result.error) return NextResponse.json({ error: 'Rapportstatus kunde inte läsas' }, { status: 503 })
    if (result.data && result.data.status !== 'delivered') morning = { status: result.data.status, message: result.data.notice || 'Morgonrapporten förbereds.', reportReady: !!result.data.report }
  }
  return NextResponse.json({ channels, morning }, { headers: { 'Cache-Control': 'no-store' } })
}
