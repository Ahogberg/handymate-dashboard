import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/supplier-invoices?project_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('project_id')

    let query = supabase
      .from('supplier_invoices')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ invoices: data || [] })
  } catch (error: any) {
    console.error('Get supplier invoices error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/supplier-invoices — Skapa leverantörsfaktura
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.supplier_name?.trim()) {
      return NextResponse.json({ error: 'Leverantörsnamn krävs' }, { status: 400 })
    }

    const amountExclVat = parseFloat(body.amount_excl_vat) || 0
    const vatAmount = parseFloat(body.vat_amount) || 0
    const totalAmount = body.total_amount ? parseFloat(body.total_amount) : amountExclVat + vatAmount

    const id = `sinv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .insert({
        id,
        business_id: business.business_id,
        project_id: body.project_id || null,
        supplier_name: body.supplier_name.trim(),
        invoice_number: body.invoice_number?.trim() || null,
        invoice_date: body.invoice_date || null,
        due_date: body.due_date || null,
        amount_excl_vat: amountExclVat,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        markup_percent: parseFloat(body.markup_percent) || 0,
        billable_to_customer: body.billable_to_customer ?? true,
        show_to_customer: body.show_to_customer ?? false,
        status: 'unpaid',
        receipt_url: body.receipt_url || null,
        notes: body.notes?.trim() || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error('Create supplier invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/supplier-invoices — Uppdatera leverantörsfaktura
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, ...rest } = body

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const allowed = [
      'supplier_name', 'invoice_number', 'invoice_date', 'due_date',
      'amount_excl_vat', 'vat_amount', 'total_amount',
      'markup_percent', 'billable_to_customer', 'show_to_customer',
      'status', 'paid_at', 'receipt_url', 'notes',
    ]

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const f of allowed) {
      if (rest[f] !== undefined) updates[f] = rest[f]
    }

    // Auto-set paid_at when marking as paid
    if (updates.status === 'paid' && !updates.paid_at) {
      updates.paid_at = new Date().toISOString()
    }

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error('Update supplier invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/supplier-invoices
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('supplier_invoices')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete supplier invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
