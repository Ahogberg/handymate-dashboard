import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ImportedProduct {
  sku?: string
  name: string
  category?: string
  unit?: string
  purchase_price?: number
  markup_percent?: number
}

/**
 * POST - Importera produkter från CSV/JSON
 * Body: { supplier_id, products: ImportedProduct[], mode: 'preview' | 'import' }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const { supplier_id, products, mode, default_markup } = body

    if (!supplier_id || !products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const business_id = authBusiness.business_id

    // Validera och formatera produkter
    const validProducts: any[] = []
    const errors: string[] = []

    products.forEach((p: any, index: number) => {
      // Namn är obligatoriskt
      if (!p.name || typeof p.name !== 'string' || p.name.trim() === '') {
        errors.push(`Rad ${index + 1}: Saknar produktnamn`)
        return
      }

      const product: any = {
        business_id,
        supplier_id,
        name: p.name.trim(),
        sku: p.sku?.toString().trim() || null,
        category: p.category?.trim() || null,
        unit: p.unit?.trim() || 'st',
        purchase_price: null,
        sell_price: null,
        markup_percent: default_markup || 20
      }

      // Parse inköpspris
      if (p.purchase_price !== undefined && p.purchase_price !== null && p.purchase_price !== '') {
        const price = parseFloat(String(p.purchase_price).replace(',', '.').replace(/[^0-9.]/g, ''))
        if (!isNaN(price) && price >= 0) {
          product.purchase_price = price
          // Beräkna säljpris
          product.sell_price = Math.round(price * (1 + product.markup_percent / 100) * 100) / 100
        }
      }

      // Override markup om angett
      if (p.markup_percent !== undefined && p.markup_percent !== null) {
        const markup = parseFloat(String(p.markup_percent).replace(',', '.'))
        if (!isNaN(markup) && markup >= 0) {
          product.markup_percent = markup
          if (product.purchase_price) {
            product.sell_price = Math.round(product.purchase_price * (1 + markup / 100) * 100) / 100
          }
        }
      }

      // Om säljpris är explicit angivet, använd det
      if (p.sell_price !== undefined && p.sell_price !== null && p.sell_price !== '') {
        const sellPrice = parseFloat(String(p.sell_price).replace(',', '.').replace(/[^0-9.]/g, ''))
        if (!isNaN(sellPrice) && sellPrice >= 0) {
          product.sell_price = sellPrice
        }
      }

      validProducts.push(product)
    })

    // Preview mode - returnera bara vad som kommer importeras
    if (mode === 'preview') {
      return NextResponse.json({
        valid: validProducts.length,
        errors: errors.length,
        errorMessages: errors.slice(0, 10), // Max 10 fel
        preview: validProducts.slice(0, 20) // Max 20 förhandsvisning
      })
    }

    // Import mode - spara till databas
    if (validProducts.length === 0) {
      return NextResponse.json({ error: 'Inga giltiga produkter att importera' }, { status: 400 })
    }

    // Batch insert
    const batchSize = 100
    let imported = 0
    let skipped = 0

    for (let i = 0; i < validProducts.length; i += batchSize) {
      const batch = validProducts.slice(i, i + batchSize)

      // Kolla om SKU redan finns (om SKU anges)
      const skusInBatch = batch.filter(p => p.sku).map(p => p.sku)
      let existingSkus: string[] = []

      if (skusInBatch.length > 0) {
        const { data: existing } = await supabase
          .from('supplier_product')
          .select('sku')
          .eq('business_id', business_id)
          .eq('supplier_id', supplier_id)
          .in('sku', skusInBatch)

        existingSkus = existing?.map((e: { sku: string }) => e.sku) || []
      }

      // Filtrera bort produkter med existerande SKU
      const newProducts = batch.filter(p => !p.sku || !existingSkus.includes(p.sku))
      skipped += batch.length - newProducts.length

      if (newProducts.length > 0) {
        const { error } = await supabase
          .from('supplier_product')
          .insert(newProducts)

        if (error) {
          console.error('Batch insert error:', error)
          // Fortsätt med nästa batch
        } else {
          imported += newProducts.length
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: validProducts.length,
      message: `Importerade ${imported} produkter${skipped > 0 ? ` (${skipped} hoppade över - redan finns)` : ''}`
    })

  } catch (error: any) {
    console.error('Import products error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
