import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { items, project_id, note } = await request.json()
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Minst en artikel krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const results: Array<{ item_id: string; success?: boolean; new_stock?: number; error?: string }> = []

    for (const { item_id, quantity } of items) {
      if (!item_id || !quantity || quantity <= 0) continue

      // Hämta artikel
      const { data: item } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', item_id)
        .eq('business_id', business.business_id)
        .single()

      if (!item) {
        results.push({ item_id, error: 'Artikel hittades inte' })
        continue
      }

      if ((item.current_stock || 0) < quantity) {
        results.push({ item_id, error: `Otillräckligt saldo (${item.current_stock} ${item.unit} kvar)` })
        continue
      }

      const newStock = (item.current_stock || 0) - quantity

      // Uppdatera saldo
      await supabase
        .from('inventory_items')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', item_id)

      // Logga rörelse
      await supabase.from('inventory_movements').insert({
        business_id: business.business_id,
        item_id,
        project_id: project_id || null,
        movement_type: 'withdrawal',
        quantity: -quantity,
        note: note || null,
        created_by: business.contact_name,
      })

      // Koppla till projekt om angivet
      if (project_id) {
        await supabase.from('project_material').insert({
          material_id: 'mat_' + Math.random().toString(36).substr(2, 9),
          business_id: business.business_id,
          project_id,
          name: item.name,
          quantity,
          unit: item.unit,
          purchase_price: item.cost_price || 0,
          sell_price: item.sell_price || 0,
          total_purchase: (item.cost_price || 0) * quantity,
          total_sell: (item.sell_price || 0) * quantity,
          from_inventory: true,
          inventory_item_id: item_id,
        })
      }

      // Varning vid lågt saldo
      if (item.min_stock > 0 && newStock <= item.min_stock) {
        const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        await supabase.from('pending_approvals').insert({
          id: approvalId,
          business_id: business.business_id,
          approval_type: 'low_stock_alert',
          title: `Lågt lager: ${item.name}`,
          description: `${newStock} ${item.unit} kvar (min: ${item.min_stock})`,
          status: 'pending',
          risk_level: 'low',
          payload: {
            item_id,
            item_name: item.name,
            current_stock: newStock,
            min_stock: item.min_stock,
            location_id: item.location_id,
          },
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
      }

      results.push({ item_id, success: true, new_stock: newStock })
    }

    return NextResponse.json({ results })
  } catch (error: any) {
    console.error('Inventory withdraw error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
