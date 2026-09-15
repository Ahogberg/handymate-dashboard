import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { getImpact } from '@/lib/value/impact'
import { usesKernelValue } from '@/lib/value/kernel-evidence'
import { impactEnabled } from '@/lib/value/impact-flags'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business)
    return NextResponse.json({ error: 'Logga in.' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user))
    return NextResponse.json({ error: 'Behörighet saknas.' }, { status: 403 })
  if (!impactEnabled())
    return NextResponse.json(
      { error: 'Värdeöversikten är inte tillgänglig ännu.' },
      { status: 404 },
    )
  const period =
    request.nextUrl.searchParams.get('period') ??
    new Date().toISOString().slice(0, 7)
  try {
    const db = getServerSupabase()
    if (!(await usesKernelValue(db, business.business_id)))
      return NextResponse.json(
        { error: 'Värdeöversikten är inte aktiverad för företaget ännu.' },
        { status: 404 },
      )
    return NextResponse.json(
      await getImpact(db, business.business_id, period),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof TypeError
            ? 'Välj en giltig månad.'
            : 'Värdeunderlaget kunde inte kontrolleras. Försök igen.',
      },
      { status: error instanceof TypeError ? 400 : 503 },
    )
  }
}
