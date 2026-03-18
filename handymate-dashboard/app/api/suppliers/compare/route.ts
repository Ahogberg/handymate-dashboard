import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

interface PriceWarning {
  product_name: string
  quote_price: number
  normal_price: number
  supplier_name: string
  difference_pct: number
}

interface CheaperAlternative {
  product_name: string
  current_supplier: string
  current_price: number
  cheaper_supplier: string
  cheaper_price: number
  savings_pct: number
}

/**
 * POST /api/suppliers/compare — Jämför materiallista mot leverantörspriser
 * Body: { items: [{ description, unit_price, unit }] }
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const items: Array<{ description: string; unit_price: number; unit?: string }> = body.items || []

  if (items.length === 0) {
    return NextResponse.json({ warnings: [], alternatives: [] })
  }

  const supabase = getServerSupabase()

  // Hämta alla manuella produkter
  const { data: products } = await supabase
    .from('manual_supplier_products')
    .select('*, supplier:manual_suppliers(name)')
    .eq('business_id', business.business_id)

  if (!products || products.length === 0) {
    return NextResponse.json({ warnings: [], alternatives: [] })
  }

  const warnings: PriceWarning[] = []
  const alternatives: CheaperAlternative[] = []

  for (const item of items) {
    const desc = (item.description || '').toLowerCase()
    if (!desc || item.unit_price <= 0) continue

    // Hitta matchande produkter (fuzzy)
    const matches = products.filter((p: any) => {
      const pName = (p.name || '').toLowerCase()
      // Enkel matchning — ord-överlapp
      const descWords = desc.split(/\s+/).filter((w: string) => w.length > 2)
      const nameWords = pName.split(/\s+/).filter((w: string) => w.length > 2)
      const shared = descWords.filter((w: string) => nameWords.some((nw: string) => nw.includes(w) || w.includes(nw)))
      return shared.length >= 1
    })

    if (matches.length === 0) continue

    // Prisvarning: om offertpris > 10% över normalpris
    for (const match of matches) {
      const normalPrice = Number(match.normal_price) || Number(match.current_price) || 0
      if (normalPrice > 0 && item.unit_price > normalPrice * 1.1) {
        const diff = Math.round(((item.unit_price - normalPrice) / normalPrice) * 100)
        warnings.push({
          product_name: match.name,
          quote_price: item.unit_price,
          normal_price: normalPrice,
          supplier_name: (match.supplier as any)?.name || 'Okänd',
          difference_pct: diff,
        })
      }
    }

    // Billigare alternativ bland leverantörer
    if (matches.length >= 2) {
      const sorted = matches
        .map((m: any) => ({
          name: m.name,
          supplier: (m.supplier as any)?.name || 'Okänd',
          price: Number(m.current_price) || Number(m.normal_price) || 0,
        }))
        .filter((m: { price: number }) => m.price > 0)
        .sort((a: { price: number }, b: { price: number }) => a.price - b.price)

      if (sorted.length >= 2 && sorted[0].price < sorted[1].price * 0.92) {
        alternatives.push({
          product_name: item.description,
          current_supplier: sorted[1].supplier,
          current_price: sorted[1].price,
          cheaper_supplier: sorted[0].supplier,
          cheaper_price: sorted[0].price,
          savings_pct: Math.round((1 - sorted[0].price / sorted[1].price) * 100),
        })
      }
    }
  }

  return NextResponse.json({ warnings, alternatives })
}
