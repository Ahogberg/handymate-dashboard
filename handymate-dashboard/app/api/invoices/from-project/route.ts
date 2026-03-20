import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/invoices/from-project?project_id=xxx
 * Hämtar fakturaunderlag — tid, material, traktamenten
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = request.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id krävs' }, { status: 400 })

  const supabase = getServerSupabase()

  // Hämta projekt + kund
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, customer_id, customer:customers(customer_id, name, email, phone_number, personal_number, address_line)')
    .eq('id', projectId)
    .eq('business_id', business.business_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })

  // Hämta ofakturerade tidposter
  const { data: timeEntries } = await supabase
    .from('time_entry')
    .select('time_entry_id, description, work_date, duration_minutes, hourly_rate, is_billable, business_user_id, invoiced')
    .eq('business_id', business.business_id)
    .eq('project_id', projectId)
    .or('invoiced.is.null,invoiced.eq.false')
    .eq('is_billable', true)
    .order('work_date', { ascending: true })

  // Hämta ofakturerat material
  const { data: materials } = await supabase
    .from('project_material')
    .select('material_id, name, unit, quantity, purchase_price, sell_price, markup_percent, total_sell, invoiced')
    .eq('business_id', business.business_id)
    .eq('project_id', projectId)
    .or('invoiced.is.null,invoiced.eq.false')

  // Hämta business-inställningar
  const { data: config } = await supabase
    .from('business_config')
    .select('default_hourly_rate, default_payment_days, invoice_prefix, next_invoice_number, bankgiro_number, plusgiro, swish_number, f_skatt_registered, org_number')
    .eq('business_id', business.business_id)
    .single()

  // Formatera tidposter till fakturarader
  const laborLines = (timeEntries || []).map((te: any) => {
    const hours = (te.duration_minutes || 0) / 60
    const rate = te.hourly_rate || config?.default_hourly_rate || 895
    return {
      source: 'time_entry' as const,
      source_id: te.time_entry_id,
      description: te.description || `Arbete ${te.work_date}`,
      quantity: Math.round(hours * 100) / 100,
      unit: 'tim',
      unit_price: rate,
      total: Math.round(hours * rate),
      is_rot_eligible: true,
      is_rut_eligible: false,
      date: te.work_date,
    }
  })

  // Formatera material till fakturarader
  const materialLines = (materials || []).map((m: any) => ({
    source: 'material' as const,
    source_id: m.material_id,
    description: m.name || 'Material',
    quantity: m.quantity || 1,
    unit: m.unit || 'st',
    unit_price: m.sell_price || m.purchase_price || 0,
    total: m.total_sell || Math.round((m.quantity || 1) * (m.sell_price || m.purchase_price || 0)),
    is_rot_eligible: false,
    is_rut_eligible: false,
  }))

  const laborTotal = laborLines.reduce((s: number, l: any) => s + l.total, 0)
  const materialTotal = materialLines.reduce((s: number, l: any) => s + l.total, 0)

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      customer: project.customer,
    },
    labor: { lines: laborLines, total: laborTotal },
    materials: { lines: materialLines, total: materialTotal },
    config: {
      default_hourly_rate: config?.default_hourly_rate || 895,
      default_payment_days: config?.default_payment_days || 30,
      invoice_prefix: config?.invoice_prefix || 'FV',
      next_invoice_number: config?.next_invoice_number || 1,
      bankgiro_number: config?.bankgiro_number,
      plusgiro: config?.plusgiro,
      swish_number: config?.swish_number,
      f_skatt_registered: config?.f_skatt_registered,
      org_number: config?.org_number,
    },
  })
}

