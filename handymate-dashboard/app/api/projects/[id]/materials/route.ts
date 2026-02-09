import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/projects/[id]/materials - Lista material + summering
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

    const { data: materials, error } = await supabase
      .from('project_material')
      .select('*')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const mats = materials || []
    const totalPurchase = mats.reduce((sum: number, m: any) => sum + (m.total_purchase || 0), 0)
    const totalSell = mats.reduce((sum: number, m: any) => sum + (m.total_sell || 0), 0)
    const uninvoicedMats = mats.filter((m: any) => !m.invoiced)
    const uninvoicedSell = uninvoicedMats.reduce((sum: number, m: any) => sum + (m.total_sell || 0), 0)

    return NextResponse.json({
      materials: mats,
      summary: {
        total_purchase: Math.round(totalPurchase),
        total_sell: Math.round(totalSell),
        margin_amount: Math.round(totalSell - totalPurchase),
        margin_percent: totalSell > 0 ? Math.round(((totalSell - totalPurchase) / totalSell) * 1000) / 10 : 0,
        uninvoiced_count: uninvoicedMats.length,
        uninvoiced_sell: Math.round(uninvoicedSell)
      }
    })

  } catch (error: any) {
    console.error('Get materials error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/materials - Lägg till material
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const quantity = body.quantity || 1
    const purchasePrice = body.purchase_price || 0
    const markupPercent = body.markup_percent ?? 20
    const sellPrice = body.sell_price || Math.round(purchasePrice * (1 + markupPercent / 100) * 100) / 100
    const totalPurchase = Math.round(quantity * purchasePrice * 100) / 100
    const totalSell = Math.round(quantity * sellPrice * 100) / 100

    const { data: material, error } = await supabase
      .from('project_material')
      .insert({
        project_id: params.id,
        business_id: business.business_id,
        grossist_product_id: body.grossist_product_id || null,
        supplier_product_id: body.supplier_product_id || null,
        name: body.name,
        sku: body.sku || null,
        supplier_name: body.supplier_name || null,
        quantity,
        unit: body.unit || 'st',
        purchase_price: purchasePrice,
        sell_price: sellPrice,
        markup_percent: markupPercent,
        total_purchase: totalPurchase,
        total_sell: totalSell,
        notes: body.notes || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ material })

  } catch (error: any) {
    console.error('Create material error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/projects/[id]/materials - Uppdatera material
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
    const body = await request.json()

    if (!body.material_id) {
      return NextResponse.json({ error: 'Missing material_id' }, { status: 400 })
    }

    // Hämta befintligt material
    const { data: existing } = await supabase
      .from('project_material')
      .select('*')
      .eq('material_id', body.material_id)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.quantity !== undefined) updates.quantity = body.quantity
    if (body.markup_percent !== undefined) updates.markup_percent = body.markup_percent
    if (body.purchase_price !== undefined) updates.purchase_price = body.purchase_price
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.name !== undefined) updates.name = body.name

    // Omberäkna priser
    const quantity = updates.quantity ?? existing.quantity
    const purchasePrice = updates.purchase_price ?? existing.purchase_price ?? 0
    const markupPercent = updates.markup_percent ?? existing.markup_percent ?? 20
    updates.sell_price = Math.round(purchasePrice * (1 + markupPercent / 100) * 100) / 100
    updates.total_purchase = Math.round(quantity * purchasePrice * 100) / 100
    updates.total_sell = Math.round(quantity * updates.sell_price * 100) / 100

    const { data: material, error } = await supabase
      .from('project_material')
      .update(updates)
      .eq('material_id', body.material_id)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ material })

  } catch (error: any) {
    console.error('Update material error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]/materials - Ta bort material
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const materialId = request.nextUrl.searchParams.get('materialId')

    if (!materialId) {
      return NextResponse.json({ error: 'Missing materialId' }, { status: 400 })
    }

    // Kontrollera att materialet inte är fakturerat
    const { data: existing } = await supabase
      .from('project_material')
      .select('invoiced')
      .eq('material_id', materialId)
      .single()

    if (existing?.invoiced) {
      return NextResponse.json(
        { error: 'Kan inte ta bort fakturerat material' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('project_material')
      .delete()
      .eq('material_id', materialId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete material error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
