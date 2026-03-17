import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/work-orders?project_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('project_id')

    let query = supabase
      .from('work_orders')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ work_orders: data || [] })
  } catch (error: any) {
    console.error('Get work orders error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/work-orders — Skapa arbetsorder
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const { project_id, title } = body
    if (!project_id || !title?.trim()) {
      return NextResponse.json({ error: 'Projekt och titel krävs' }, { status: 400 })
    }

    // Auto-generate order number (AO-NNN per project)
    const { count } = await supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project_id)
      .eq('business_id', business.business_id)

    const orderNumber = `AO-${String((count || 0) + 1).padStart(3, '0')}`
    const id = `wo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: wo, error } = await supabase
      .from('work_orders')
      .insert({
        id,
        business_id: business.business_id,
        project_id,
        order_number: orderNumber,
        title: title.trim(),
        scheduled_date: body.scheduled_date || null,
        scheduled_start: body.scheduled_start || null,
        scheduled_end: body.scheduled_end || null,
        address: body.address?.trim() || null,
        access_info: body.access_info?.trim() || null,
        contact_name: body.contact_name?.trim() || null,
        contact_phone: body.contact_phone?.trim() || null,
        description: body.description?.trim() || null,
        materials_needed: body.materials_needed?.trim() || null,
        tools_needed: body.tools_needed?.trim() || null,
        notes: body.notes?.trim() || null,
        status: 'draft',
        assigned_to: body.assigned_to?.trim() || null,
        assigned_phone: body.assigned_phone?.trim() || null,
      })
      .select()
      .single()

    if (error) throw error

    // Smart dispatch — föreslå tekniker om ingen tilldelad (non-blocking)
    if (!body.assigned_to) {
      try {
        const { suggestDispatch } = await import('@/lib/dispatch')
        await suggestDispatch({
          businessId: business.business_id,
          jobTitle: body.title || 'Arbetsorder',
          jobAddress: body.address || null,
          scheduledStart: body.scheduled_start || body.scheduled_date || new Date().toISOString(),
          scheduledEnd: body.scheduled_end || null,
          jobType: body.title || body.description || '',
          contextType: 'work_order',
          contextId: wo.id,
          customerName: body.contact_name || null,
        })
      } catch (dispatchErr) {
        console.error('Dispatch suggestion error (non-blocking):', dispatchErr)
      }
    }

    return NextResponse.json({ work_order: wo })
  } catch (error: any) {
    console.error('Create work order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/work-orders — Uppdatera arbetsorder
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

    const allowed = [
      'title', 'scheduled_date', 'scheduled_start', 'scheduled_end',
      'address', 'access_info', 'contact_name', 'contact_phone',
      'description', 'materials_needed', 'tools_needed', 'notes',
      'assigned_to', 'assigned_phone', 'status',
    ]

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const f of allowed) {
      if (rest[f] !== undefined) updates[f] = rest[f]
    }

    if (updates.status === 'completed') {
      updates.completed_at = new Date().toISOString()
    }

    const { data: wo, error } = await supabase
      .from('work_orders')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ work_order: wo })
  } catch (error: any) {
    console.error('Update work order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/work-orders
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
      .from('work_orders')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete work order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
