import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { validateInvoiceForSkv } from '@/lib/skv/validate-rot-request'
import { buildSkvXml, type SkvArende } from '@/lib/skv/rot-rut-xml'

export const dynamic = 'force-dynamic'

const ALLOWED_EDIT_FIELDS = [
  'rot_work_category', 'rot_hours', 'rot_material_cost',
  'rot_property_type', 'rot_brf_org_number', 'rot_apartment_number', 'rot_property_designation',
] as const

/**
 * POST /api/rot-payment/generate
 * Body: { invoiceIds[], requestType: 'rot'|'rut', taxYear, edits?: { [invoiceId]: {...} } }
 * Persisterar ev. inline-redigerade luckfält, validerar auktoritativt, bygger
 * EN XML-fil (en typ), markerar fakturorna 'submitted' och returnerar filen.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const invoiceIds: string[] = Array.isArray(body?.invoiceIds) ? body.invoiceIds : []
  const requestType: 'rot' | 'rut' = body?.requestType === 'rut' ? 'rut' : 'rot'
  const taxYear: number = Number(body?.taxYear) || new Date().getFullYear()
  const edits: Record<string, any> = body?.edits || {}

  if (invoiceIds.length === 0) return NextResponse.json({ error: 'Inga fakturor valda' }, { status: 400 })
  if (invoiceIds.length > 100) return NextResponse.json({ error: 'Max 100 fakturor per fil' }, { status: 400 })

  const supabase = getServerSupabase()

  const { data: config } = await supabase
    .from('business_config')
    .select('org_number, business_name')
    .eq('business_id', business.business_id)
    .single()

  // 1. Persistera ev. inline-redigerade luckfält (timmar/kategori/fastighet)
  for (const id of invoiceIds) {
    const e = edits[id]
    if (!e) continue
    const patch: Record<string, any> = {}
    for (const f of ALLOWED_EDIT_FIELDS) {
      if (e[f] !== undefined) patch[f] = e[f] === '' ? null : e[f]
    }
    if (Object.keys(patch).length > 0) {
      const { error: upErr } = await supabase
        .from('invoice').update(patch).eq('invoice_id', id).eq('business_id', business.business_id)
      if (upErr) console.error('[rot-payment/generate] edit save failed:', id, upErr)
    }
  }

  // 2. Hämta fakturorna (efter ev. uppdatering) + kund
  const { data: invoices, error } = await supabase
    .from('invoice')
    .select('*, customer:customer_id (name, personal_number, property_designation)')
    .in('invoice_id', invoiceIds)
    .eq('business_id', business.business_id)
    .eq('status', 'paid')
    .eq('rot_rut_type', requestType)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ error: `Inga betalda ${requestType.toUpperCase()}-fakturor hittades` }, { status: 400 })
  }

  // 3. Validera auktoritativt + bygg ärenden
  const arenden: SkvArende[] = []
  const invalid: { invoice_number: string; errors: string[] }[] = []
  for (const inv of invoices as any[]) {
    const customer = inv.customer || {}
    const v = validateInvoiceForSkv({
      invoice: inv,
      customerPersonalNumber: customer.personal_number,
      customerPropertyDesignation: customer.property_designation,
      businessOrgNumber: config?.org_number,
      taxYear,
    })
    if (!v.valid || !v.normalized) {
      invalid.push({ invoice_number: inv.invoice_number || inv.invoice_id, errors: v.errors })
      continue
    }
    const n = v.normalized
    arenden.push({
      kopare: n.personnummer12,
      betalningsDatum: new Date(inv.paid_at).toISOString().slice(0, 10),
      prisForArbete: n.prisForArbete,
      begartBelopp: n.begartBelopp,
      fakturaNr: inv.invoice_number || undefined,
      ovrigKostnad: 0,
      fastighetsbeteckning: n.fastighetsbeteckning,
      brfOrgNr: n.brfOrgNr,
      lagenhetsNr: n.lagenhetsNr,
      categoryCode: n.category,
      antalTimmar: n.hours,
      materialkostnad: Math.round(inv.rot_material_cost || 0),
    })
  }

  if (invalid.length > 0) {
    return NextResponse.json(
      { error: 'Vissa fakturor är inte kompletta för Skatteverket', invalid },
      { status: 400 },
    )
  }

  // 4. Bygg XML
  const namn = `${requestType.toUpperCase()} ${taxYear}`.slice(0, 16)
  const xml = buildSkvXml({ requestType, namnPaBegaran: namn, arenden })

  // 5. Spara begäran + markera fakturor submitted
  const requestId = `rpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const fileName = `skatteverket-${requestType}-${taxYear}-${new Date().toISOString().slice(0, 10)}.xml`
  const totalRequested = arenden.reduce((s, a) => s + a.begartBelopp, 0)

  const { error: insErr } = await supabase.from('rot_payment_request').insert({
    id: requestId,
    business_id: business.business_id,
    request_type: requestType,
    tax_year: taxYear,
    invoice_count: arenden.length,
    total_requested_kr: totalRequested,
    file_name: fileName,
    xml_content: xml,
    generated_by_user_id: (currentUser as any)?.id || null,
    status: 'generated',
  })
  if (insErr) {
    console.error('[rot-payment/generate] insert request failed:', insErr)
    return NextResponse.json({ error: 'Kunde inte spara begäran' }, { status: 500 })
  }

  const idsUsed = (invoices as any[]).map(i => i.invoice_id)
  await supabase
    .from('invoice')
    .update({ rot_payment_request_id: requestId, rot_application_status: 'submitted' })
    .in('invoice_id', idsUsed)
    .eq('business_id', business.business_id)

  // 6. Returnera filen (BOM för korrekt UTF-8 vid uppladdning)
  return new NextResponse('﻿' + xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
