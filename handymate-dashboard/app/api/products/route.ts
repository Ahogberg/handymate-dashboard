import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/products?search=&category=&category_id=&favorites=&include=components
 * - search matchar namn ELLER artikelnr (sku)
 * - category = legacy-TEXT-kolumnen ('material'/'arbete'/...)
 * - category_id = hierarkisk kategori (product_categories, v67)
 * - include=components → produkternas komponentlista bifogas som `components`
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
    const categoryId = request.nextUrl.searchParams.get('category_id')
    const favorites = request.nextUrl.searchParams.get('favorites')
    const include = request.nextUrl.searchParams.get('include')
    // include_inactive=true — bara för produktbanks-UI:t i inställningarna,
    // så att aktiv-togglen kan slås PÅ igen. Offertsöket skickar aldrig flaggan.
    const includeInactive = request.nextUrl.searchParams.get('include_inactive') === 'true'

    let query = supabase
      .from('products')
      .select('*')
      .eq('business_id', business.business_id)
      .order('is_favorite', { ascending: false })
      .order('name')

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    if (search) {
      // Namn ELLER artikelnr — samma pass-through-mönster som
      // app/api/suppliers/products/route.ts. Kommatecken skulle bryta
      // PostgREST:s or-syntax → strippas ur söktermen.
      const q = search.replace(/,/g, ' ').trim()
      if (q) {
        query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      }
    }
    if (category) {
      query = query.eq('category', category)
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }
    if (favorites === 'true') {
      query = query.eq('is_favorite', true)
    }

    const { data, error } = await query

    if (error) throw error

    let products = data || []

    // include=components → hämta komponenterna för träffarna och bifoga
    if (include === 'components' && products.length > 0) {
      const { data: components, error: compErr } = await supabase
        .from('product_components')
        .select('*')
        .eq('business_id', business.business_id)
        .in('product_id', products.map((p: any) => p.id))
        .order('sort_order', { ascending: true })

      if (compErr) throw compErr

      const byProduct: Record<string, any[]> = {}
      for (const c of components || []) {
        if (!byProduct[c.product_id]) byProduct[c.product_id] = []
        byProduct[c.product_id].push(c)
      }
      products = products.map((p: any) => ({ ...p, components: byProduct[p.id] || [] }))
    }

    return NextResponse.json({ products })
  } catch (error: any) {
    console.error('GET products error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * default_labor_share måste vara null eller 0–1. OBS: 0 är ett GILTIGT värde
 * (ren materialprodukt) — därför uttrycklig typ/range-koll, aldrig falsy-koll.
 */
function invalidLaborShare(value: unknown): boolean {
  if (value === null) return false
  return typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1
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

    if (body.default_labor_share !== undefined && invalidLaborShare(body.default_labor_share)) {
      return NextResponse.json({ error: 'Andel arbete måste vara mellan 0 och 1' }, { status: 400 })
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
        category_id: body.category_id ?? null,
        // ?? — 0 är giltigt värde (ren material), inte falsy-fallback
        default_labor_share: body.default_labor_share ?? null,
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
    if (body.category_id !== undefined) updates.category_id = body.category_id
    if (body.default_labor_share !== undefined) {
      if (invalidLaborShare(body.default_labor_share)) {
        return NextResponse.json({ error: 'Andel arbete måste vara mellan 0 och 1' }, { status: 400 })
      }
      updates.default_labor_share = body.default_labor_share
    }

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
