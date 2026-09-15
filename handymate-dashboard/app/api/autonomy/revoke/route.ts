import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { isAllowlistedKey, revokeAutonomy } from '@/lib/autonomy/earned-autonomy'

/** POST /api/autonomy/revoke { key } — "ta tillbaka ratten" för en åtgärdstyp. */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user=await getCurrentUser(request,business.business_id)
  if(!user||!isOwnerOrAdmin(user))return NextResponse.json({error:'Behörighet saknas.'},{status:403})

  const body = await request.json().catch(() => ({}))
  if(body.expected_business_id!==undefined && body.expected_business_id!==business.business_id)return NextResponse.json({error:'Företaget har ändrats. Ladda om.'},{status:409})
  if (!isAllowlistedKey(body.key)) {
    return NextResponse.json({ error: 'Ogiltig nyckel' }, { status: 400 })
  }

  try {
    await revokeAutonomy(getServerSupabase(), business.business_id, body.key)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Kunde inte stänga av. Försök igen.' }, { status: 503 })
  }
}
