import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { calculateProfitability } from '@/lib/profitability'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * GET /api/projects/[id]/profitability/mobile
 * Optimerat svar för mobilappen — minimal payload.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const { id: projectId } = await params

    const prof = await calculateProfitability(projectId, business.business_id)

    if (!prof) {
      return NextResponse.json({
        status: 'on_track',
        cost_percent: 0,
        margin: 0,
        message: 'Ingen budgetdata',
      })
    }

    const message = prof.total_budget > 0
      ? `${prof.cost_percent}% av budget använt`
      : 'Ingen budget satt'

    return NextResponse.json({
      status: prof.status,
      cost_percent: prof.cost_percent,
      margin: prof.margin,
      margin_percent: prof.margin_percent,
      message,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
