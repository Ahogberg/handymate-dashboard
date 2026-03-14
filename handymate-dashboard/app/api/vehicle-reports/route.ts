import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

/**
 * GET /api/vehicle-reports - Lista körrapporter
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const params = request.nextUrl.searchParams
    const startDate = params.get('start_date')
    const endDate = params.get('end_date')
    const vehicleId = params.get('vehicle_id')
    const projectId = params.get('project_id')

    let query = supabase
      .from('vehicle_reports')
      .select(`
        *,
        vehicle:vehicle_id (id, name, reg_number, billing_type, rate),
        project:project_id (project_id, name),
        business_user:business_user_id (id, name)
      `)
      .eq('business_id', business.business_id)
      .order('report_date', { ascending: false })

    if (startDate) query = query.gte('report_date', startDate)
    if (endDate) query = query.lte('report_date', endDate)
    if (vehicleId) query = query.eq('vehicle_id', vehicleId)
    if (projectId) query = query.eq('project_id', projectId)

    const { data: reports, error } = await query

    if (error) throw error

    return NextResponse.json({ reports: reports || [] })
  } catch (error: any) {
    console.error('Get vehicle reports error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/vehicle-reports - Skapa körrapport
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    const supabase = getServerSupabase()
    const body = await request.json()

    const {
      vehicle_id,
      project_id,
      lead_id,
      report_date,
      start_address,
      end_address,
      distance,
      distance_unit,
      google_maps_url,
      hours,
      days,
      amount,
      billable,
      notes,
    } = body

    if (!vehicle_id) {
      return NextResponse.json({ error: 'Fordon krävs' }, { status: 400 })
    }

    const id = `vrep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: report, error } = await supabase
      .from('vehicle_reports')
      .insert({
        id,
        business_id: business.business_id,
        business_user_id: currentUser?.id || null,
        vehicle_id,
        project_id: project_id || null,
        lead_id: lead_id || null,
        report_date: report_date || new Date().toISOString().split('T')[0],
        start_address: start_address || null,
        end_address: end_address || null,
        distance: distance || null,
        distance_unit: distance_unit || 'km',
        google_maps_url: google_maps_url || null,
        hours: hours || null,
        days: days || null,
        amount: amount || 0,
        billable: billable ?? true,
        notes: notes || null,
      })
      .select(`
        *,
        vehicle:vehicle_id (id, name, reg_number, billing_type, rate),
        project:project_id (project_id, name),
        business_user:business_user_id (id, name)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ report })
  } catch (error: any) {
    console.error('Create vehicle report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/vehicle-reports - Uppdatera körrapport
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, ...rest } = body

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const allowedFields = [
      'vehicle_id', 'project_id', 'lead_id', 'report_date',
      'start_address', 'end_address', 'distance', 'distance_unit',
      'google_maps_url', 'hours', 'days', 'amount', 'billable', 'notes',
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (rest[field] !== undefined) {
        updates[field] = rest[field]
      }
    }

    const { data: report, error } = await supabase
      .from('vehicle_reports')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select(`
        *,
        vehicle:vehicle_id (id, name, reg_number, billing_type, rate),
        project:project_id (project_id, name),
        business_user:business_user_id (id, name)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ report })
  } catch (error: any) {
    console.error('Update vehicle report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/vehicle-reports - Ta bort körrapport
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('vehicle_reports')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete vehicle report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
