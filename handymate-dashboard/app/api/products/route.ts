import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/products?search=&category=&favorites=
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const search = request.nextUrl.searchParams.get('search')
    const category = request.nextUrl.searchParams.get('category')
    const favorites = request.nextUrl.searchParams.get('favorites')

    let query = supabase
      .from('products')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('is_active', true)
      .order('is_favorite', { ascending: false })
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }
    if (category) {
      query = query.eq('category', category)
    }
    if (favorites === 'true') {
      query = query.eq('is_favorite', true)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ products: data || [] })
  } catch (error: any) {
    console.error('GET products error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/products — Skapa ny produkt
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.name || body.sales_price === undefined) {
      return NextResponse.json({ error: 'Namn och försäljningspris krävs' }, { status: 400 })
    }

    // Auto-calculate markup if purchase_price provided
    let markup_percent = body.markup_percent ?? null
    if (body.purchase_price && body.purchase_price > 0 && body.sales_price > 0 && markup_percent === null) {
      markup_percent = Math.round(((body.sales_price - body.purchase_price) / body.purchase_price) * 100)
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        business_id: business.business_id,
        name: body.name,
        description: body.description || null,
        category: body.category || 'material',
        sku: body.sku || null,
        unit: body.unit || 'st',
        purchase_price: body.purchase_price ?? null,
        sales_price: body.sales_price,
        markup_percent,
        rot_eligible: body.rot_eligible || false,
        rut_eligible: body.rut_eligible || false,
        vat_rate: body.vat_rate ?? 0.25,
        is_active: true,
        is_favorite: body.is_favorite || false,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ product: data })
  } catch (error: any) {
    console.error('POST products error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/products — Uppdatera produkt
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.category !== undefined) updates.category = body.category
    if (body.sku !== undefined) updates.sku = body.sku
    if (body.unit !== undefined) updates.unit = body.unit
    if (body.purchase_price !== undefined) updates.purchase_price = body.purchase_price
    if (body.sales_price !== undefined) updates.sales_price = body.sales_price
    if (body.markup_percent !== undefined) updates.markup_percent = body.markup_percent
    if (body.rot_eligible !== undefined) updates.rot_eligible = body.rot_eligible
    if (body.rut_eligible !== undefined) updates.rut_eligible = body.rut_eligible
    if (body.vat_rate !== undefined) updates.vat_rate = body.vat_rate
    if (body.is_active !== undefined) updates.is_active = body.is_active
    if (body.is_favorite !== undefined) updates.is_favorite = body.is_favorite

    // Auto-calculate markup
    if (updates.purchase_price && updates.sales_price && updates.purchase_price > 0) {
      updates.markup_percent = Math.round(((updates.sales_price - updates.purchase_price) / updates.purchase_price) * 100)
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ product: data })
  } catch (error: any) {
    console.error('PUT products error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/products?id=xxx — Soft-delete
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE products error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
