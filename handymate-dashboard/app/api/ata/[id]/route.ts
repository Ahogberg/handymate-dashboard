import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/ata/[id] — Hämta en ÄTA
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (error) throw error

    return NextResponse.json({ ata: data })
  } catch (error: any) {
    console.error('GET /api/ata/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/ata/[id] — Uppdatera ÄTA (redigera, godkänn, avslå)
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
    const body = await request.json()

    // Fetch current state
    const { data: existing, error: fetchError } = await supabase
      .from('project_change')
      .select('status')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    const updates: Record<string, any> = {}

    // Editable fields (only if draft or pending)
    if (existing.status === 'draft' || existing.status === 'pending') {
      if (body.description !== undefined) updates.description = body.description
      if (body.change_type !== undefined) updates.change_type = body.change_type
      if (body.items !== undefined) {
        updates.items = body.items
        const total = (body.items || []).reduce((sum: number, item: any) => {
          return sum + ((item.quantity || 0) * (item.unit_price || 0))
        }, 0)
        updates.total = total
        updates.amount = Math.abs(total)
      }
      if (body.hours !== undefined) updates.hours = body.hours
      if (body.notes !== undefined) updates.notes = body.notes
    }

    // Status transitions
    if (body.status !== undefined) {
      const validTransitions: Record<string, string[]> = {
        draft: ['pending', 'sent'],
        pending: ['approved', 'rejected', 'sent'],
        sent: ['approved', 'rejected', 'signed', 'declined'],
        approved: ['invoiced'],
        signed: ['approved', 'invoiced'],
      }

      const allowed = validTransitions[existing.status] || []
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `Kan inte gå från '${existing.status}' till '${body.status}'` },
          { status: 400 }
        )
      }

      updates.status = body.status

      if (body.status === 'approved') {
        updates.approved_at = new Date().toISOString()
      } else if (body.status === 'rejected') {
        updates.approved_at = null
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('project_change')
      .update(updates)
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    // Update project timestamp
    if (data?.project_id) {
      await supabase
        .from('project')
        .update({ updated_at: new Date().toISOString() })
        .eq('project_id', data.project_id)
    }

    return NextResponse.json({ ata: data })
  } catch (error: any) {
    console.error('PATCH /api/ata/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/ata/[id] — Ta bort ÄTA (bara draft/pending)
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

    // Only allow deleting draft/pending
    const { data: existing } = await supabase
      .from('project_change')
      .select('status')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    if (existing.status !== 'draft' && existing.status !== 'pending') {
      return NextResponse.json({ error: 'Kan bara ta bort utkast eller väntande ÄTA' }, { status: 400 })
    }

    const { error } = await supabase
      .from('project_change')
      .delete()
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/ata/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
