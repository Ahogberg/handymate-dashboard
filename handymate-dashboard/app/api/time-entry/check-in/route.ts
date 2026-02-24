import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { reverseGeocode } from '@/lib/geocoding'

/**
 * POST - Stämpla in (GPS check-in)
 * Skapar en pågående time_entry med check_in_time
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      lat,
      lng,
      project_id,
      customer_id,
      booking_id,
      work_category = 'work',
      business_user_id,
    } = body

    const businessId = business.business_id

    // Kolla om det redan finns en aktiv check-in (ej utstämplad)
    const { data: active } = await supabase
      .from('time_entry')
      .select('time_entry_id')
      .eq('business_id', businessId)
      .eq('business_user_id', business_user_id || businessId)
      .not('check_in_time', 'is', null)
      .is('check_out_time', null)
      .limit(1)

    if (active && active.length > 0) {
      return NextResponse.json(
        { error: 'Du har redan en aktiv instämpling. Stämpla ut först.' },
        { status: 400 }
      )
    }

    // Reverse geocode om koordinater finns
    let address: string | null = null
    if (lat && lng) {
      address = await reverseGeocode(lat, lng)
    }

    const now = new Date()
    const workDate = now.toISOString().split('T')[0]

    const { data: entry, error } = await supabase
      .from('time_entry')
      .insert({
        business_id: businessId,
        business_user_id: business_user_id || null,
        customer_id: customer_id || null,
        booking_id: booking_id || null,
        project_id: project_id || null,
        work_category,
        work_date: workDate,
        check_in_time: now.toISOString(),
        check_in_lat: lat || null,
        check_in_lng: lng || null,
        check_in_address: address,
        start_latitude: lat || null,
        start_longitude: lng || null,
        start_address: address,
        duration_minutes: 0,
        is_billable: work_category === 'work',
      })
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ entry })
  } catch (error: any) {
    console.error('Check-in error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET - Hämta aktiv check-in för aktuell användare
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessUserId = request.nextUrl.searchParams.get('businessUserId')

    let query = supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (customer_id, name),
        business_user:business_user_id (id, name, color)
      `)
      .eq('business_id', business.business_id)
      .not('check_in_time', 'is', null)
      .is('check_out_time', null)

    if (businessUserId) {
      query = query.eq('business_user_id', businessUserId)
    }

    const { data, error } = await query.limit(1).maybeSingle()

    if (error) throw error

    return NextResponse.json({ active: data || null })
  } catch (error: any) {
    console.error('Get active check-in error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
