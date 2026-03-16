import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST /api/pricing/price-lists/[id]/items — Add item to price list
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  // Get max sort_order
  const { data: existing } = await supabase
    .from('price_list_items_v2')
    .select('sort_order')
    .eq('price_list_id', params.id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = ((existing?.[0]?.sort_order as number) || 0) + 1

  const { data, error } = await supabase
    .from('price_list_items_v2')
    .insert({
      price_list_id: params.id,
      business_id: business.business_id,
      name: body.name || 'Ny rad',
      description: body.description || null,
      unit: body.unit || 'tim',
      price: body.price || 0,
      category_slug: body.category_slug || null,
      is_rot_eligible: body.is_rot_eligible || false,
      is_rut_eligible: body.is_rut_eligible || false,
      sort_order: nextOrder,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

/**
 * PUT /api/pricing/price-lists/[id]/items — Bulk update items
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  if (body.items && Array.isArray(body.items)) {
    // Delete all existing, re-insert
    await supabase
      .from('price_list_items_v2')
      .delete()
      .eq('price_list_id', params.id)
      .eq('business_id', business.business_id)

    if (body.items.length > 0) {
      const rows = body.items.map((item: Record<string, unknown>, i: number) => ({
        price_list_id: params.id,
        business_id: business.business_id,
        name: item.name || 'Rad',
        description: item.description || null,
        unit: item.unit || 'tim',
        price: item.price || 0,
        category_slug: item.category_slug || null,
        is_rot_eligible: item.is_rot_eligible || false,
        is_rut_eligible: item.is_rut_eligible || false,
        sort_order: i,
      }))

      const { error } = await supabase
        .from('price_list_items_v2')
        .insert(rows)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Delete single item
  if (body.deleteItemId) {
    await supabase
      .from('price_list_items_v2')
      .delete()
      .eq('id', body.deleteItemId)
      .eq('business_id', business.business_id)
  }

  return NextResponse.json({ success: true })
}
