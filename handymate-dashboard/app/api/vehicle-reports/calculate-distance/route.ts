import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST /api/vehicle-reports/calculate-distance
 * Beräkna avstånd mellan två adresser via Google Maps Distance Matrix API
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { from, to } = await request.json()

    if (!from?.trim() || !to?.trim()) {
      return NextResponse.json({ error: 'Från- och till-adress krävs' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'Google Maps API-nyckel saknas',
        distance_km: null,
        manual: true,
      }, { status: 200 })
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(from)}&destinations=${encodeURIComponent(to)}&key=${apiKey}&language=sv&region=se`

    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK') {
      return NextResponse.json({ error: 'Kunde inte beräkna avstånd', details: data.status }, { status: 400 })
    }

    const element = data.rows?.[0]?.elements?.[0]
    if (!element || element.status !== 'OK') {
      return NextResponse.json({ error: 'Ingen rutt hittades', details: element?.status }, { status: 400 })
    }

    const distanceMeters = element.distance.value
    const distanceKm = Math.round(distanceMeters / 100) / 10 // 1 decimal
    const durationSeconds = element.duration.value
    const durationMinutes = Math.round(durationSeconds / 60)

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`

    return NextResponse.json({
      distance_km: distanceKm,
      distance_text: element.distance.text,
      duration_minutes: durationMinutes,
      duration_text: element.duration.text,
      google_maps_url: mapsUrl,
      origin: data.origin_addresses?.[0] || from,
      destination: data.destination_addresses?.[0] || to,
    })
  } catch (error: any) {
    console.error('Calculate distance error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
