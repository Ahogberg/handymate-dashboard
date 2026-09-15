import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { isAllowlistedKey } from '@/lib/autonomy/earned-autonomy'
import { stopSupervisedAutonomy } from '@/lib/autonomy/consent-grant'
import { verifyAutonomyOffToken } from '@/lib/autonomy/off-token'
/** POST only: link previews and mail scanners cannot revoke through a GET. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  let target = verifyAutonomyOffToken(body?.token)
  if (!target) {
    const business = await getAuthenticatedBusiness(request)
    if (!business)
      return NextResponse.json({ error: 'Logga in.' }, { status: 401 })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !isOwnerOrAdmin(user))
      return NextResponse.json({ error: 'Behörighet saknas.' }, { status: 403 })
    if (!isAllowlistedKey(body?.key))
      return NextResponse.json({ error: 'Ogiltigt val.' }, { status: 400 })
    if (body?.expected_business_id !== business.business_id)
      return NextResponse.json(
        { error: 'Företaget har ändrats. Ladda om.' },
        { status: 409 },
      )
    target = { businessId: business.business_id, key: body.key }
  }
  try {
    await stopSupervisedAutonomy(
      getServerSupabase(),
      target.businessId,
      target.key,
    )
    return NextResponse.json({ stopped: true })
  } catch {
    return NextResponse.json(
      { error: 'Avstängningen kunde inte sparas. Försök igen.' },
      { status: 503 },
    )
  }
}
