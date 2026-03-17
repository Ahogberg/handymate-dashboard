import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const itemId = request.nextUrl.searchParams.get('item_id')

    const supabase = getServerSupabase()
    let query = supabase
      .from('inventory_movements')
      .select('*, item:inventory_items(name, unit)')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (itemId) query = query.eq('item_id', itemId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ movements: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { item_id, movement_type, quantity, note } = await request.json()
    if (!item_id || !movement_type || quantity == null) {
      return NextResponse.json({ error: 'item_id, movement_type och quantity krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Hämta aktuellt saldo
    const { data: item } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', item_id)
      .eq('business_id', business.business_id)
      .single()

    if (!item) return NextResponse.json({ error: 'Artikel hittades inte' }, { status: 404 })

    // Uppdatera saldo
    const newStock = movement_type === 'inventory_count'
      ? quantity
      : (item.current_stock || 0) + quantity

    await supabase
      .from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', item_id)

    // Logga rörelse
    const { data: movement, error } = await supabase
      .from('inventory_movements')
      .insert({
        business_id: business.business_id,
        item_id,
        movement_type,
        quantity,
        note: note || null,
        created_by: business.contact_name,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ movement, new_stock: newStock })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
