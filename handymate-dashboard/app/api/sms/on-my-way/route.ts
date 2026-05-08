import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { sendOnMyWaySms } from '@/lib/on-my-way'

/**
 * POST /api/sms/on-my-way
 * Skicka "på väg"-SMS med beräknad ankomsttid.
 * Caller skickar customer-data direkt i body — för booking-baserade flöden,
 * använd /api/on-my-way som hämtar customer från booking_id.
 *
 * Body: { customer_phone, customer_name?, customer_address?, lat?, lng?, message? }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { customer_phone, customer_name, customer_address, lat, lng, message } = body

    if (!customer_phone) {
      return NextResponse.json({ error: 'Kundtelefonnummer saknas' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const result = await sendOnMyWaySms({
      supabase,
      businessId: business.business_id,
      customerPhone: customer_phone,
      customerName: customer_name || null,
      customerAddress: customer_address || null,
      lat,
      lng,
      message,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      eta: result.eta,
      message_preview: result.message_preview,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
