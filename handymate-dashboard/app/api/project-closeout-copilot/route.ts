import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { loadCloseoutCopilot } from '@/lib/agents/lars/closeout-copilot'

export const dynamic = 'force-dynamic'

/**
 * Lars läsande avslutsförslag. Rutten kan varken välja tenant från klienten
 * eller stänga ett projekt; den returnerar bara en länk till produktens
 * befintliga projektyta.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const snapshot = await loadCloseoutCopilot(
      getServerSupabase(),
      business.business_id,
      { limit: 3 },
    )

    if (!snapshot.available) {
      return NextResponse.json(
        { error: snapshot.reason || 'Avslutsunderlaget kunde inte läsas' },
        { status: 503 },
      )
    }

    return NextResponse.json(snapshot)
  } catch (error) {
    console.error('[project-closeout-copilot] oväntat fel:', error)
    return NextResponse.json({ error: 'Avslutsförslagen kunde inte läsas' }, { status: 500 })
  }
}
