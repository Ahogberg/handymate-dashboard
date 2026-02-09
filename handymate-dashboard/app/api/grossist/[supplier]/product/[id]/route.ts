import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAdapter } from '@/lib/suppliers/registry'

/**
 * GET /api/grossist/[supplier]/product/[id] - Produktdetalj + live pris
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { supplier: string; id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { supplier: supplierKey, id: productId } = params

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

    const [product, priceResult] = await Promise.all([
      adapter.getProduct(connection.credentials || {}, productId),
      adapter.getPrice(connection.credentials || {}, productId)
    ])

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({
      product,
      price: priceResult?.price || product.purchase_price,
      currency: priceResult?.currency || 'SEK',
      validUntil: priceResult?.validUntil
    })

  } catch (error: any) {
    console.error('Get grossist product error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
