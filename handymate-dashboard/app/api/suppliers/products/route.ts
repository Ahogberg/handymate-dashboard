import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET - Hämta produkter
 * Query params: businessId, supplierId (optional), search (optional), category (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get('businessId')
    const supplierId = request.nextUrl.searchParams.get('supplierId')
    const search = request.nextUrl.searchParams.get('search')
    const category = request.nextUrl.searchParams.get('category')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100')
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0')

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    let query = supabase
      .from('supplier_product')
      .select(`
        *,
        supplier:supplier_id (
          supplier_id,
          name
        )
      `, { count: 'exact' })
      .eq('business_id', businessId)
      .order('name')
      .range(offset, offset + limit - 1)

    if (supplierId) {
      query = query.eq('supplier_id', supplierId)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const { data: products, error, count } = await query

    if (error) throw error

    // Hämta kategorier för filter
    const { data: categories } = await supabase
      .from('supplier_product')
      .select('category')
      .eq('business_id', businessId)
      .not('category', 'is', null)

    const uniqueCategories = Array.from(new Set(categories?.map((c: { category: string }) => c.category).filter(Boolean)))

    return NextResponse.json({
      products,
      total: count,
      categories: uniqueCategories
    })

  } catch (error: any) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa produkt
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      business_id,
      supplier_id,
      sku,
      name,
      category,
      unit,
      purchase_price,
      sell_price,
      markup_percent
    } = body

    if (!business_id || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Beräkna säljpris om inte angivet
    let finalSellPrice = sell_price
    if (!finalSellPrice && purchase_price && markup_percent) {
      finalSellPrice = purchase_price * (1 + markup_percent / 100)
    }

    const { data, error } = await supabase
      .from('supplier_product')
      .insert({
        business_id,
        supplier_id,
        sku,
        name,
        category,
        unit: unit || 'st',
        purchase_price,
        sell_price: finalSellPrice,
        markup_percent: markup_percent || 20
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ product: data })

  } catch (error: any) {
    console.error('Create product error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera produkt
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_id, ...updates } = body

    if (!product_id) {
      return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })
    }

    // Beräkna säljpris om inköpspris eller markup ändras
    if (updates.purchase_price && updates.markup_percent && !updates.sell_price) {
      updates.sell_price = updates.purchase_price * (1 + updates.markup_percent / 100)
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('supplier_product')
      .update(updates)
      .eq('product_id', product_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ product: data })

  } catch (error: any) {
    console.error('Update product error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort produkt
 */
export async function DELETE(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get('productId')

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('supplier_product')
      .delete()
      .eq('product_id', productId)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete product error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
