import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/booking/complete-job
 *
 * Markerar en booking som `completed`. Används från mobile när
 * hantverkaren trycker "Markera som klart"-knappen i Verksamhet-vyn.
 *
 * Body: { booking_id: string }
 *
 * Response 200: { success: true, booking: <updated row> }
 * Response 400: booking_id krävs
 * Response 401: Unauthorized
 * Response 404: Booking hittades inte
 * Response 500: DB-fel
 *
 * Setter både job_status='completed' och completed_at=NOW(). updated_at
 * uppdateras också för att hålla rad-stämpeln ärlig.
 *
 * NOT IMPLEMENTED YET (se TD-13): downstream-automations som
 * auto-invoice-on-complete (finns för projects men inte bookings),
 * fireEvent('job_completed') för nurture/review-request, etc.
 * Mobile får oförändrad respons-shape när detta tillkommer.
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

    const now = new Date().toISOString()
    const { data: updated, error } = await supabase
      .from('booking')
      .update({
        job_status: 'completed',
        completed_at: now,
        updated_at: now,
      })
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) {
      console.error('[booking/complete-job] update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[booking/complete-job] ok:', { booking_id })
    return NextResponse.json({ success: true, booking: updated })
  } catch (error: any) {
    console.error('[booking/complete-job] exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
