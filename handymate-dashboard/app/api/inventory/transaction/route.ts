import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkFeatureAccess } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - Transaktionshistorik
 * Query: inventory_id, project_id, limit
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const featureCheck = checkFeatureAccess(business, 'inventory')
    if (!featureCheck.allowed) {
      return NextResponse.json({ error: featureCheck.error, feature: featureCheck.feature, required_plan: featureCheck.required_plan }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { searchParams } = new URL(request.url)
    const inventoryId = searchParams.get('inventory_id')
    const projectId = searchParams.get('project_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('inventory_transaction')
      .select('*, inventory:inventory_id(name, unit, unit_cost)')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (inventoryId) query = query.eq('inventory_id', inventoryId)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ transactions: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Registrera transaktion (in/ut/justering)
 * Body: { inventory_id, type, quantity, project_id?, note? }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const featureCheck = checkFeatureAccess(business, 'inventory')
    if (!featureCheck.allowed) {
      return NextResponse.json({ error: featureCheck.error, feature: featureCheck.feature, required_plan: featureCheck.required_plan }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.inventory_id || !body.type || body.quantity === undefined) {
      return NextResponse.json({ error: 'Saknar inventory_id, type eller quantity' }, { status: 400 })
    }

    const validTypes = ['in', 'out', 'adjustment']
    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: 'Ogiltig typ. Använd: in, out, adjustment' }, { status: 400 })
    }

    // Check inventory belongs to this business
    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('id', body.inventory_id)
      .eq('business_id', business.business_id)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ error: 'Artikel hittades inte' }, { status: 404 })
    }

    // Calculate quantity change
    let quantityChange = parseFloat(body.quantity)
    if (body.type === 'out') {
      quantityChange = -Math.abs(quantityChange)
    } else if (body.type === 'in') {
      quantityChange = Math.abs(quantityChange)
    }
    // adjustment: use as-is (can be positive or negative)

    // For 'out', check sufficient stock
    if (body.type === 'out' && (item.quantity + quantityChange) < 0) {
      return NextResponse.json(
        { error: `Otillräckligt saldo. Tillgängligt: ${item.quantity}` },
        { status: 400 }
      )
    }

    // Create transaction
    const { data: tx, error: txError } = await supabase
      .from('inventory_transaction')
      .insert({
        business_id: business.business_id,
        inventory_id: body.inventory_id,
        project_id: body.project_id || null,
        type: body.type,
        quantity: quantityChange,
        note: body.note || null,
        created_by: body.created_by || null,
      })
      .select()
      .single()

    if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

    // Update inventory quantity
    const newQuantity = (item.quantity || 0) + quantityChange
    const updates: Record<string, any> = {
      quantity: newQuantity,
      updated_at: new Date().toISOString(),
    }
    if (body.type === 'in') {
      updates.last_restocked_at = new Date().toISOString()
    }

    await supabase
      .from('inventory')
      .update(updates)
      .eq('id', body.inventory_id)

    return NextResponse.json({ transaction: tx, new_quantity: newQuantity }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
