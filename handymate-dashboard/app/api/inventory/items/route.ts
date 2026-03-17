import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const locationId = request.nextUrl.searchParams.get('location_id')

    const supabase = getServerSupabase()
    let query = supabase
      .from('inventory_items')
      .select('*, location:inventory_locations(id, name)')
      .eq('business_id', business.business_id)
      .order('name')

    if (locationId) query = query.eq('location_id', locationId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ items: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, location_id, unit, min_stock, cost_price, sell_price, current_stock } = await request.json()
    if (!name || !location_id) return NextResponse.json({ error: 'Namn och plats krävs' }, { status: 400 })

    const supabase = getServerSupabase()

    const { data: item, error } = await supabase
      .from('inventory_items')
      .insert({
        business_id: business.business_id,
        location_id,
        name,
        unit: unit || 'st',
        min_stock: min_stock || 0,
        cost_price: cost_price || 0,
        sell_price: sell_price || 0,
        current_stock: current_stock || 0,
      })
      .select()
      .single()

    if (error) throw error

    // Logga initial stock som inventory_count
    if (current_stock > 0) {
      await supabase.from('inventory_movements').insert({
        business_id: business.business_id,
        item_id: item.id,
        movement_type: 'inventory_count',
        quantity: current_stock,
        note: 'Startsaldo',
        created_by: business.contact_name,
      })
    }

    return NextResponse.json({ item })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
