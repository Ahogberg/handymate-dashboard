import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * PATCH /api/projects/[id]/logs/[logId] - Uppdatera dagboksanteckning
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Map frontend field names → actual DB column names
    const fieldMap: Record<string, string> = {
      log_date: 'date',
      weather: 'weather',
      temperature: 'temperature',
      work_description: 'work_performed',
      materials_used: 'materials_used',
      hours_worked: 'hours_worked',
      notes: 'description',
      photos: 'photos',
      workers_present: 'workers_count',
      deviations: 'issues',
    }

    const updates: Record<string, any> = {}
    for (const [frontendKey, dbKey] of Object.entries(fieldMap)) {
      if (body[frontendKey] !== undefined) {
        updates[dbKey] = body[frontendKey]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inga fält att uppdatera' }, { status: 400 })
    }

    const { data: log, error } = await supabase
      .from('project_log')
      .update(updates)
      .eq('id', params.logId)
      .eq('order_id', params.id)
      .eq('business_id', business.business_id)
      .select(`
        *,
        business_user:business_user_id (id, name, color)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ log })

  } catch (error: any) {
    console.error('Update project log error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]/logs/[logId] - Ta bort dagboksanteckning
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { error } = await supabase
      .from('project_log')
      .delete()
      .eq('id', params.logId)
      .eq('order_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete project log error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
