import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { reconcileProjectOutcomes } from '@/lib/efterkalkyl/reconcile-outcomes'

export const dynamic = 'force-dynamic'

/** Owner/admin-only, idempotent omräkning av saknade och legacy-utfall. */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedLimit = Number(body?.limit)
    const reconcileLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
      : 50

    const result = await reconcileProjectOutcomes(
      getServerSupabase(),
      business.business_id,
      { reconcileLimit },
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('[project-outcomes/reconcile] error:', error)
    return NextResponse.json(
      { error: 'Efterkalkylerna kunde inte stämmas av' },
      { status: 500 },
    )
  }
}