/**
 * POST /api/invoices/from-project
 * Genererar faktura från projektunderlag
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    project_id,
    customer_id,
    items,
    vat_rate = 25,
    rot_rut_type,
    rot_personal_number,
    rot_property_designation,
    discount_percent = 0,
    payment_days = 30,
    introduction_text,
    conclusion_text,
    source_time_entry_ids = [],
    source_material_ids = [],
  } = body

  if (!project_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'project_id och items krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Hämta invoice-nummer
  const { data: config } = await supabase
    .from('business_config')
    .select('invoice_prefix, next_invoice_number, bankgiro_number, plusgiro, swish_number, default_payment_days')
    .eq('business_id', business.business_id)
    .single()

  const prefix = config?.invoice_prefix || 'FV'
  const seqNum = config?.next_invoice_number || 1
  const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(seqNum).padStart(3, '0')}`
  const invoiceId = `inv_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`

  // Beräkna summor
  const subtotal = items.reduce((s: number, i: any) => s + (i.total || 0), 0)
  const discountAmount = Math.round(subtotal * (discount_percent / 100))
  const taxableAmount = subtotal - discountAmount
  const vatAmount = Math.round(taxableAmount * (vat_rate / 100))
  const total = taxableAmount + vatAmount

  // ROT/RUT-beräkning
  let rotWorkCost = 0
  let rotDeduction = 0
  let rutWorkCost = 0
  let rutDeduction = 0
  let customerPays = total

  if (rot_rut_type === 'rot') {
    rotWorkCost = items
      .filter((i: any) => i.is_rot_eligible)
      .reduce((s: number, i: any) => s + (i.total || 0), 0)
    rotDeduction = Math.min(Math.round(rotWorkCost * 0.3), 50000)
    customerPays = total - rotDeduction
  } else if (rot_rut_type === 'rut') {
    rutWorkCost = items
      .filter((i: any) => i.is_rut_eligible)
      .reduce((s: number, i: any) => s + (i.total || 0), 0)
    rutDeduction = Math.min(Math.round(rutWorkCost * 0.5), 75000)
    customerPays = total - rutDeduction
  }

  // Formatera items
  const invoiceItems = items.map((item: any, idx: number) => ({
    id: `ii_${Date.now().toString(36)}${idx}`,
    item_type: item.item_type || 'item',
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total: item.total,
    is_rot_eligible: item.is_rot_eligible || false,
    is_rut_eligible: item.is_rut_eligible || false,
    sort_order: idx,
  }))

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + (payment_days || config?.default_payment_days || 30))

  // Skapa faktura
  const { data: invoice, error } = await supabase
    .from('invoice')
    .insert({
      invoice_id: invoiceId,
      business_id: business.business_id,
      customer_id: customer_id || null,
      invoice_number: invoiceNumber,
      invoice_type: 'standard',
      status: 'draft',
      items: invoiceItems,
      subtotal,
      vat_rate: vat_rate,
      vat_amount: vatAmount,
      total,
      discount_percent: discount_percent,
      discount_amount: discountAmount,
      customer_pays: customerPays,
      rot_rut_type: rot_rut_type || null,
      rot_work_cost: rotWorkCost || null,
      rot_deduction: rotDeduction || null,
      rot_customer_pays: rot_rut_type === 'rot' ? customerPays : null,
      rut_work_cost: rutWorkCost || null,
      rut_deduction: rutDeduction || null,
      rut_customer_pays: rot_rut_type === 'rut' ? customerPays : null,
      rot_personal_number: rot_personal_number || null,
      rot_property_designation: rot_property_designation || null,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
      introduction_text: introduction_text || null,
      conclusion_text: conclusion_text || null,
      bankgiro_number: config?.bankgiro_number || null,
      plusgiro: config?.plusgiro || null,
      swish_number: config?.swish_number || null,
    })
    .select('invoice_id')
    .single()

  if (error) {
    console.error('Create invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Markera tidposter som fakturerade
  if (source_time_entry_ids.length > 0) {
    await supabase
      .from('time_entry')
      .update({ invoiced: true, invoice_id: invoiceId })
      .in('time_entry_id', source_time_entry_ids)
  }

  // Markera material som fakturerat
  if (source_material_ids.length > 0) {
    await supabase
      .from('project_material')
      .update({ invoiced: true, invoice_id: invoiceId })
      .in('material_id', source_material_ids)
  }

  // Inkrementera invoice-nummer
  await supabase
    .from('business_config')
    .update({ next_invoice_number: seqNum + 1 })
    .eq('business_id', business.business_id)

  return NextResponse.json({ invoice_id: invoiceId, invoice_number: invoiceNumber })
}
