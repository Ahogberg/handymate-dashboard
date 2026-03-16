import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('price_lists_v2')
    .select(`
      *,
      segment:customer_segments(id, name, color),
      contract_type:contract_types(id, name, type),
      items:price_list_items_v2(*)
    `)
    .eq('id', params.id)
    .eq('business_id', business.business_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort items
  if (data?.items) {
    data.items.sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
  }

  return NextResponse.json({ priceList: data })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const allowedFields = [
    'name', 'description', 'segment_id', 'contract_type_id', 'is_default',
    'hourly_rate_normal', 'hourly_rate_ob1', 'hourly_rate_ob2', 'hourly_rate_emergency',
    'material_markup_pct', 'callout_fee',
  ]
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field]
  }

  const { data, error } = await supabase
    .from('price_lists_v2')
    .update(updates)
    .eq('id', params.id)
    .eq('business_id', business.business_id)
    .select(`
      *,
      segment:customer_segments(id, name, color),
      contract_type:contract_types(id, name, type)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ priceList: data })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()

  // Delete items first
  await supabase
    .from('price_list_items_v2')
    .delete()
    .eq('price_list_id', params.id)
    .eq('business_id', business.business_id)

  const { error } = await supabase
    .from('price_lists_v2')
    .delete()
    .eq('id', params.id)
    .eq('business_id', business.business_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
