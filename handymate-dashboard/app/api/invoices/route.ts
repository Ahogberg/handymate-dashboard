import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { generateOCR } from '@/lib/ocr'
import { InvoiceItem } from '@/lib/types/invoice'

/**
 * GET - Lista fakturor för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver see_financials
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const status = request.nextUrl.searchParams.get('status')
    const customerId = request.nextUrl.searchParams.get('customerId')
    const invoiceType = request.nextUrl.searchParams.get('invoiceType')
    const dateFrom = request.nextUrl.searchParams.get('dateFrom')
    const dateTo = request.nextUrl.searchParams.get('dateTo')
    const search = request.nextUrl.searchParams.get('search')
    const sortBy = request.nextUrl.searchParams.get('sortBy') || 'created_at'
    const sortOrder = request.nextUrl.searchParams.get('sortOrder') === 'asc'

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
      .order(sortBy, { ascending: sortOrder })

    if (status) {
      query = query.eq('status', status)
    }
    if (customerId) {
      query = query.eq('customer_id', customerId)
    }
    if (invoiceType) {
      query = query.eq('invoice_type', invoiceType)
    }
    if (dateFrom) {
      query = query.gte('invoice_date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('invoice_date', dateTo)
    }

    const { data: invoices, error } = await query

    if (error) throw error

    // Client-side search filter (invoice_number + customer name)
    let filtered = invoices || []
    if (search) {
      const term = search.toLowerCase()
      filtered = filtered.filter((inv: any) =>
        inv.invoice_number?.toLowerCase().includes(term) ||
        inv.customer?.name?.toLowerCase().includes(term)
      )
    }

    return NextResponse.json({ invoices: filtered })

  } catch (error: any) {
    console.error('Get invoices error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny faktura
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      customer_id,
      quote_id,
      time_entry_ids,
      project_material_ids,
      items: providedItems,
      vat_rate = 25,
      rot_rut_type,
      due_days = 30,
      invoice_date: providedInvoiceDate,
      our_reference,
      your_reference,
      personnummer,
      fastighetsbeteckning,
      introduction_text,
      conclusion_text,
      invoice_type = 'standard',
      is_credit_note = false,
      original_invoice_id,
      credit_reason,
    } = body

    const business_id = business.business_id

    let items: any[] = providedItems || []
    let subtotal = 0

    // Om vi skapar från tidrapporter
    if (time_entry_ids && time_entry_ids.length > 0) {
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entry')
        .select(`*, customer:customer_id (name)`)
        .in('time_entry_id', time_entry_ids)

      if (timeError) throw timeError

      for (const entry of timeEntries || []) {
        const hours = (entry.duration_minutes || 0) / 60
        const laborCost = hours * (entry.hourly_rate || 0)
        items.push({
          id: 'ii_' + Math.random().toString(36).substr(2, 12),
          item_type: 'item',
          description: entry.description || `Arbete ${new Date(entry.work_date).toLocaleDateString('sv-SE')}`,
          quantity: Math.round(hours * 100) / 100,
          unit: 'timmar',
          unit_price: entry.hourly_rate || 0,
          total: laborCost,
          type: 'labor',
          is_rot_eligible: rot_rut_type === 'rot',
          is_rut_eligible: rot_rut_type === 'rut',
          sort_order: items.length,
        })
      }
    }

    // Om vi skapar från projektmaterial
    if (project_material_ids && project_material_ids.length > 0) {
      const { data: matRows, error: matError } = await supabase
        .from('project_material')
        .select('*')
        .in('id', project_material_ids)
        .eq('business_id', business_id)
        .eq('invoiced', false)

      if (matError) throw matError

      for (const mat of matRows || []) {
        items.push({
          id: 'ii_' + Math.random().toString(36).substr(2, 12),
          item_type: 'item',
          description: mat.name + (mat.sku ? ` (${mat.sku})` : ''),
          quantity: mat.quantity,
          unit: mat.unit || 'st',
          unit_price: mat.sell_price || 0,
          total: mat.total_sell || 0,
          type: 'material',
          is_rot_eligible: false,
          is_rut_eligible: false,
          sort_order: items.length,
        })
      }
    }

    // Om vi konverterar från offert
    if (quote_id && items.length === 0) {
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', quote_id)
        .single()

      if (quoteError) throw quoteError

      if (quote.items && Array.isArray(quote.items)) {
        items = quote.items.map((item: any, i: number) => ({
          id: item.id || 'ii_' + Math.random().toString(36).substr(2, 12),
          item_type: item.item_type || 'item',
          group_name: item.group_name,
          description: item.description || item.name,
          quantity: item.quantity || 1,
          unit: item.unit || 'st',
          unit_price: item.unit_price || item.price || 0,
          total: (item.quantity || 1) * (item.unit_price || item.price || 0),
          type: item.type,
          is_rot_eligible: item.is_rot_eligible || false,
          is_rut_eligible: item.is_rut_eligible || false,
          sort_order: item.sort_order ?? i,
          cost_price: item.cost_price,
          article_number: item.article_number,
        }))
      }
    }

    // Beräkna totaler
    const regularItems = items.filter((i: any) => (i.item_type || 'item') === 'item')
    const discountItems = items.filter((i: any) => i.item_type === 'discount')
    subtotal = regularItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0)
    const discountFromRows = discountItems.reduce((sum: number, item: any) => sum + Math.abs(item.total || 0), 0)
    subtotal -= discountFromRows
    const vatAmount = subtotal * (vat_rate / 100)
    let total = subtotal + vatAmount

    // ROT/RUT-avdrag med årstaksvalidering
    let rotRutDeduction = 0
    let customerPays = total
    let rotRutWarning: string | undefined

    if (rot_rut_type && customer_id) {
      const laborCost = items
        .filter((i: any) => i.is_rot_eligible || i.is_rut_eligible || i.type === 'labor')
        .reduce((sum: number, i: any) => sum + (i.quantity * i.unit_price), 0)

      const cappedResult = await calculateCappedDeduction(
        customer_id,
        business_id,
        rot_rut_type as 'rot' | 'rut',
        laborCost
      )

      rotRutDeduction = cappedResult.deduction
      customerPays = total - rotRutDeduction
      rotRutWarning = cappedResult.warning
    } else if (rot_rut_type && !customer_id) {
      const laborCost = items
        .filter((i: any) => i.is_rot_eligible || i.is_rut_eligible || i.type === 'labor')
        .reduce((sum: number, i: any) => sum + (i.quantity * i.unit_price), 0)
      const deductionRate = rot_rut_type === 'rot' ? 0.30 : 0.50
      rotRutDeduction = Math.round(laborCost * deductionRate * 100) / 100
      customerPays = total - rotRutDeduction
    }

    // Kreditfaktura: använd /api/invoices/credit istället
    if (is_credit_note && original_invoice_id) {
      return NextResponse.json(
        { error: 'Använd /api/invoices/credit för att skapa kreditfakturor' },
        { status: 400 }
      )
    }

    // Hämta business_config för prefix + next_number
    const { data: config } = await supabase
      .from('business_config')
      .select('invoice_prefix, next_invoice_number')
      .eq('business_id', business_id)
      .single()

    const prefix = config?.invoice_prefix || 'FV'
    const nextNum = config?.next_invoice_number || 1
    const year = new Date().getFullYear()
    const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`

    // Generate OCR
    const ocrNumber = generateOCR(String(nextNum))

    // Beräkna förfallodatum
    const invoiceDateVal = providedInvoiceDate ? new Date(providedInvoiceDate) : new Date()
    const dueDate = new Date(invoiceDateVal)
    dueDate.setDate(dueDate.getDate() + due_days)

    const { data: invoice, error: insertError } = await supabase
      .from('invoice')
      .insert({
        business_id,
        customer_id,
        quote_id,
        invoice_number: invoiceNumber,
        invoice_type: invoice_type || 'standard',
        status: 'draft',
        items,
        subtotal,
        vat_rate,
        vat_amount: vatAmount,
        total,
        rot_rut_type,
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays,
        invoice_date: invoiceDateVal.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        ocr_number: ocrNumber,
        our_reference: our_reference || null,
        your_reference: your_reference || null,
        personnummer: personnummer || null,
        fastighetsbeteckning: fastighetsbeteckning || null,
        introduction_text: introduction_text || null,
        conclusion_text: conclusion_text || null,
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

    // Increment next_invoice_number
    await supabase
      .from('business_config')
      .update({ next_invoice_number: nextNum + 1 })
      .eq('business_id', business_id)

    // Markera tidrapporter som fakturerade
    if (time_entry_ids && time_entry_ids.length > 0) {
      await supabase
        .from('time_entry')
        .update({ invoice_id: invoice.invoice_id, invoiced: true })
        .in('time_entry_id', time_entry_ids)
    }

    // Markera material som fakturerat
    if (project_material_ids && project_material_ids.length > 0) {
      await supabase
        .from('project_material')
        .update({ invoice_id: invoice.invoice_id, invoiced: true })
        .in('id', project_material_ids)
    }

    return NextResponse.json({
      invoice,
      ...(rotRutWarning ? { rot_rut_warning: rotRutWarning } : {}),
    })

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
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { invoice_id, ...fields } = body

    if (!invoice_id) {
      return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 })
    }

    // Build updates from provided fields
    const updates: Record<string, any> = {}
    const allowedFields = [
      'items', 'status', 'due_date', 'invoice_date', 'vat_rate', 'rot_rut_type',
      'our_reference', 'your_reference', 'introduction_text', 'conclusion_text',
      'personnummer', 'fastighetsbeteckning', 'internal_notes',
      'subtotal', 'vat_amount', 'total', 'rot_rut_deduction', 'customer_pays',
      'discount_percent', 'discount_amount',
    ]

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updates[field] = fields[field]
      }
    }

    // If items provided, recalculate totals
    if (fields.items && !fields.subtotal) {
      const regularItems = fields.items.filter((i: any) => (i.item_type || 'item') === 'item')
      const discountItems = fields.items.filter((i: any) => i.item_type === 'discount')
      const sub = regularItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0)
      const discFromRows = discountItems.reduce((sum: number, item: any) => sum + Math.abs(item.total || 0), 0)
      updates.subtotal = sub - discFromRows
      updates.vat_amount = updates.subtotal * ((fields.vat_rate || 25) / 100)
      updates.total = updates.subtotal + updates.vat_amount
    }

    if (fields.status === 'paid' && !fields.paid_at) {
      updates.paid_at = new Date().toISOString()
    }

    const { data: invoice, error } = await supabase
      .from('invoice')
      .update(updates)
      .eq('invoice_id', invoice_id)
      .eq('business_id', business.business_id)
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
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const invoiceId = request.nextUrl.searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('invoice')
      .select('status')
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
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
