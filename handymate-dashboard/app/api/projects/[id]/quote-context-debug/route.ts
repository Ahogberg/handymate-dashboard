import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getProjectQuoteContext } from '@/lib/projects/get-quote-context'

export const dynamic = 'force-dynamic'

/**
 * ⚠️ TEMPORÄR DEBUG-ENDPOINT (Etapp 3.1, 2026-05-22).
 *
 * GET /api/projects/[id]/quote-context-debug
 *
 * Returnerar rå output från getProjectQuoteContext-helpern för
 * verifiering att helpern läser rätt data från offert-källan.
 *
 * SKA TAS BORT efter Etapp 3 är verifierad och 3.2-3.4 har byggts.
 * Loggad som TD-67 i tasks/tech-debt.md.
 *
 * Rollskydd: owner/admin-only — offert-data innehåller priser och
 * marginal-information som anställda inte ska se via debug-vägar.
 * Samma mönster som /api/business-config/internal-cost-default.
 */
function canSeeDebugData(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!canSeeDebugData(currentUser?.role)) {
      return NextResponse.json(
        { error: 'Endast owner/admin' },
        { status: 403 },
      )
    }

    const supabase = getServerSupabase()
    const context = await getProjectQuoteContext(
      supabase,
      params.id,
      business.business_id,
    )

    return NextResponse.json({
      _debug_note: 'Temporär endpoint för Etapp 3.1-verifiering. Tas bort efter 3.2-3.4 byggts (TD-66).',
      project_id: params.id,
      business_id: business.business_id,
      context,
    })
  } catch (error: any) {
    console.error('[quote-context-debug] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
