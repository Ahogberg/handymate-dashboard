import { NextRequest, NextResponse } from 'next/server'
import { markInvoiceSources } from '@/lib/invoices/mark-sources'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { createInvoice } from '@/lib/invoices/create-invoice'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * POST - Skapa faktura från tidrapporter
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
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

    // Etapp 6 (multi-employee-parity-plan.md): fakturarader ska ärva vem
    // som utförde arbetet från time_entry.business_user_id (satt av Etapp 1
    // Tier A/B på alla fyra insert-ställen). `items` är ett JSONB-fält på
    // `invoice` (ingen egen fakturarad-tabell, se sql/invoice_overhaul.sql)
    // — inga strukturella hinder mot att lägga till fälten direkt, ingen
    // migration krävs. Slå upp namn i en batch för att undvika N+1.
    const businessUserIds = Array.from(
      new Set((timeEntries || []).map((e) => e.business_user_id).filter(Boolean))
    ) as string[]
    const businessUserNameById = new Map<string, string>()
    if (businessUserIds.length > 0) {
      const { data: businessUsers } = await supabase
        .from('business_users')
        .select('id, name')
        .in('id', businessUserIds)
      for (const bu of businessUsers || []) {
        businessUserNameById.set(bu.id, bu.name)
      }
    }

    const items: any[] = []
    // A5 (Prisslingan V2): prislös tid får ALDRIG bli en tyst 0 kr-rad.
    // Interaktiva vägar (denna) skapar raden men flaggar + varnar synligt —
    // samma policy som from-project; auto-generate exkluderar i stället.
    const varningar: string[] = []

    // Gruppera tidrapporter och skapa items
    for (const entry of timeEntries || []) {
      const hours = (entry.duration_minutes || 0) / 60
      const rate = entry.hourly_rate || 0
      if (rate === 0) {
        varningar.push(
          `Tidrapport ${new Date(entry.work_date).toLocaleDateString('sv-SE')} saknar timpris — raden är 0 kr och behöver rättas före utskick.`,
        )
      }

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
        price_missing: rate === 0,
        business_user_id: entry.business_user_id ?? null,
        performed_by_name: entry.business_user_id
          ? businessUserNameById.get(entry.business_user_id) ?? null
          : null,
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

    // Betalningsvillkor (nummer/OCR sköts nu av createInvoice-kärnan)
    const { data: config } = await supabase
      .from('business_config')
      .select('default_payment_days')
      .eq('business_id', business_id)
      .single()

    const dueDays = config?.default_payment_days || 30
    const invoiceDate = new Date()

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

    // ROT/RUT-avdrag (kapat mot kundens årsutrymme). Tidigare sattes bara
    // rot_rut_type men inget avdrag → kunden fakturerades fullt belopp trots ROT.
    let rotRutDeduction = 0
    let customerPays = total
    if (rot_rut_type && resolvedCustomerId) {
      const eligibleLabor = items
        .filter((i: any) => i.is_rot_eligible || i.is_rut_eligible)
        .reduce((s: number, i: any) => s + (i.total || 0), 0)
      if (eligibleLabor > 0) {
        const capped = await calculateCappedDeduction(resolvedCustomerId, business_id, rot_rut_type as 'rot' | 'rut', eligibleLabor, { vatRate })
        rotRutDeduction = capped.deduction
        customerPays = total - rotRutDeduction
      }
    }

    // ETAPP 6a (offert-masterplan.md): gemensam kärna för nummer/OCR/
    // datum/insert/bump — se lib/invoices/create-invoice.ts.
    const { invoice } = await createInvoice(supabase, {
      businessId: business_id,
      customerId: resolvedCustomerId,
      items,
      subtotal,
      vatRate,
      vatAmount,
      total,
      rotRutType: (rot_rut_type as 'rot' | 'rut' | undefined) || null,
      rotRutDeduction,
      customerPays,
      invoiceType: 'standard',
      status: 'draft',
      dueDays,
      invoiceDate,
      personnummer,
      fastighetsbeteckning,
      selectClause: `*, customer:customer_id ( customer_id, name, phone_number, email, address_line )`,
    })

    // Källorna markeras atomiskt via den delade vägen (P0-4). Materialet
    // slås upp till id:n först — RPC:n arbetar med explicita rader, aldrig
    // "allt ofakturerat" som kan hinna ändras mellan läsning och skrivning.
    let materialIds: string[] = []
    if (project_id) {
      const { data: mtrl } = await supabase
        .from('project_material')
        .select('material_id')
        .eq('project_id', project_id)
        .eq('business_id', business_id)
        .eq('invoiced', false)
      materialIds = (mtrl || []).map((m: any) => m.material_id)
    }

    const markering = await markInvoiceSources(supabase, {
      businessId: business_id,
      invoiceId: invoice.invoice_id,
      timeEntryIds: time_entry_ids,
      materialIds,
    })
    if (!markering.ok) {
      console.error('[from-time-entries] källmarkeringen misslyckades:', markering.errors)
    }

    // A5: varningarna följer med svaret så UI:t kan visa dem — aldrig tyst.
    return NextResponse.json({ invoice, warnings: varningar })

  } catch (error: any) {
    console.error('Create invoice from time entries error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
