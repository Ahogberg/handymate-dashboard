import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { mapFortnoxInvoice } from '@/lib/fortnox/map-invoice'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'
import type { FortnoxInvoiceListItem } from '@/lib/fortnox'

export const dynamic = 'force-dynamic'

function dateOnly(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 12)}`
}

/**
 * De åtta påhittade "Fortnox-kunderna" simmen speglar in. CustomerNumber är
 * sim-egna (2001–2008) — de riktiga sex demokunderna (seed-demo-account.ts)
 * har aldrig fortnox_customer_number satt, så det finns ingen kollision.
 * E-post demo+f1..f8@handymate.se (f = "fortnox") skiljer sig medvetet från
 * seed-demo-account.ts:s demo+1..6@handymate.se.
 */
const SIM_CUSTOMERS: Array<{
  number: string
  name: string
  address: string
  zip: string
  city: string
  emailSuffix: string
}> = [
  { number: '2001', name: 'Lars Åberg', address: 'Kungsvägen 12', zip: '181 33', city: 'Lidingö', emailSuffix: 'f1' },
  { number: '2002', name: 'Sofia Ekström', address: 'Parkgatan 4', zip: '112 20', city: 'Stockholm', emailSuffix: 'f2' },
  { number: '2003', name: 'BRF Furuträdet', address: 'Furugatan 9', zip: '117 45', city: 'Stockholm', emailSuffix: 'f3' },
  { number: '2004', name: 'Nordic Bygg AB', address: 'Industrivägen 6', zip: '141 71', city: 'Segeltorp', emailSuffix: 'f4' },
  { number: '2005', name: 'Erik Söderberg', address: 'Backvägen 21', zip: '133 34', city: 'Saltsjöbaden', emailSuffix: 'f5' },
  { number: '2006', name: 'Maria Holm', address: 'Ängsvägen 3', zip: '128 44', city: 'Bagarmossen', emailSuffix: 'f6' },
  { number: '2007', name: 'Fastighetsbolaget Kajen AB', address: 'Kajgatan 15', zip: '111 20', city: 'Stockholm', emailSuffix: 'f7' },
  { number: '2008', name: 'Petra Lind', address: 'Skogsbrynet 8', zip: '135 52', city: 'Tyresö', emailSuffix: 'f8' },
]

/**
 * De tolv påhittade fakturorna — fem betalda (historik, "historik-
 * widening"-stilen), fem skickade/förfallna i olika grader, och en
 * MEDVETET okopplad (customerNumber: null) för att visa det äkta
 * "unlinked"-beteendet en riktig import också kan ge (kundmatchning som
 * missar), inte bara wow-siffror.
 */
const SIM_INVOICES: Array<{
  doc: string
  customerNumber: string | null
  total: number
  invoiceDateOffset: number
  dueDateOffset: number
  paid: boolean
}> = [
  { doc: 'FSIM-1001', customerNumber: '2001', total: 18000, invoiceDateOffset: -60, dueDateOffset: -30, paid: true },
  { doc: 'FSIM-1002', customerNumber: '2002', total: 32000, invoiceDateOffset: -90, dueDateOffset: -60, paid: true },
  { doc: 'FSIM-1003', customerNumber: '2003', total: 9500, invoiceDateOffset: -120, dueDateOffset: -90, paid: true },
  { doc: 'FSIM-1004', customerNumber: '2004', total: 54000, invoiceDateOffset: -45, dueDateOffset: -15, paid: true },
  { doc: 'FSIM-1005', customerNumber: '2005', total: 12800, invoiceDateOffset: -200, dueDateOffset: -170, paid: true },
  { doc: 'FSIM-1006', customerNumber: '2006', total: 21000, invoiceDateOffset: -5, dueDateOffset: 25, paid: false },
  { doc: 'FSIM-1007', customerNumber: '2007', total: 38000, invoiceDateOffset: -10, dueDateOffset: 20, paid: false },
  { doc: 'FSIM-1008', customerNumber: '2008', total: 15600, invoiceDateOffset: -40, dueDateOffset: -10, paid: false },
  { doc: 'FSIM-1009', customerNumber: '2001', total: 47000, invoiceDateOffset: -70, dueDateOffset: -25, paid: false },
  { doc: 'FSIM-1010', customerNumber: '2003', total: 8200, invoiceDateOffset: -100, dueDateOffset: -70, paid: false },
  { doc: 'FSIM-1011', customerNumber: '2005', total: 26500, invoiceDateOffset: -2, dueDateOffset: 28, paid: false },
  { doc: 'FSIM-1012', customerNumber: null, total: 6400, invoiceDateOffset: -50, dueDateOffset: -20, paid: false },
]

/**
 * POST /api/admin/demo-fortnox-sim
 *
 * Ersätter den riktiga Fortnox-OAuth-länken i onboarding-steget "Hämta in
 * din verksamhet" (StepImportData) när kontot är demokontot — presentatören
 * ska aldrig behöva en riktig Fortnox-inloggning för att visa importflödet.
 *
 * Skapar ~8 påhittade "Fortnox-importerade" kunder + ~12 fakturor (mix
 * betalda/obetalda/förfallna) och svarar i EXAKT samma form som de två
 * riktiga import-rutterna (app/api/integrations/fortnox/import/customers
 * och .../invoices), så StepImportData kan rendera sin befintliga
 * fortnox-done-vy oförändrad med riktiga-utseende siffror.
 *
 * SÄKERHET (samma garanti som riktiga importen, samma kod): fakturaraderna
 * byggs via lib/fortnox/map-invoice.ts:mapFortnoxInvoice — samma rena,
 * testade funktion som app/api/integrations/fortnox/import/invoices/route.ts
 * använder. Den sätter ALLTID reminder_count: 0 och lämnar next_reminder_at
 * orört (null) — simulerade fakturor kan aldrig trigga ett automatiskt
 * utskick. send-reminders-cronen (app/api/cron/send-reminders/route.ts)
 * hoppar dessutom över HELA företaget om inte auto_reminder_enabled är
 * satt (default FALSE, sql/v44_invoice_reminder_columns.sql) — samma grind
 * som redan gäller för alla riktiga Fortnox-importerade historiska
 * fakturor, inte en ny risk den här simmen inför.
 *
 * DEDUP (medveten avvikelse från den riktiga kund-importen): dedup:ar bara
 * på fortnox_customer_number, INTE e-post/telefon. Alla demokunder — både
 * de sex handskrivna i seed-demo-account.ts och de åtta här — delar med
 * flit ägarens telefonnummer (så presentatörens egen mobil ringer/SMS:as i
 * demot). Riktiga importens telefon-dedup hade därför avvisat 7 av 8 kunder
 * som "dubbletter" av varandra — en falsk positiv som bara uppstår i det
 * här demo-mönstret, aldrig hos en riktig kund.
 *
 * Samma hårda grind som demo-reset/demo-onboarding-replay:
 *   1. getAuthenticatedBusiness — kräver inloggad session.
 *   2. business.business_id === process.env.DEMO_BUSINESS_ID — annars 403.
 *   3. business_users-rollen är owner/admin — annars 403.
 * FÅR ALDRIG kunna köras för ett riktigt kundkonto — utan DEMO_BUSINESS_ID
 * satt i miljön svarar routen ALLTID 403.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const demoBusinessId = process.env.DEMO_BUSINESS_ID
    if (!demoBusinessId || business.business_id !== demoBusinessId) {
      return NextResponse.json(
        { error: 'Det här är inte demokontot. Fortnox-simuleringen kan bara köras på demokontot.' },
        { status: 403 }
      )
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser) || !currentUser.user_id) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // ── 0. Läs företagsnamn + ägarens mobilnummer (READ-ONLY, samma
    // mönster som lib/demo/seed-demo-account.ts) ──
    const { data: biz, error: bizErr } = await supabase
      .from('business_config')
      .select('business_name, personal_phone')
      .eq('business_id', businessId)
      .single()
    if (bizErr || !biz) {
      return NextResponse.json({ error: 'Kunde inte läsa demokontots företagsinställningar.' }, { status: 500 })
    }
    const ownerPhone = (biz.personal_phone as string | null) || null
    if (!ownerPhone) {
      return NextResponse.json(
        {
          error:
            'Inget mobilnummer sparat på demokontot. Gå till Inställningar → Telefoni och spara "Ditt privata mobilnummer" innan du simulerar Fortnox.',
        },
        { status: 400 }
      )
    }
    const businessName = (biz.business_name as string) || 'Företaget'

    const syncRows: Array<{
      business_id: string
      entity_type: string
      entity_id: string
      fortnox_id: string | null
      sync_status: string
      last_synced_at: string
    }> = []

    // ══════════════════════════════════════════════════════════
    // 1. KUNDER
    // ══════════════════════════════════════════════════════════
    const { data: existingCustomers } = await supabase
      .from('customer')
      .select('fortnox_customer_number')
      .eq('business_id', businessId)
      .not('fortnox_customer_number', 'is', null)
    const existingCustomerNumbers = new Set(
      (existingCustomers ?? []).map((c: any) => c.fortnox_customer_number).filter(Boolean)
    )

    const customerResults = {
      imported: 0,
      skipped: 0,
      total: SIM_CUSTOMERS.length,
      errors: [] as { customerNumber: string; name: string; error: string }[],
    }
    const insertedCustomerIdByNumber = new Map<string, string>()

    for (const sc of SIM_CUSTOMERS) {
      if (existingCustomerNumbers.has(sc.number)) {
        customerResults.skipped++
        continue
      }
      const customerId = genId('cust')
      const { error: insertError } = await supabase.from('customer').insert({
        customer_id: customerId,
        business_id: businessId,
        name: sc.name,
        email: `demo+${sc.emailSuffix}@handymate.se`,
        phone_number: ownerPhone,
        address_line: `${sc.address}, ${sc.zip} ${sc.city}`,
        fortnox_customer_number: sc.number,
        fortnox_synced_at: new Date().toISOString(),
      })
      if (insertError) {
        customerResults.errors.push({ customerNumber: sc.number, name: sc.name, error: insertError.message })
        continue
      }
      insertedCustomerIdByNumber.set(sc.number, customerId)
      customerResults.imported++
      syncRows.push({
        business_id: businessId,
        entity_type: 'customer',
        entity_id: customerId,
        fortnox_id: sc.number,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      })
    }

    await logFortnoxOperation(businessId, 'import_customers', {
      imported: customerResults.imported,
      skipped: customerResults.skipped,
      total: customerResults.total,
      error_count: customerResults.errors.length,
    })

    // ══════════════════════════════════════════════════════════
    // 2. FAKTUROR — mapFortnoxInvoice är samma funktion (och samma
    // reminder-säkerhetsgaranti) som den riktiga import-rutten använder.
    // ══════════════════════════════════════════════════════════
    const { data: existingInvoices } = await supabase
      .from('invoice')
      .select('fortnox_document_number')
      .eq('business_id', businessId)
      .not('fortnox_document_number', 'is', null)
    const existingDocNumbers = new Set(
      (existingInvoices ?? []).map((i: any) => i.fortnox_document_number).filter(Boolean)
    )

    const invoiceResults = {
      imported: 0,
      skipped: 0,
      unlinked: 0,
      total: SIM_INVOICES.length,
      total_outstanding_kr: 0,
      errors: [] as { documentNumber: string; error: string }[],
    }
    const today = dateOnly(0)

    for (const item of SIM_INVOICES) {
      if (existingDocNumbers.has(item.doc)) {
        invoiceResults.skipped++
        continue
      }

      const fakeFortnoxInvoice: FortnoxInvoiceListItem = {
        DocumentNumber: item.doc,
        InvoiceNumber: item.doc,
        CustomerNumber: item.customerNumber ?? undefined,
        InvoiceDate: dateOnly(item.invoiceDateOffset),
        DueDate: dateOnly(item.dueDateOffset),
        Total: item.total,
        Balance: item.paid ? 0 : item.total,
        FullyPaid: item.paid,
      }
      const mapped = mapFortnoxInvoice(fakeFortnoxInvoice, today)
      if (!mapped) {
        invoiceResults.skipped++
        continue
      }

      const customerId = item.customerNumber ? insertedCustomerIdByNumber.get(item.customerNumber) ?? null : null
      if (!customerId) invoiceResults.unlinked++

      const { data: insertedInvoice, error: insertError } = await supabase
        .from('invoice')
        .insert({
          ...mapped.row,
          business_id: businessId,
          customer_id: customerId,
          fortnox_synced_at: new Date().toISOString(),
        })
        .select('invoice_id')
        .single()

      if (insertError || !insertedInvoice) {
        invoiceResults.errors.push({ documentNumber: item.doc, error: insertError?.message || 'okänt fel' })
        continue
      }

      existingDocNumbers.add(item.doc)
      invoiceResults.imported++
      invoiceResults.total_outstanding_kr += mapped.outstanding
      syncRows.push({
        business_id: businessId,
        entity_type: 'invoice',
        entity_id: insertedInvoice.invoice_id,
        fortnox_id: item.doc,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      })
    }

    await logFortnoxOperation(businessId, 'import_invoices', {
      imported: invoiceResults.imported,
      skipped: invoiceResults.skipped,
      unlinked: invoiceResults.unlinked,
      total: invoiceResults.total,
      total_outstanding_kr: Math.round(invoiceResults.total_outstanding_kr),
      error_count: invoiceResults.errors.length,
    })

    // fortnox_sync — en rad per importerad kund/faktura (samma tabell
    // app/api/integrations/fortnox/status/route.ts's syscStats-motsvarighet
    // lib/fortnox.ts:getFortnoxStatus läser för "synkade"-siffrorna på
    // Inställningar → Fortnox), inte bara en enda symbolisk rad — annars
    // visar den sidan noll trots att importen "lyckades". Non-blocking:
    // samma hållning som fortnox_api_log ovan.
    if (syncRows.length > 0) {
      const { error: syncErr } = await supabase
        .from('fortnox_sync')
        .upsert(syncRows, { onConflict: 'business_id,entity_type,entity_id' })
      if (syncErr) {
        console.error('[demo-fortnox-sim] fortnox_sync insert failed:', syncErr.message)
      }
    }

    // ══════════════════════════════════════════════════════════
    // 3. Status-ytan — metadata i business_config, tokenstatus i den
    // kanoniska business_integration_credentials-tabellen.
    // ══════════════════════════════════════════════════════════
    const nowIso = new Date().toISOString()
    const { error: credentialsErr } = await supabase
      .from('business_integration_credentials')
      .upsert({
        business_id: businessId,
        // Demo-only-markörer. Routen är hårt DEMO_BUSINESS_ID-grindad och
        // dessa används bara för statusytans verklighetstrogna läsning.
        fortnox_access_token: 'demo-fortnox-access-token',
        fortnox_refresh_token: 'demo-fortnox-refresh-token',
        fortnox_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        updated_at: nowIso,
      }, { onConflict: 'business_id' })
    if (credentialsErr) {
      console.error('[demo-fortnox-sim] credential status update failed:', credentialsErr.message)
      return NextResponse.json({ error: 'Kunde inte markera Fortnox som anslutet.' }, { status: 500 })
    }

    const { error: statusErr } = await supabase
      .from('business_config')
      .update({
        fortnox_connected: true,
        fortnox_company_name: businessName,
        fortnox_connected_at: nowIso,
        fortnox_last_synced_at: nowIso,
      })
      .eq('business_id', businessId)
    if (statusErr) {
      // Lämna aldrig en demo-tokenrad bakom en status som säger "inte
      // ansluten". Det här är inte en generell rollback av den simulerade
      // importen, bara kompensation för de två statuslagren.
      const { error: cleanupError } = await supabase
        .from('business_integration_credentials')
        .delete()
        .eq('business_id', businessId)
      if (cleanupError) {
        console.error('[demo-fortnox-sim] credential rollback failed:', cleanupError.message)
      }
      console.error('[demo-fortnox-sim] business_config status update failed:', statusErr.message)
      return NextResponse.json({ error: 'Kunde inte markera Fortnox som anslutet.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      customers: {
        success: true,
        imported: customerResults.imported,
        skipped: customerResults.skipped,
        total: customerResults.total,
        errors: customerResults.errors,
      },
      invoices: {
        success: true,
        imported: invoiceResults.imported,
        skipped: invoiceResults.skipped,
        unlinked: invoiceResults.unlinked,
        total: invoiceResults.total,
        total_outstanding_kr: Math.round(invoiceResults.total_outstanding_kr),
        errors: invoiceResults.errors,
      },
    })
  } catch (error: any) {
    console.error('[demo-fortnox-sim] Error:', error)
    return NextResponse.json({ error: error.message || 'Kunde inte simulera Fortnox-importen' }, { status: 500 })
  }
}
