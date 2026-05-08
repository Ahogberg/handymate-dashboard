import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { sendOnMyWaySms } from '@/lib/on-my-way'

/**
 * POST /api/on-my-way
 *
 * Booking-baserat "på väg"-flöde för mobile Verksamhet-vyn.
 * Hämtar booking + customer från booking_id, skickar SMS via shared
 * helper (sendOnMyWaySms — samma som /api/sms/on-my-way), och stämplar
 * booking.on_my_way_at.
 *
 * Body: { booking_id: string, lat?: number, lng?: number }
 *
 * Response 200:
 *   { success: true, eta: 'HH:MM' | null, eta_minutes: number | null }
 *
 * Response-koder:
 *   401 — Unauthorized
 *   400 — Missing booking_id, eller customer saknar telefon
 *   404 — Booking eller customer hittades inte
 *   500 — SMS-leverans misslyckades (booking uppdateras INTE i det fallet)
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { booking_id, lat, lng } = body

    if (!booking_id) {
      return NextResponse.json({ error: 'booking_id krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Hämta booking. customer_id är TEXT utan FK declared (samma som
    // time_entry — se TD-7) så vi gör en separat customer-fetch nedan.
    const { data: booking, error: bookingError } = await supabase
      .from('booking')
      .select('booking_id, customer_id')
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (bookingError) {
      console.error('[on-my-way] booking fetch error:', bookingError)
      return NextResponse.json({ error: bookingError.message }, { status: 500 })
    }
    if (!booking) {
      console.warn('[on-my-way] booking not found:', { booking_id, business_id: business.business_id })
      return NextResponse.json({ error: 'Bokning hittades inte' }, { status: 404 })
    }

    if (!booking.customer_id) {
      console.warn('[on-my-way] booking missing customer_id:', { booking_id })
      return NextResponse.json(
        { error: 'Bokningen saknar kund — kan inte skicka på väg-SMS' },
        { status: 400 },
      )
    }

    const { data: customer } = await supabase
      .from('customer')
      .select('name, phone_number, address_line')
      .eq('customer_id', booking.customer_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!customer) {
      console.warn('[on-my-way] customer not found:', { customer_id: booking.customer_id })
      return NextResponse.json({ error: 'Kund hittades inte' }, { status: 404 })
    }

    if (!customer.phone_number) {
      console.warn('[on-my-way] customer missing phone:', { customer_id: booking.customer_id })
      return NextResponse.json(
        { error: 'Kunden saknar telefonnummer' },
        { status: 400 },
      )
    }

    console.log('[on-my-way] resolved:', {
      booking_id,
      customer_id: booking.customer_id,
      has_address: !!customer.address_line,
      has_lat_lng: lat != null && lng != null,
    })

    const result = await sendOnMyWaySms({
      supabase,
      businessId: business.business_id,
      customerPhone: customer.phone_number,
      customerName: customer.name || null,
      customerAddress: customer.address_line || null,
      lat,
      lng,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // SMS levererat → stämpla booking. Inte blockerande för mobilen att
    // få svaret — om UPDATE failar är SMS:et redan skickat och loggat.
    const { error: updateError } = await supabase
      .from('booking')
      .update({ on_my_way_at: new Date().toISOString() })
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)

    if (updateError) {
      console.error('[on-my-way] booking update failed (non-blocking):', updateError)
    }

    return NextResponse.json({
      success: true,
      eta: result.eta,
      eta_minutes: result.eta_minutes,
    })
  } catch (error: any) {
    console.error('[on-my-way] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
