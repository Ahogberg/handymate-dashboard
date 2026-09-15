import { autonomyOffToken } from '@/lib/autonomy/off-token'
import { AUTONOMY_META, type AutonomyKey } from '@/lib/autonomy/earned-autonomy'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business)
    return NextResponse.json({ error: 'Logga in.' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user))
    return NextResponse.json({ error: 'Behörighet saknas.' }, { status: 403 })
  if (process.env.HANDOFF_INBOX_ENABLED !== 'true')
    return NextResponse.json(
      { error: 'Inkorgen är inte aktiverad.' },
      { status: 404 },
    )
  const db = getServerSupabase()
  const cursor = request.nextUrl.searchParams.get('after')
  let query = db
    .from('pending_approvals')
    .select('id,title,description,created_at,approval_type')
    .eq('business_id', business.business_id)
    .eq('card_kind', 'notice')
    .order('id')
    .limit(101)
  if (cursor) query = query.gt('id', cursor)
  const [notices, digests, channels] = await Promise.all([
    query,
    db
      .from('handoff_digests')
      .select('day,status,snapshot')
      .eq('business_id', business.business_id)
      .order('day', { ascending: false })
      .limit(31),
    db
      .from('channel_notices')
      .select('channel,day,message')
      .eq('business_id', business.business_id)
      .order('day', { ascending: false })
      .limit(30),
  ])
  if (notices.error || digests.error || channels.error)
    return NextResponse.json(
      { error: 'Inkorgen kunde inte hämtas. Försök igen.' },
      { status: 503 },
    )
  const rows = notices.data || []
  const off_tokens = Object.fromEntries(
    Object.keys(AUTONOMY_META).map((k) => [
      k,
      autonomyOffToken(business.business_id, k as AutonomyKey),
    ]),
  )
  return NextResponse.json(
    {
      off_tokens,
      notices: rows.slice(0, 100),
      next: rows.length > 100 ? rows[99].id : null,
      digests: digests.data,
      channels: channels.data,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
