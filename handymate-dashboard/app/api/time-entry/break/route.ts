import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST - Uppdatera rastminuter på en aktiv check-in
 * body: { time_entry_id?, break_minutes }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { time_entry_id, break_minutes } = body

    if (break_minutes == null || break_minutes < 0) {
      return NextResponse.json({ error: 'Ogiltigt rastvärde' }, { status: 400 })
    }

    const businessId = business.business_id

    // Hitta aktiv check-in
    let query = supabase
      .from('time_entry')
      .select('time_entry_id, check_in_time')
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

    const { data: updated, error: updateError } = await supabase
      .from('time_entry')
      .update({ break_minutes })
      .eq('time_entry_id', entry.time_entry_id)
      .select('time_entry_id, break_minutes')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ entry: updated })
  } catch (error: any) {
    console.error('Break update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
