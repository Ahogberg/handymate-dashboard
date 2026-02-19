import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - Lista lagerartiklar
 * Query: category, location, low_stock (bool)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const location = searchParams.get('location')
    const lowStock = searchParams.get('low_stock') === 'true'

    let query = supabase
      .from('inventory')
      .select('*')
      .eq('business_id', business.business_id)
      .order('name', { ascending: true })

    if (category) query = query.eq('category', category)
    if (location) query = query.eq('location', location)

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let items = data || []
    if (lowStock) {
      items = items.filter((i: any) => i.quantity <= i.min_quantity)
    }

    return NextResponse.json({ items })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Lägg till ny lagerartikel
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const body = await request.json()

    const { data, error } = await supabase
      .from('inventory')
      .insert({
        business_id: business.business_id,
        name: body.name,
        description: body.description || null,
        sku: body.sku || null,
        category: body.category || 'material',
        unit: body.unit || 'st',
        quantity: body.quantity || 0,
        min_quantity: body.min_quantity || 0,
        unit_cost: body.unit_cost || 0,
        location: body.location || null,
        supplier: body.supplier || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera lagerartikel
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.id) return NextResponse.json({ error: 'Saknar id' }, { status: 400 })

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.sku !== undefined) updates.sku = body.sku
    if (body.category !== undefined) updates.category = body.category
    if (body.unit !== undefined) updates.unit = body.unit
    if (body.min_quantity !== undefined) updates.min_quantity = body.min_quantity
    if (body.unit_cost !== undefined) updates.unit_cost = body.unit_cost
    if (body.location !== undefined) updates.location = body.location
    if (body.supplier !== undefined) updates.supplier = body.supplier

    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort lagerartikel
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Saknar id' }, { status: 400 })

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
