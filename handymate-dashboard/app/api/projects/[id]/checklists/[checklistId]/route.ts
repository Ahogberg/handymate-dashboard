import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

/**
 * PATCH /api/projects/[id]/checklists/[checklistId] - Uppdatera checklista
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; checklistId: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const updates: Record<string, any> = {}

    // Update items (toggle checked)
    if (body.items !== undefined) {
      updates.items = body.items
    }

    // Add customer signature
    if (body.customer_signature !== undefined) {
      updates.customer_signature = body.customer_signature
    }
    if (body.customer_name !== undefined) {
      updates.customer_name = body.customer_name
    }

    // Add notes
    if (body.notes !== undefined) {
      updates.notes = body.notes
    }

    // Mark as completed. completed_by sätts ALDRIG från klient-body längre
    // (spoofbart — vem som helst kunde tidigare påstå att vem som helst
    // avslutade egenkontrollen). Härleds istället från sessionen via
    // getCurrentUser() (tasks/multi-employee-parity-plan.md, Etapp 7).
    if (body.status === 'completed') {
      const currentUser = await getCurrentUser(request)
      if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      updates.status = 'completed'
      updates.completed_at = new Date().toISOString()
      updates.completed_by = currentUser.name
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inga fält att uppdatera' }, { status: 400 })
    }

    const { data: checklist, error } = await supabase
      .from('project_checklist')
      .update(updates)
      .eq('id', params.checklistId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ checklist })

  } catch (error: any) {
    console.error('Update project checklist error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]/checklists/[checklistId] - Ta bort checklista
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; checklistId: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { error } = await supabase
      .from('project_checklist')
      .delete()
      .eq('id', params.checklistId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete project checklist error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
