import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * PATCH /api/schedule/[id] - Uppdatera schema-post
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const entryId = params.id
    const body = await request.json()

    // Verify entry belongs to this business
    const { data: existing, error: fetchError } = await supabase
      .from('schedule_entry')
      .select('id')
      .eq('id', entryId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Schema-post hittades inte' }, { status: 404 })
    }

    // Build update object from allowed fields
    const allowedFields = [
      'business_user_id',
      'project_id',
      'title',
      'description',
      'start_datetime',
      'end_datetime',
      'all_day',
      'type',
      'status',
      'color',
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inga fält att uppdatera' }, { status: 400 })
    }

    // Validate type if provided
    if (updates.type) {
      const validTypes = ['project', 'internal', 'time_off', 'travel']
      if (!validTypes.includes(updates.type)) {
        return NextResponse.json(
          { error: `Ogiltig typ. Giltiga typer: ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate status if provided
    if (updates.status) {
      const validStatuses = ['scheduled', 'completed', 'cancelled']
      if (!validStatuses.includes(updates.status)) {
        return NextResponse.json(
          { error: `Ogiltig status. Giltiga: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate datetime order if both provided
    if (updates.start_datetime && updates.end_datetime) {
      if (new Date(updates.start_datetime) >= new Date(updates.end_datetime)) {
        return NextResponse.json(
          { error: 'start_datetime måste vara före end_datetime' },
          { status: 400 }
        )
      }
    }

    // Set updated_at
    updates.updated_at = new Date().toISOString()

    const { data: entry, error: updateError } = await supabase
      .from('schedule_entry')
      .update(updates)
      .eq('id', entryId)
      .eq('business_id', business.business_id)
      .select(`
        *,
        business_user:business_user_id (id, name, color),
        project:project_id (project_id, name)
      `)
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ entry })

  } catch (error: any) {
    console.error('Update schedule entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/schedule/[id] - Ta bort schema-post
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const entryId = params.id

    // Verify entry belongs to this business
    const { data: existing, error: fetchError } = await supabase
      .from('schedule_entry')
      .select('id')
      .eq('id', entryId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Schema-post hittades inte' }, { status: 404 })
    }

    // Hard delete
    const { error: deleteError } = await supabase
      .from('schedule_entry')
      .delete()
      .eq('id', entryId)
      .eq('business_id', business.business_id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete schedule entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
