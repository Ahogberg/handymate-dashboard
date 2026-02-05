import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

interface InvoiceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: 'labor' | 'material'
}

/**
 * GET - Lista fakturor för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const businessId = request.nextUrl.searchParams.get('businessId')
    const status = request.nextUrl.searchParams.get('status')
    const customerId = request.nextUrl.searchParams.get('customerId')

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    let query = supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: invoices, error } = await query

    if (error) throw error

    return NextResponse.json({ invoices })

  } catch (error: any) {
    console.error('Get invoices error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny faktura
 * Kan skapas från tidrapporter eller konverteras från offert
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      business_id,
      customer_id,
      quote_id,
      time_entry_ids,
      items: providedItems,
      vat_rate = 25,
      rot_rut_type,
      due_days = 30
    } = body

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    let items: InvoiceItem[] = providedItems || []
    let subtotal = 0

    // Om vi skapar från tidrapporter
    if (time_entry_ids && time_entry_ids.length > 0) {
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entry')
        .select(`
          *,
          customer:customer_id (name)
        `)
        .in('time_entry_id', time_entry_ids)

      if (timeError) throw timeError

      // Gruppera tidrapporter per dag/beskrivning
      for (const entry of timeEntries || []) {
        const laborCost = (entry.hours_worked || 0) * (entry.hourly_rate || 0)
        items.push({
          description: entry.description || `Arbete ${new Date(entry.work_date).toLocaleDateString('sv-SE')}`,
          quantity: entry.hours_worked || 0,
          unit: 'timmar',
          unit_price: entry.hourly_rate || 0,
          total: laborCost,
          type: 'labor'
        })

        if (entry.materials_cost && entry.materials_cost > 0) {
          items.push({
            description: `Material (${new Date(entry.work_date).toLocaleDateString('sv-SE')})`,
            quantity: 1,
            unit: 'st',
            unit_price: entry.materials_cost,
            total: entry.materials_cost,
            type: 'material'
          })
        }
      }
    }

    // Om vi konverterar från offert
    if (quote_id) {
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', quote_id)
        .single()

      if (quoteError) throw quoteError

      if (quote.items && Array.isArray(quote.items)) {
        items = quote.items.map((item: any) => ({
          description: item.description || item.name,
          quantity: item.quantity || 1,
          unit: item.unit || 'st',
          unit_price: item.unit_price || item.price || 0,
          total: (item.quantity || 1) * (item.unit_price || item.price || 0),
          type: item.type
        }))
      }
    }

    // Beräkna totaler
    subtotal = items.reduce((sum: number, item: InvoiceItem) => sum + item.total, 0)
    const vatAmount = subtotal * (vat_rate / 100)
    let total = subtotal + vatAmount

    // ROT/RUT-avdrag
    let rotRutDeduction = 0
    let customerPays = total

    if (rot_rut_type) {
      // ROT: 30% avdrag på arbetskostnad, max 50 000 kr/år
      // RUT: 50% avdrag på arbetskostnad, max 75 000 kr/år
      const laborCost = items
        .filter((i: InvoiceItem) => i.type === 'labor')
        .reduce((sum: number, i: InvoiceItem) => sum + i.total, 0)

      const deductionRate = rot_rut_type === 'rot' ? 0.30 : 0.50
      rotRutDeduction = Math.round(laborCost * deductionRate * 100) / 100
      customerPays = total - rotRutDeduction
    }

    // Generera fakturanummer
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('invoice')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .gte('created_at', `${year}-01-01`)

    const invoiceNumber = `${year}-${String((count || 0) + 1).padStart(3, '0')}`

    // Beräkna förfallodatum
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + due_days)

    const { data: invoice, error: insertError } = await supabase
      .from('invoice')
      .insert({
        business_id,
        customer_id,
        quote_id,
        invoice_number: invoiceNumber,
        status: 'draft',
        items,
        subtotal,
        vat_rate,
        vat_amount: vatAmount,
        total,
        rot_rut_type,
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0]
      })
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .single()

    if (insertError) throw insertError

    // Markera tidrapporter som fakturerade
    if (time_entry_ids && time_entry_ids.length > 0) {
      await supabase
        .from('time_entry')
        .update({ invoice_id: invoice.invoice_id })
        .in('time_entry_id', time_entry_ids)
    }

    return NextResponse.json({ invoice })

  } catch (error: any) {
    console.error('Create invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera faktura
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const body = await request.json()
    const { invoice_id, items, status, due_date, vat_rate, rot_rut_type } = body

    if (!invoice_id) {
      return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 })
    }

    const updates: Record<string, any> = {}

    if (items) {
      updates.items = items
      updates.subtotal = items.reduce((sum: number, item: InvoiceItem) => sum + item.total, 0)
      updates.vat_amount = updates.subtotal * ((vat_rate || 25) / 100)
      updates.total = updates.subtotal + updates.vat_amount
    }

    if (status) {
      updates.status = status
      if (status === 'paid') {
        updates.paid_at = new Date().toISOString()
      }
    }

    if (due_date) updates.due_date = due_date
    if (vat_rate !== undefined) updates.vat_rate = vat_rate
    if (rot_rut_type !== undefined) updates.rot_rut_type = rot_rut_type

    const { data: invoice, error } = await supabase
      .from('invoice')
      .update(updates)
      .eq('invoice_id', invoice_id)
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ invoice })

  } catch (error: any) {
    console.error('Update invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort faktura (endast utkast)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const invoiceId = request.nextUrl.searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
    }

    // Verifiera att fakturan är ett utkast
    const { data: existing } = await supabase
      .from('invoice')
      .select('status')
      .eq('invoice_id', invoiceId)
      .single()

    if (existing?.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft invoices can be deleted' }, { status: 400 })
    }

    const { error } = await supabase
      .from('invoice')
      .delete()
      .eq('invoice_id', invoiceId)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
