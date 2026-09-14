import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { firstWorkEnabled, getFirstWork } from '@/lib/onboarding/first-work'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business)
    return NextResponse.json({ error: 'Logga in.' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user))
    return NextResponse.json({ error: 'Behörighet saknas.' }, { status: 403 })
  if (!firstWorkEnabled())
    return NextResponse.json(
      { error: 'Inte tillgängligt ännu.' },
      { status: 404 },
    )
  try {
    return NextResponse.json(
      {
        receipt: await getFirstWork(getServerSupabase(), business.business_id),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: 'Ditt sparade jobb kunde inte kontrolleras. Försök igen.' },
      { status: 503 },
    )
  }
}
