import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista resor per person/projekt/period
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const businessUserId = request.nextUrl.searchParams.get('businessUserId')
    const projectId = request.nextUrl.searchParams.get('projectId')

    let query = supabase
      .from('travel_entry')
      .select(`
        *,
        business_user:business_user_id (id, name, color),
        customer:customer_id (customer_id, name)
      `)
      .eq('business_id', businessId)
      .order('date', { ascending: false })

    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)
    if (businessUserId) query = query.eq('business_user_id', businessUserId)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) throw error

    const totalKm = (data || []).reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0)
    const totalAmount = (data || []).reduce((sum: number, t: any) => sum + (t.total_amount || 0), 0)
    const totalAllowance = (data || []).reduce((sum: number, t: any) => sum + (t.allowance_amount || 0), 0)

    return NextResponse.json({
      entries: data || [],
      totals: { km: totalKm, amount: totalAmount, allowance: totalAllowance },
    })
  } catch (error: any) {
    console.error('Get travel entries error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa resepost
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
      business_user_id,
      time_entry_id,
      project_id,
      customer_id,
      date,
      from_address,
      to_address,
      distance_km,
      vehicle_type = 'car',
      mileage_rate,
      has_overnight = false,
      meals_provided = 'none',
      allowance_amount = 0,
      description,
    } = body

    const businessId = business.business_id

    // Hämta standard milersättning om ej angiven
    let rate = mileage_rate
    if (rate == null) {
      const { data: config } = await supabase
        .from('business_config')
        .select('mileage_rate')
        .eq('business_id', businessId)
        .single()
      rate = config?.mileage_rate || 25.0
    }

    const totalAmount = Math.round((distance_km || 0) * rate * 100) / 100

    const { data: entry, error } = await supabase
      .from('travel_entry')
      .insert({
        business_id: businessId,
        business_user_id: business_user_id || null,
        time_entry_id: time_entry_id || null,
        project_id: project_id || null,
        customer_id: customer_id || null,
        date: date || new Date().toISOString().split('T')[0],
        from_address: from_address || null,
        to_address: to_address || null,
        distance_km: distance_km || 0,
        vehicle_type,
        mileage_rate: rate,
        total_amount: totalAmount,
        has_overnight,
        meals_provided,
        allowance_amount: allowance_amount || 0,
        description: description || null,
      })
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ entry })
  } catch (error: any) {
    console.error('Create travel entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera resepost
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Recalculate total if distance or rate changed
    const updates: Record<string, any> = { ...fields }
    if (fields.distance_km != null || fields.mileage_rate != null) {
      const km = fields.distance_km ?? 0
      const rate = fields.mileage_rate ?? 25.0
      updates.total_amount = Math.round(km * rate * 100) / 100
    }

    const { data: entry, error } = await supabase
      .from('travel_entry')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ entry })
  } catch (error: any) {
    console.error('Update travel entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort resepost
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const entryId = request.nextUrl.searchParams.get('id')

    if (!entryId) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('travel_entry')
      .delete()
      .eq('id', entryId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete travel entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
