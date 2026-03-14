import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/vehicles - Lista fordon
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const showInactive = request.nextUrl.searchParams.get('show_inactive') === 'true'

    let query = supabase
      .from('vehicles')
      .select('*')
      .eq('business_id', business.business_id)
      .order('name')

    if (!showInactive) {
      query = query.eq('is_active', true)
    }

    const { data: vehicles, error } = await query

    if (error) throw error

    return NextResponse.json({ vehicles: vehicles || [] })
  } catch (error: any) {
    console.error('Get vehicles error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/vehicles - Skapa fordon
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const { name, reg_number, billing_type, rate } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const id = `veh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert({
        id,
        business_id: business.business_id,
        name: name.trim(),
        reg_number: reg_number?.trim() || null,
        billing_type: billing_type || 'km',
        rate: rate || 0,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ vehicle })
  } catch (error: any) {
    console.error('Create vehicle error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/vehicles - Uppdatera fordon
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const allowedFields = ['name', 'reg_number', 'billing_type', 'rate', 'is_active']
    const filtered: Record<string, any> = {}
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filtered[field] = updates[field]
      }
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .update(filtered)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ vehicle })
  } catch (error: any) {
    console.error('Update vehicle error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/vehicles - Ta bort fordon
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
      .from('vehicles')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete vehicle error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
