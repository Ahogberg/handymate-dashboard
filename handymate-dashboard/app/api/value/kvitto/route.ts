import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getVardekvitto } from '@/lib/value/vardekvitto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/value/kvitto?period=ÅÅÅÅ-MM — värdekvittot natt 1 (Tur 4 etapp 7).
 *
 * BARA LÄSNING: posten räknas fram ur attributionskärnan varje gång —
 * ingen tabell, ingen insert, inget utskick. Utelämnad period = innevarande
 * kalendermånad (UTC, samma gräns som beräkningen).
 *
 * Rollgrind som observations/pengar: bekräftade kronor per agent är
 * ekonomi — ägare/admin (tests/permission-contract.spec.ts).
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

    const kvitto = await getVardekvitto(getServerSupabase(), business.business_id, period)
    if (!kvitto) {
      return NextResponse.json({ error: 'Ogiltig period — använd formen ÅÅÅÅ-MM' }, { status: 400 })
    }

    return NextResponse.json({ kvitto })
  } catch (err: any) {
    console.error('[value/kvitto] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
