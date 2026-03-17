import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    for (const key of ['name', 'unit', 'min_stock', 'cost_price', 'sell_price', 'location_id', 'current_stock']) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('inventory_items')
      .update(updates)
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
