import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'

/**
 * POST - Skapa faktura från tidrapporter
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { customer_id, time_entry_ids, project_id, rot_rut_type } = body
    const business_id = business.business_id

    if (!time_entry_ids || time_entry_ids.length === 0) {
      return NextResponse.json({ error: 'Inga tidrapporter valda' }, { status: 400 })
    }

    // Hämta tidrapporter
    const { data: timeEntries, error: timeError } = await supabase
      .from('time_entry')
      .select(`*, customer:customer_id (name, personal_number, property_designation)`)
      .in('time_entry_id', time_entry_ids)
      .eq('business_id', business_id)

    if (timeError) throw timeError

    const items: any[] = []

    // Gruppera tidrapporter och skapa items
    for (const entry of timeEntries || []) {
      const hours = (entry.duration_minutes || 0) / 60
      const rate = entry.hourly_rate || 0

      items.push({
        id: 'ii_' + Math.random().toString(36).substr(2, 12),
        item_type: 'item',
        description: entry.description || `Arbete ${new Date(entry.work_date).toLocaleDateString('sv-SE')}`,
        quantity: Math.round(hours * 100) / 100,
        unit: 'timmar',
        unit_price: rate,
        total: Math.round(hours * rate * 100) / 100,
        type: 'labor',
        is_rot_eligible: rot_rut_type === 'rot',
        is_rut_eligible: rot_rut_type === 'rut',
        sort_order: items.length,
      })
    }

    // Hämta projektmaterial om project_id
    if (project_id) {
      const { data: materials } = await supabase
        .from('project_material')
        .select('*')
        .eq('project_id', project_id)
        .eq('business_id', business_id)
        .eq('invoiced', false)

      for (const mat of materials || []) {
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

    // Beräkna totaler
    const subtotal = items.reduce((sum: number, item: any) => sum + item.total, 0)
    const vatRate = 25
    const vatAmount = subtotal * (vatRate / 100)
    const total = subtotal + vatAmount

    // Hämta prefix + nummer
    const { data: config } = await supabase
      .from('business_config')
      .select('invoice_prefix, next_invoice_number, default_payment_days')
      .eq('business_id', business_id)
      .single()

    const prefix = config?.invoice_prefix || 'FV'
    const nextNum = config?.next_invoice_number || 1
    const year = new Date().getFullYear()
    const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`
    const ocrNumber = generateOCR(String(nextNum))
    const dueDays = config?.default_payment_days || 30
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + dueDays)

    // Resolve customer_id from entries if not provided
    const resolvedCustomerId = customer_id || timeEntries?.[0]?.customer_id || null

    // Get customer ROT/RUT info
    let personnummer = null
    let fastighetsbeteckning = null
    const customerData = timeEntries?.[0]?.customer
    if (customerData) {
      personnummer = customerData.personal_number || null
      fastighetsbeteckning = customerData.property_designation || null
    }

    const { data: invoice, error: insertError } = await supabase
      .from('invoice')
      .insert({
        business_id,
        customer_id: resolvedCustomerId,
        invoice_number: invoiceNumber,
        invoice_type: 'standard',
        status: 'draft',
        items,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        rot_rut_type: rot_rut_type || null,
        personnummer,
        fastighetsbeteckning,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        ocr_number: ocrNumber,
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

    // Increment next number
    await supabase
      .from('business_config')
      .update({ next_invoice_number: nextNum + 1 })
      .eq('business_id', business_id)

    // Markera tidrapporter som fakturerade
    await supabase
      .from('time_entry')
      .update({ invoice_id: invoice.invoice_id, invoiced: true })
      .in('time_entry_id', time_entry_ids)

    // Markera material som fakturerat
    if (project_id) {
      await supabase
        .from('project_material')
        .update({ invoice_id: invoice.invoice_id, invoiced: true })
        .eq('project_id', project_id)
        .eq('business_id', business_id)
        .eq('invoiced', false)
    }

    return NextResponse.json({ invoice })

  } catch (error: any) {
    console.error('Create invoice from time entries error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
