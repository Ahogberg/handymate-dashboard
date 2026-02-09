import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAdapter } from '@/lib/suppliers/registry'

/**
 * POST /api/grossist/sync-prices - Uppdatera cachade priser
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json().catch(() => ({}))
    const supplierKey = body.supplier_key

    // Hämta anslutna grossister
    let query = supabase
      .from('supplier_connection')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('is_connected', true)

    if (supplierKey) {
      query = query.eq('supplier_key', supplierKey)
    }

    const { data: connections } = await query

    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'Inga anslutna grossister' }, { status: 400 })
    }

    let totalSynced = 0
    let totalFailed = 0

    for (const connection of connections) {
      const adapter = getAdapter(connection.supplier_key)
      if (!adapter) continue

      // Hämta cachade produkter
      const { data: products } = await supabase
        .from('grossist_product')
        .select('product_id, external_id')
        .eq('connection_id', connection.connection_id)

      if (!products || products.length === 0) continue

      // Batcha 20 åt gången
      const batchSize = 20
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)

        const results = await Promise.allSettled(
          batch.map(async (p: any) => {
            const priceResult = await adapter.getPrice(
              connection.credentials || {},
              p.external_id
            )
            if (priceResult) {
              await supabase
                .from('grossist_product')
                .update({
                  purchase_price: priceResult.price,
                  in_stock: priceResult.product.in_stock,
                  stock_quantity: priceResult.product.stock_quantity,
                  last_price_sync: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('product_id', p.product_id)
              return true
            }
            return false
          })
        )

        totalSynced += results.filter(r => r.status === 'fulfilled' && r.value).length
        totalFailed += results.filter(r => r.status === 'rejected').length
      }

      // Uppdatera last_sync_at på connection
      await supabase
        .from('supplier_connection')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_error: totalFailed > 0 ? `${totalFailed} produkter kunde inte synkas` : null,
          updated_at: new Date().toISOString()
        })
        .eq('connection_id', connection.connection_id)
    }

    return NextResponse.json({
      synced: totalSynced,
      failed: totalFailed,
      supplier_key: supplierKey || 'all'
    })

  } catch (error: any) {
    console.error('Sync prices error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
