import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * PUT /api/job-types/[id]
 * Uppdatera namn, färg, pris, sort_order.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.color !== undefined) updates.color = body.color
  if (body.icon !== undefined) updates.icon = body.icon
  if (body.default_hourly_rate !== undefined) updates.default_hourly_rate = body.default_hourly_rate
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('job_types')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business.business_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ job_type: data })
}

/**
 * DELETE /api/job-types/[id]
 * Arkivera (soft delete) — befintliga deals/leads behåller referensen.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('job_types')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', business.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
