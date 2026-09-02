import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { hamtaSmhiVader, SmhiUnavailableError } from '@/lib/diary/smhi'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache (2026-08-22-klassen, se CLAUDE.md).
export const dynamic = 'force-dynamic'

/**
 * GET /api/weather?lat&lon&date — Etapp D4 (2026-09-02)
 *
 * Väder för byggdagboken från SMHI, för mobilens GPS-autofyll (B2-kontraktet).
 * Desktop använder INTE den här rutten — där väljs vädret manuellt.
 *
 * Svar: `{ weather, temperature, source: 'smhi', hours_used, wind_speed_max }`
 *   404 — datumet ligger utanför igår→+10 dagar (SMHI har inget att ge)
 *   503 — SMHI svarar inte
 * Koordinaterna begränsas till Sverige-rutan (lat 55–70, lon 10–25): SMHI:s
 * punktprodukter täcker inte mer, och en position utanför den är nästan
 * alltid ett GPS-fel som inte ska bli en väderrad.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const lat = Number(sp.get('lat'))
  const lon = Number(sp.get('lon'))
  const date = sp.get('date') ?? ''

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 55 || lat > 70 || lon < 10 || lon > 25) {
    return NextResponse.json({ error: 'Positionen ligger utanför SMHI:s täckning' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    return NextResponse.json({ error: 'Ange datum som ÅÅÅÅ-MM-DD' }, { status: 400 })
  }

  try {
    const vader = await hamtaSmhiVader({ lat, lon, date })
    if (!vader) {
      return NextResponse.json(
        { error: 'Väder finns bara för idag, igår och de närmaste tio dagarna' },
        { status: 404 },
      )
    }
    return NextResponse.json(vader)
  } catch (error) {
    if (error instanceof SmhiUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Weather route error:', error)
    return NextResponse.json({ error: 'Vädret kunde inte hämtas' }, { status: 500 })
  }
}
