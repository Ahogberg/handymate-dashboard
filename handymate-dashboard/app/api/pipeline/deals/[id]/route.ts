import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * PATCH - Uppdatera deal-fält
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
    const { id } = params

    // Only allow specific fields to be updated
    const allowedFields = [
      'title',
      'description',
      'value',
      'priority',
      'assigned_to',
      'customer_id',
      'quote_id',
      'invoice_id',
      'expected_close_date',
      'lost_reason',
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // Always set updated_at
    updates.updated_at = new Date().toISOString()

    const { data: deal, error } = await supabase
      .from('deal')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ deal })
  } catch (error: any) {
    console.error('Update deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort deal
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
    const { id } = params

    // Verify deal belongs to business
    const { data: existing } = await supabase
      .from('deal')
      .select('id')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    // Delete related pipeline_activity records first
    await supabase
      .from('pipeline_activity')
      .delete()
      .eq('deal_id', id)

    // Delete the deal
    const { error } = await supabase
      .from('deal')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
