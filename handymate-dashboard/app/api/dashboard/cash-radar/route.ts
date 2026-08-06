import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { assembleCashRadar } from '@/lib/cash-radar-data'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * GET /api/dashboard/cash-radar
 *
 * Pengar in-radarn: 5 veckostaplar framåt (fakturerat + viktad potential),
 * veckonormal ur egen historik och dippar med åtgärdsförslag. All logik i
 * lib/cash-radar-data.ts (delas med måndagsbriefen — ingen drift).
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
  // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const data = await assembleCashRadar(getServerSupabase(), business.business_id)
  return NextResponse.json(data)
}
