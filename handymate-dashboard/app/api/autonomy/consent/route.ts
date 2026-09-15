import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import {
  grantOnConsent,
  supervisedAutonomyEnabled,
} from '@/lib/autonomy/consent-grant'
export const dynamic = 'force-dynamic'
async function actor(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return null
  const user = await getCurrentUser(request, business.business_id)
  return user && isOwnerOrAdmin(user)
    ? { businessId: business.business_id, userId: user.id }
    : null
}
export async function GET(request: NextRequest) {
  const a = await actor(request)
  if (!a)
    return NextResponse.json({ error: 'Behörighet saknas.' }, { status: 403 })
  if (!supervisedAutonomyEnabled())
    return NextResponse.json({ error: 'Inte aktiverat.' }, { status: 404 })
  const r = await getServerSupabase()
    .from('autonomy_consents')
    .select('answer,answered_at')
    .eq('business_id', a.businessId)
    .maybeSingle()
  if (r.error)
    return NextResponse.json(
      { error: 'Ditt val kunde inte hämtas.' },
      { status: 503 },
    )
  return NextResponse.json(
    { consent: r.data },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
export async function POST(request: NextRequest) {
  const a = await actor(request)
  if (!a)
    return NextResponse.json({ error: 'Behörighet saknas.' }, { status: 403 })
  if (!supervisedAutonomyEnabled())
    return NextResponse.json({ error: 'Inte aktiverat.' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (body?.expected_business_id !== a.businessId)
    return NextResponse.json(
      { error: 'Företaget har ändrats. Ladda om.' },
      { status: 409 },
    )
  if (typeof body?.answer !== 'boolean')
    return NextResponse.json({ error: 'Välj ja eller nej.' }, { status: 400 })
  try {
    const changed = await grantOnConsent(
      getServerSupabase(),
      a.businessId,
      a.userId,
      body.answer,
    )
    return NextResponse.json({ saved: true, changed })
  } catch {
    return NextResponse.json(
      { error: 'Valet kunde inte sparas. Försök igen.' },
      { status: 503 },
    )
  }
}
