import { NextRequest, NextResponse } from 'next/server'
import { markInvoiceSources } from '@/lib/invoices/mark-sources'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { rotRutDeductionInclVat } from '@/lib/rot-rut'
import { createInvoice } from '@/lib/invoices/create-invoice'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

export const dynamic = 'force-dynamic'

/**
 * GET /api/invoices/from-project?project_id=xxx
 * Hämtar fakturaunderlag — tid, material, traktamenten
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
  // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const projectId = request.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id krävs' }, { status: 400 })

  const supabase = getServerSupabase()

  // Hämta projekt + kund
  // Rätt tabell heter `project` (PK project_id), inte `projects`/`id` — den
  // gamla pluralqueryn returnerade alltid null → 404 och projektfakturering var
  // helt blockerad. Kund hämtas separat (embed-FK föll tyst på PGRST200 förut).
  const { data: project } = await supabase
    .from('project')
    .select('project_id, name, customer_id')
    .eq('project_id', projectId)
    .eq('business_id', business.business_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })

  let projectCustomer: any = null
  if (project.customer_id) {
    const { data: c } = await supabase
      .from('customer')
      .select('customer_id, name, email, phone_number, personal_number, address_line')
      .eq('customer_id', project.customer_id)
      .eq('business_id', business.business_id)
      .maybeSingle()
    projectCustomer = c
  }

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

  // Formatera tidposter till fakturarader. Etapp T — KVITTOPRINCIPEN:
  // aldrig ett hårdkodat 895. Saknas BÅDE tidpostens eget timpris OCH
  // företagets default_hourly_rate skrivs raden prislös (samma "Sätt
  // pris"-konvention som produktbanken, lib/products/pricing-state.ts:
  // unit_price 0 betyder "ej prissatt", aldrig en gissning) och flaggas
  // i warnings så gränssnittet kan uppmärksamma hantverkaren INNAN
  // fakturan skapas — en gissad krona på en faktura är värst av alla.
  const warnings: string[] = []
  const laborLines = (timeEntries || []).map((te: any) => {
    const hours = (te.duration_minutes || 0) / 60
    const rate = te.hourly_rate || config?.default_hourly_rate || null
    if (!rate) {
      warnings.push(
        `Timpris saknas för "${te.description || `Arbete ${te.work_date}`}" — sätt pris manuellt innan fakturan skickas.`,
      )
    }
    return {
      source: 'time_entry' as const,
      source_id: te.time_entry_id,
      description: te.description || `Arbete ${te.work_date}`,
      quantity: Math.round(hours * 100) / 100,
      unit: 'tim',
      unit_price: rate || 0,
      total: rate ? Math.round(hours * rate) : 0,
      is_rot_eligible: true,
      is_rut_eligible: false,
      date: te.work_date,
      price_missing: !rate,
    }
  })

  if (warnings.length > 0) {
    await rapporteraTystFel(
      supabase,
      business.business_id,
      'invoices/from-project:missing_hourly_rate',
      `${warnings.length} tidpost(er) saknar timpris för projekt ${projectId} — fakturaunderlaget visar dem prislösa.`,
      { project_id: projectId, count: warnings.length },
    )
  }

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
      id: project.project_id,
      name: project.name,
      customer: projectCustomer,
    },
    labor: { lines: laborLines, total: laborTotal },
    materials: { lines: materialLines, total: materialTotal },
    ...(warnings.length > 0 ? { warnings } : {}),
    config: {
      default_hourly_rate: config?.default_hourly_rate ?? null,
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

  // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
  // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

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

  // Slå upp project.quote_id för att härda mot orphan-fakturor. Tidigare
  // skapade rutten invoice utan vare sig project_id eller quote_id —
  // gjorde framtida marginal-analys + backfill omöjlig (TD-58, v52).
  const { data: projectRow } = await supabase
    .from('project')
    .select('project_id, quote_id')
    .eq('project_id', project_id)
    .eq('business_id', business.business_id)
    .single()
  const linkedQuoteId = projectRow?.quote_id || null

  // Betalkonton + betalningsvillkor (nummer/OCR sköts nu av createInvoice-kärnan)
  const { data: config } = await supabase
    .from('business_config')
    .select('bankgiro_number, plusgiro, swish_number, default_payment_days')
    .eq('business_id', business.business_id)
    .single()

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

  // Skatteverket: avdraget räknas på arbetskostnaden inkl moms, efter rabatt.
  const discountFactor = subtotal > 0 ? taxableAmount / subtotal : 1

  // Kapa mot kundens ÅRSUTRYMME (ej bara engångstaket) — annars kan avdraget
  // bli för högt om kunden redan använt sitt ROT/RUT och Skatteverket nekar.
  if (rot_rut_type === 'rot') {
    rotWorkCost = items
      .filter((i: any) => i.is_rot_eligible)
      .reduce((s: number, i: any) => s + (i.total || 0), 0)
    rotDeduction = customer_id && rotWorkCost > 0
      ? (await calculateCappedDeduction(customer_id, business.business_id, 'rot', rotWorkCost, { vatRate: vat_rate, discountFactor })).deduction
      : Math.round(rotRutDeductionInclVat('rot', rotWorkCost, { vatRate: vat_rate, discountFactor }))
    customerPays = total - rotDeduction
  } else if (rot_rut_type === 'rut') {
    rutWorkCost = items
      .filter((i: any) => i.is_rut_eligible)
      .reduce((s: number, i: any) => s + (i.total || 0), 0)
    rutDeduction = customer_id && rutWorkCost > 0
      ? (await calculateCappedDeduction(customer_id, business.business_id, 'rut', rutWorkCost, { vatRate: vat_rate, discountFactor })).deduction
      : Math.round(rotRutDeductionInclVat('rut', rutWorkCost, { vatRate: vat_rate, discountFactor }))
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

  const dueDays = payment_days || config?.default_payment_days || 30

  // ETAPP 6a (offert-masterplan.md): gemensam kärna för nummer/OCR/datum/
  // insert/bump. invoice_id BEHÅLLS explicit (extraFields) — bara för att
  // vara identisk med tidigare beteende, inte för att kärnan kräver det
  // (andra vägar låter DB:ns default generera id:t). OBS dokumenterad
  // bieffekt: kärnan sätter ALLTID legacy-fältet rot_rut_deduction (som
  // lib/invoice-templates/data-builder.ts faktiskt läser för att visa
  // ROT/RUT-raden i dokumentet/PDF:en) — denna väg satte tidigare BARA de
  // uppdelade rot_deduction/rut_deduction-kolumnerna, aldrig den legacy-
  // kombinerade. Fakturor skapade härifrån visade alltså ALDRIG ett
  // ROT/RUT-avdrag i PDF:en. Se rapporten — trolig bugfix, inte en
  // avsiktlig ändring i denna etapp.
  let invoiceNumber: string
  try {
    const created = await createInvoice(supabase, {
      businessId: business.business_id,
      customerId: customer_id || null,
      items: invoiceItems,
      subtotal,
      vatRate: vat_rate,
      vatAmount,
      total,
      discountPercent: discount_percent,
      discountAmount,
      rotRutType: (rot_rut_type as 'rot' | 'rut' | undefined) || null,
      rotRutDeduction: rot_rut_type === 'rot' ? rotDeduction : rot_rut_type === 'rut' ? rutDeduction : 0,
      customerPays,
      projectId: project_id,
      quoteId: linkedQuoteId,
      invoiceType: 'standard',
      status: 'draft',
      dueDays,
      introductionText: introduction_text || null,
      conclusionText: conclusion_text || null,
      selectClause: 'invoice_id',
      extraFields: {
        invoice_id: invoiceId,
        rot_work_cost: rotWorkCost || null,
        rot_deduction: rotDeduction || null,
        rot_customer_pays: rot_rut_type === 'rot' ? customerPays : null,
        rut_work_cost: rutWorkCost || null,
        rut_deduction: rutDeduction || null,
        rut_customer_pays: rot_rut_type === 'rut' ? customerPays : null,
        rot_personal_number: rot_personal_number || null,
        rot_property_designation: rot_property_designation || null,
        bankgiro_number: config?.bankgiro_number || null,
        // OBS: plusgiro/swish_number finns INTE som kolumner på invoice
        // (PDF/utskick läser betalkonton från business_config).
      },
    })
    invoiceNumber = created.invoiceNumber
  } catch (err: any) {
    console.error('Create invoice error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  // Källorna markeras atomiskt via den delade vägen (P0-4) — tidigare två
  // separata anrop utan felkontroll OCH utan tenantfilter.
  const markering = await markInvoiceSources(supabase, {
    businessId: business.business_id,
    invoiceId,
    timeEntryIds: source_time_entry_ids,
    materialIds: source_material_ids,
  })

  return NextResponse.json({
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    ...(markering.ok ? {} : { warning: `Fakturan skapades men källmarkeringen misslyckades: ${markering.errors.join('; ')}` }),
  })
}
