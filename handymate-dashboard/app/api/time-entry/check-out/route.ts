import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { reverseGeocode } from '@/lib/geocoding'

/**
 * POST - Stämpla ut (GPS check-out)
 * Uppdaterar pågående time_entry med check_out_time och beräknar tid
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
      time_entry_id,
      lat,
      lng,
      break_minutes = 0,
      description,
      hourly_rate,
      work_category,
    } = body

    const businessId = business.business_id

    // Hämta den aktiva check-in:en
    let query = supabase
      .from('time_entry')
      .select('*')
      .eq('business_id', businessId)
      .not('check_in_time', 'is', null)
      .is('check_out_time', null)

    if (time_entry_id) {
      query = query.eq('time_entry_id', time_entry_id)
    }

    const { data: entry, error: fetchError } = await query.limit(1).maybeSingle()

    if (fetchError) throw fetchError
    if (!entry) {
      return NextResponse.json(
        { error: 'Ingen aktiv instämpling hittades' },
        { status: 404 }
      )
    }

    // Reverse geocode
    let address: string | null = null
    if (lat && lng) {
      address = await reverseGeocode(lat, lng)
    }

    const now = new Date()
    const checkIn = new Date(entry.check_in_time)
    const grossMinutes = Math.floor((now.getTime() - checkIn.getTime()) / 60000)
    const netMinutes = Math.max(0, grossMinutes - (break_minutes || 0))

    // Hämta business_config för övertidsberäkning och avrundning
    const { data: config } = await supabase
      .from('business_config')
      .select('overtime_after, time_rounding, standard_work_hours, default_break_minutes')
      .eq('business_id', businessId)
      .single()

    // Avrunda tid
    let finalMinutes = netMinutes
    if (config?.time_rounding === '15min') {
      finalMinutes = Math.round(finalMinutes / 15) * 15
    } else if (config?.time_rounding === '30min') {
      finalMinutes = Math.round(finalMinutes / 30) * 30
    }
    finalMinutes = Math.max(0, finalMinutes)

    // Beräkna övertid
    const overtimeAfter = (config?.overtime_after || 8) * 60
    const overtimeMinutes = Math.max(0, finalMinutes - overtimeAfter)

    const updates: Record<string, any> = {
      check_out_time: now.toISOString(),
      check_out_lat: lat || null,
      check_out_lng: lng || null,
      check_out_address: address,
      end_latitude: lat || null,
      end_longitude: lng || null,
      end_address: address,
      duration_minutes: finalMinutes,
      break_minutes: break_minutes || 0,
      overtime_minutes: overtimeMinutes,
    }

    if (description) updates.description = description
    if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate
    if (work_category) updates.work_category = work_category

    const { data: updated, error: updateError } = await supabase
      .from('time_entry')
      .update(updates)
      .eq('time_entry_id', entry.time_entry_id)
      .select('*')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({
      entry: updated,
      summary: {
        gross_minutes: grossMinutes,
        break_minutes: break_minutes || 0,
        net_minutes: finalMinutes,
        overtime_minutes: overtimeMinutes,
      },
    })
  } catch (error: any) {
    console.error('Check-out error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
