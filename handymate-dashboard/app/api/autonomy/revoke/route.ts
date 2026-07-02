import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { isAllowlistedKey, revokeAutonomy } from '@/lib/autonomy/earned-autonomy'

/** POST /api/autonomy/revoke { key } — "ta tillbaka ratten" för en åtgärdstyp. */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (!isAllowlistedKey(body.key)) {
    return NextResponse.json({ error: 'Ogiltig nyckel' }, { status: 400 })
  }

  await revokeAutonomy(getServerSupabase(), business.business_id, body.key)
  return NextResponse.json({ ok: true })
}
