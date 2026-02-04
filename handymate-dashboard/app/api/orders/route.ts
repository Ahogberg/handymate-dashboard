import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface OrderItem {
  product_id?: string
  name: string
  sku?: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  supplier_id?: string
  supplier_name?: string
}

/**
 * GET - Lista materialbeställningar
 */
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get('businessId')
    const status = request.nextUrl.searchParams.get('status')
    const supplierId = request.nextUrl.searchParams.get('supplierId')

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    let query = supabase
      .from('material_order')
      .select(`
        *,
        supplier:supplier_id (
          supplier_id,
          name,
          contact_email,
          contact_phone
        ),
        quote:quote_id (
          quote_id,
          title,
          customer_id
        )
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (supplierId) {
      query = query.eq('supplier_id', supplierId)
    }

    const { data: orders, error } = await query

    if (error) throw error

    return NextResponse.json({ orders })

  } catch (error: any) {
    console.error('Get orders error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa materialbeställning
 * Kan skapas från offert eller manuellt
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      business_id,
      supplier_id,
      quote_id,
      items,
      delivery_address,
      notes
    } = body

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    // Beräkna total
    const total = items.reduce((sum: number, item: OrderItem) => sum + (item.total || 0), 0)

    const { data: order, error: insertError } = await supabase
      .from('material_order')
      .insert({
        business_id,
        supplier_id,
        quote_id,
        items,
        total,
        status: 'draft',
        delivery_address,
        notes
      })
      .select(`
        *,
        supplier:supplier_id (
          supplier_id,
          name,
          contact_email,
          contact_phone
        )
      `)
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ order })

  } catch (error: any) {
    console.error('Create order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera beställning
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id, items, status, delivery_address, notes } = body

    if (!order_id) {
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })
    }

    const updates: Record<string, any> = {}

    if (items) {
      updates.items = items
      updates.total = items.reduce((sum: number, item: OrderItem) => sum + (item.total || 0), 0)
    }

    if (status) {
      updates.status = status
      if (status === 'ordered') {
        updates.ordered_at = new Date().toISOString()
      }
    }

    if (delivery_address !== undefined) updates.delivery_address = delivery_address
    if (notes !== undefined) updates.notes = notes

    const { data: order, error } = await supabase
      .from('material_order')
      .update(updates)
      .eq('order_id', order_id)
      .select(`
        *,
        supplier:supplier_id (
          supplier_id,
          name,
          contact_email,
          contact_phone
        )
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ order })

  } catch (error: any) {
    console.error('Update order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort beställning (endast utkast)
 */
export async function DELETE(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    // Verifiera att beställningen är ett utkast
    const { data: existing } = await supabase
      .from('material_order')
      .select('status')
      .eq('order_id', orderId)
      .single()

    if (existing?.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft orders can be deleted' }, { status: 400 })
    }

    const { error } = await supabase
      .from('material_order')
      .delete()
      .eq('order_id', orderId)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
