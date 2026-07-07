import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * Produktkomponenter (sql/v67_produktbank.sql) — INTERNA kalkylrader som
 * aldrig expanderar till synliga offertrader. Arbetsandelen härleds ur dem
 * vid produktval (lib/products/build-item-snapshot.ts).
 */

async function verifyProductOwnership(
  supabase: ReturnType<typeof getServerSupabase>,
  productId: string,
  businessId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle()
  return !!data
}

/**
 * GET /api/products/[id]/components — komponentlistan för en produkt
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const productId = params.id

    if (!(await verifyProductOwnership(supabase, productId, business.business_id))) {
      return NextResponse.json({ error: 'Produkten hittades inte' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('product_components')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', business.business_id)
      .order('sort_order', { ascending: true })

    if (error) throw error

    return NextResponse.json({ components: data || [] })
  } catch (error: any) {
    console.error('GET product components error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/products/[id]/components — ersätt HELA komponentlistan
 * body: { components: [{ component_type, description, quantity_per_unit, unit, unit_cost }] }
 * Validering sker FÖRE någon skrivning: component_type 'arbete'|'material',
 * quantity_per_unit > 0, unit_cost >= 0, description icke-tom.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const productId = params.id
    const body = await request.json()

    if (!(await verifyProductOwnership(supabase, productId, business.business_id))) {
      return NextResponse.json({ error: 'Produkten hittades inte' }, { status: 404 })
    }

    const components = Array.isArray(body.components) ? body.components : null
    if (!components) {
      return NextResponse.json({ error: 'components (lista) krävs' }, { status: 400 })
    }

    // Validera ALLA rader innan någon skrivning sker
    for (const c of components) {
      if (c.component_type !== 'arbete' && c.component_type !== 'material') {
        return NextResponse.json(
          { error: "Komponenttyp måste vara 'arbete' eller 'material'" },
          { status: 400 }
        )
      }
      if (typeof c.description !== 'string' || !c.description.trim()) {
        return NextResponse.json({ error: 'Beskrivning krävs för varje komponent' }, { status: 400 })
      }
      if (typeof c.quantity_per_unit !== 'number' || Number.isNaN(c.quantity_per_unit) || c.quantity_per_unit <= 0) {
        return NextResponse.json({ error: 'Mängd per enhet måste vara större än 0' }, { status: 400 })
      }
      if (typeof c.unit_cost !== 'number' || Number.isNaN(c.unit_cost) || c.unit_cost < 0) {
        return NextResponse.json({ error: 'Kostnad kan inte vara negativ' }, { status: 400 })
      }
    }

    // Ersätt listan: delete + insert (valideringen ovan har redan fångat
    // ogiltiga rader, så insert-steget kan inte falla på indata).
    const { error: delErr } = await supabase
      .from('product_components')
      .delete()
      .eq('product_id', productId)
      .eq('business_id', business.business_id)

    if (delErr) throw delErr

    if (components.length === 0) {
      return NextResponse.json({ components: [] })
    }

    const inserts = components.map((c: any, idx: number) => ({
      product_id: productId,
      business_id: business.business_id,
      component_type: c.component_type,
      description: c.description.trim(),
      quantity_per_unit: c.quantity_per_unit,
      unit: c.unit || 'st',
      unit_cost: c.unit_cost,
      sort_order: idx,
    }))

    const { data, error: insErr } = await supabase
      .from('product_components')
      .insert(inserts)
      .select()

    if (insErr) throw insErr

    return NextResponse.json({ components: data || [] })
  } catch (error: any) {
    console.error('PUT product components error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
