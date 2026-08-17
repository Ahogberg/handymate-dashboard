import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { listMissionFacit } from '@/lib/mission/mission-facit'
import { byggLearningRows } from '@/lib/mission/mission-learning'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mission/history — uppdragshistorik + per-agent-facit + Mission
 * Learning-läslagret (Etapp H, tasks/jaunty-pondering-hummingbird.md).
 *
 * Svarsformen: { facit, learning }. `facit` är de senaste uppdragen (alla
 * statusar, nyast först — inkluderar det AKTIVA uppdraget om ett finns,
 * eftersom bara ETT kan vara aktivt åt gången och det därmed normalt är det
 * senast skapade). MissionPanel.tsx plockar ut den aktiva radens per_agent
 * för sitt team-läge och resten som historik — EN fetch, samma svar delas.
 *
 * Rollgrind som value/ledger och mission/active (Etapp D-mönstret): pengamål
 * och verifierat betalt är samma finansiella känslighet — ägare/admin
 * (tests/permission-contract.spec.ts).
 *
 * Fail-soft hela vägen: listMissionFacit degraderar redan till tom lista på
 * varje läsfel (mission-tabellen körs manuellt, sql/v144). Klienten döljer
 * historik-/lärandesektionerna tyst när facit/learning är tomma.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const facit = await listMissionFacit(supabase, business.business_id)
    const learning = byggLearningRows(facit)

    return NextResponse.json({ facit, learning })
  } catch (error: any) {
    console.error('GET /api/mission/history error:', error)
    return NextResponse.json({ facit: [], learning: { rows: [], forTidigt: true, antalEligible: 0 } })
  }
}
