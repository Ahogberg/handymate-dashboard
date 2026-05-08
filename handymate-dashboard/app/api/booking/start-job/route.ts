import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/booking/start-job
 *
 * Markerar en booking som `in_progress`. Används från mobile när
 * hantverkaren trycker "Starta jobb"-knappen i Verksamhet-vyn.
 *
 * Body: { booking_id: string }
 *
 * Response 200: { success: true, booking: <updated row> }
 * Response 400: booking_id krävs
 * Response 401: Unauthorized
 * Response 404: Booking hittades inte
 * Response 500: DB-fel
 *
 * Idempotent — UPDATE skriver över oavsett tidigare status. Mobile
 * gating ansvarar för att inte visa knappen i fel state.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { booking_id } = body
    if (!booking_id) {
      return NextResponse.json({ error: 'booking_id krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data: existing } = await supabase
      .from('booking')
      .select('booking_id')
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Bokning hittades inte' }, { status: 404 })
    }

    const { data: updated, error } = await supabase
      .from('booking')
      .update({
        job_status: 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) {
      console.error('[booking/start-job] update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[booking/start-job] ok:', { booking_id })
    return NextResponse.json({ success: true, booking: updated })
  } catch (error: any) {
    console.error('[booking/start-job] exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
