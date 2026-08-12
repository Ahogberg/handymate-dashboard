import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getManadsLedger } from '@/lib/value/ledger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/value/ledger?period=ÅÅÅÅ-MM — Value Ledger-fyrstegsvyn:
 * identifierat → agerat → fakturerat → betalt, alltid strikt åtskilda
 * (se lib/value/ledger.ts). Utelämnad period = innevarande kalendermånad.
 *
 * Rollgrind som pengar/kvitto/agarrapport: ekonomi, ägare/admin
 * (tests/permission-contract.spec.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const nu = new Date()
    const standardPeriod = `${nu.getUTCFullYear()}-${String(nu.getUTCMonth() + 1).padStart(2, '0')}`
    const period = request.nextUrl.searchParams.get('period') || standardPeriod

    const ledger = await getManadsLedger(getServerSupabase(), business.business_id, period)
    if (!ledger) {
      return NextResponse.json({ error: 'Ogiltig period — använd formen ÅÅÅÅ-MM' }, { status: 400 })
    }

    return NextResponse.json({ ledger })
  } catch (err: any) {
    console.error('[value/ledger] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
