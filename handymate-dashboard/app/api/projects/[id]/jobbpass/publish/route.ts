import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { publishJobbpass } from '@/lib/jobbpass/jobbpass'

export const dynamic = 'force-dynamic'

/**
 * POST /api/projects/[id]/jobbpass/publish — Etapp Ä (Jobbpass V1).
 *
 * Publicerar det jobbpass ägaren just ställt in (foturval + samtycke via
 * PATCH /api/projects/[id]/jobbpass). Genererar token vid FÖRSTA publicering
 * — idempotent, en redan publicerad länk byts aldrig ut. Owner-admin, samma
 * grind som huvudrutten (registrerad i tests/permission-contract.spec.ts).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const result = await publishJobbpass(supabase, business.business_id, params.id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({
      jobbpass: {
        id: result.row.id,
        status: result.row.status,
        token: result.row.token,
        published_at: result.row.published_at,
      },
    })
  } catch (error: any) {
    console.error('[projects/jobbpass/publish] oväntat fel:', error)
    return NextResponse.json({ error: 'Publiceringen misslyckades' }, { status: 500 })
  }
}
