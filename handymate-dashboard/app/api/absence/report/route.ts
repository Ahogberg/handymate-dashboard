import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getAbsenceWindow, isAbsenceActive } from '@/lib/absence/absence-window'
import { byggFranvarorapport } from '@/lib/absence/franvarorapport'

export const dynamic = 'force-dynamic'

/**
 * GET /api/absence/report — Owner Absence V1 (Etapp Å) återkomstrapport.
 *
 * Samma rollgrind som mission/active och /api/absence (owner-admin).
 * Svarar { rapport: Franvarorapport | null } — null om inget fönster finns
 * ELLER om det nuvarande fönstret fortfarande är aktivt (rapporten hör till
 * ett PASSERAT fönster; se isAbsenceActive-läs-tids-checken). Klienten
 * äger själva avfärdandet (localStorage, samma mönster som måndagsmötets
 * mandagsmoteSeenKey) — den här rutten svarar alltid detsamma för samma
 * fönster, den vet inte om det redan visats.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const window = await getAbsenceWindow(business.business_id)
    if (!window || isAbsenceActive(window, new Date())) {
      return NextResponse.json({ rapport: null })
    }

    const supabase = getServerSupabase()
    const rapport = await byggFranvarorapport(supabase, business.business_id, window)
    return NextResponse.json({ rapport })
  } catch (error: any) {
    console.error('GET /api/absence/report error:', error)
    return NextResponse.json({ rapport: null })
  }
}
