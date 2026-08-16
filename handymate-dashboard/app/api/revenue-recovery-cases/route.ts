import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { loadRevenueRecoveryCases } from '@/lib/value/load-revenue-recovery-cases'
import { selectRevenueRecoveryCasesForDashboard } from '@/lib/value/revenue-recovery-case'

export const dynamic = 'force-dynamic'

/**
 * GET /api/revenue-recovery-cases
 *
 * Owner/admin-grindad, read-only Business Twin-yta. Routen utför inga
 * approvals, skapar ingen ÄTA och skickar ingen faktura; next_action är bara
 * en länk till den befintliga produktionsytan där respektive beslut redan bor.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const cases = await loadRevenueRecoveryCases(
      getServerSupabase(),
      business.business_id,
    )

    return NextResponse.json({
      cases: selectRevenueRecoveryCasesForDashboard(cases, Date.now()),
    })
  } catch (error: any) {
    console.error('GET /api/revenue-recovery-cases error:', error)
    return NextResponse.json(
      { error: 'Intäktsåtervinningen kunde inte läsas' },
      { status: 500 },
    )
  }
}
