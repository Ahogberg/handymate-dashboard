import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAdapter } from '@/lib/suppliers/registry'

/**
 * GET /api/grossist/[supplier]/search - Sök produkter hos grossist
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { supplier: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const supplierKey = params.supplier
    const q = request.nextUrl.searchParams.get('q') || ''
    const category = request.nextUrl.searchParams.get('category') || undefined
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20')
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0')

    // Verifiera anslutning
    const { data: connection } = await supabase
      .from('supplier_connection')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('supplier_key', supplierKey)
      .eq('is_connected', true)
      .single()

    if (!connection) {
      return NextResponse.json(
        { error: 'Ej ansluten till denna grossist' },
        { status: 400 }
      )
    }

    const adapter = getAdapter(supplierKey)
    if (!adapter) {
      return NextResponse.json({ error: 'Adapter not found' }, { status: 500 })
    }

    const result = await adapter.searchProducts(
      connection.credentials || {},
      { query: q, category, limit, offset }
    )

    // Cacha resultaten lokalt
    if (result.products.length > 0) {
      const productsToUpsert = result.products.map(p => ({
        connection_id: connection.connection_id,
        business_id: business.business_id,
        supplier_key: supplierKey,
        external_id: p.external_id,
        sku: p.sku || null,
        ean: p.ean || null,
        rsk_number: p.rsk_number || null,
        e_number: p.e_number || null,
        name: p.name,
        description: p.description || null,
        category: p.category || null,
        unit: p.unit,
        purchase_price: p.purchase_price,
        recommended_price: p.recommended_price || null,
        image_url: p.image_url || null,
        in_stock: p.in_stock,
        stock_quantity: p.stock_quantity || null,
        last_price_sync: new Date().toISOString(),
        raw_data: p.raw_data || {},
        updated_at: new Date().toISOString()
      }))

      // Upsert med external_id + connection_id som nyckel
      for (const product of productsToUpsert) {
        const { data: existing } = await supabase
          .from('grossist_product')
          .select('product_id')
          .eq('connection_id', product.connection_id)
          .eq('external_id', product.external_id)
          .single()

        if (existing) {
          await supabase
            .from('grossist_product')
            .update(product)
            .eq('product_id', existing.product_id)
        } else {
          await supabase
            .from('grossist_product')
            .insert(product)
        }
      }
    }

    return NextResponse.json({
      products: result.products,
      total: result.total,
      hasMore: result.hasMore
    })

  } catch (error: any) {
    console.error('Search grossist error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
