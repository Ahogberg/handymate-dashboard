import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getWeekCapacity, currentWeekMonday } from '@/lib/capacity/week-capacity'
import { aggregeraBelaggning, BELAGGNING_VECKOR } from '@/lib/capacity/belaggning'
import { svDateStrPlusDays } from '@/lib/dates'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/belaggning
 *
 * Beläggningsraden i "Firman just nu" (Command Center C4, 2026-08-17):
 * viktad beläggning + fria timmar för innevarande + två kommande veckor.
 *
 * Tunt uppslagsskal — all kapacitetsmatte bor i lib/capacity/
 * week-capacity.ts (samma motor som /dashboard/schema-ytorna) och
 * aggregeringen i lib/capacity/belaggning.ts (facit:
 * tests/belaggning.spec.ts). Ingen egen beräkning här.
 *
 * Grind: getAuthenticatedBusiness räcker — beläggning är schema, inte
 * ekonomi, och alla inloggade medlemmar får se den. Okonfigurerat konto
 * (ingen kapacitetsinställning och inga aktiva teammedlemmar att gissa
 * ur) svarar ärligt { pct: null, ... } — raden döljs då i UI:t.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const start = currentWeekMonday()
    const veckostarter = Array.from({ length: BELAGGNING_VECKOR }, (_, i) =>
      svDateStrPlusDays(i * 7, new Date(`${start}T12:00:00Z`)),
    )

    const veckor = await Promise.all(
      veckostarter.map(ws => getWeekCapacity(supabase, business.business_id, ws)),
    )

    return NextResponse.json(aggregeraBelaggning(veckor))
  } catch (error: any) {
    console.error('GET /api/dashboard/belaggning error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
