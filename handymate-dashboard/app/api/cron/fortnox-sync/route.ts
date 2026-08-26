import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { syncFortnoxPaymentsForBusiness, syncSupplierInvoicePayments } from '@/lib/fortnox/sync-payments'
import { batchSync } from '@/lib/fortnox/sync'
import { importSupplierInvoicesForBusiness, rescanUnlinkedSupplierInvoices } from '@/lib/fortnox/import-supplier-invoices'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

export const maxDuration = 300
// Cron-route: får ALDRIG prerendras vid build (utan denna försöker Next
// statiskt exportera GET:en, vilket exekverar handlern vid byggtillfället —
// lokalt kastar den då på saknade env-vars, se build-loggen 2026-08-04).
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/fortnox-sync
 *
 * Pollar Fortnox-betalstatus för alla kopplade businesses. Kallas från Vercel
 * cron varje 2 timmar. När en faktura ändrar status från 'sent' till 'paid'
 * eller 'overdue' triggas automation-pipelinen via
 * lib/fortnox/sync-payments.runPostPaymentAutomations.
 *
 * Friskar även upp betalstatus för LEVERANTÖRSfakturor (supplier_invoices)
 * via syncSupplierInvoicePayments — samma per-business-loop, men utan
 * sidoeffekter (ingen notis, inget automation-event; se funktionens
 * docstring i lib/fortnox/sync-payments.ts).
 *
 * Säkerhet: Vercel sätter authorization header Bearer CRON_SECRET.
 * Andra anrop utan secret refuseras (men endpoint är ändå idempotent).
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  // Hämta alla kopplade businesses
  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id')
    .eq('fortnox_connected', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = []
  const supplierResults = []
  let totalChecked = 0
  let totalMarkedPaid = 0
  let totalMarkedOverdue = 0
  let totalSupplierChecked = 0
  let totalSupplierMarkedPaid = 0
  let totalCustomersSynced = 0
  let totalSupplierImported = 0
  let totalSupplierAutoMatched = 0
  let businessesNeedingReconnect = 0
  const errors: string[] = []

  for (const biz of businesses || []) {
    // Kundsvepet (2026-08-26): skyddsnät för de skapandevägar som inte går
    // genom syncNewCustomerToFortnox (CSV/bulk-import, klientsidans import,
    // Gmail, storefront, röst). batchSync tar max 50 per körning i
    // SKAPANDEORDNING. Körs FÖRST så en kund som skapats sedan förra
    // körningen har sitt Fortnox-nummer innan något annat rör den.
    try {
      const customerSweep = await batchSync(biz.business_id, 'customer')
      if (!customerSweep.skipped) {
        totalCustomersSynced += customerSweep.synced
        if (customerSweep.errors > 0) {
          const failed = customerSweep.details.filter(d => d.status === 'error')
          errors.push(`${biz.business_id} (customers): ${failed.map(d => `${d.entityId}: ${d.error}`).join('; ')}`)
        }
      }
    } catch (err: any) {
      console.error('[cron/fortnox-sync] batchSync(customer) failed:', biz.business_id, err)
      errors.push(`${biz.business_id} (customers): ${err?.message || 'sync failed'}`)
    }

    try {
      const result = await syncFortnoxPaymentsForBusiness(biz.business_id)
      results.push(result)
      totalChecked += result.checked
      totalMarkedPaid += result.marked_paid
      totalMarkedOverdue += result.marked_overdue
      if (result.errors.length > 0) {
        errors.push(`${biz.business_id}: ${result.errors.join('; ')}`)
      }
    } catch (err: any) {
      // Icke-blockerande — loopen fortsätter till nästa business, men felet
      // både loggas (cron körs obevakat) och surfas i errors-arrayen nedan.
      console.error('[cron/fortnox-sync] syncFortnoxPaymentsForBusiness failed:', biz.business_id, err)
      errors.push(`${biz.business_id}: ${err?.message || 'sync failed'}`)
    }

    // Leverantörsfaktura-IMPORT (2026-08-26): tidigare bara betalstatus på
    // redan importerade rader — nya leverantörsfakturor kom aldrig in utan
    // att någon tryckte på "Hämta historik". Körs FÖRE betalstatus-synken så
    // nyimporterade rader får sin status i samma körning. Ett konto utan
    // supplierinvoice-scope (anslutet före 2026-08-19) räknas som
    // needs_reconnect — INTE som ett fel varannan timme för evigt — och
    // rapporteras till driftlarmet högst en gång per dygn per företag.
    try {
      const importResult = await importSupplierInvoicesForBusiness(biz.business_id)
      if (importResult.needs_reconnect) {
        businessesNeedingReconnect++
        const { data: nyligen } = await supabase
          .from('automation_activity')
          .select('id')
          .eq('business_id', biz.business_id)
          .eq('automation_type', 'tyst_fel')
          .eq('action', 'fortnox-sync:supplier-import-needs-reconnect')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
        if (!nyligen || nyligen.length === 0) {
          await rapporteraTystFel(
            supabase,
            biz.business_id,
            'fortnox-sync:supplier-import-needs-reconnect',
            'Fortnox-anslutningen saknar supplierinvoice-scope — leverantörsfakturor importeras inte förrän ägaren återansluter Fortnox.',
            { cron: 'fortnox-sync' },
          )
        }
      } else {
        totalSupplierImported += importResult.imported
        totalSupplierAutoMatched += importResult.auto_matched
        if (importResult.errors.length > 0) {
          errors.push(`${biz.business_id} (supplier_invoices import): ${importResult.errors.map(e => `${e.documentNumber}: ${e.error}`).join('; ')}`)
        }
        // Svep (2026-08-26): okopplade rader utan Fortnox-detalj (importerade
        // före v171 eller med misslyckad detaljhämtning) får detaljen + en
        // säker koppling om den finns. Rader med detalj men utan match rörs
        // inte igen — de är Karins kö.
        try {
          const rescan = await rescanUnlinkedSupplierInvoices(biz.business_id)
          totalSupplierAutoMatched += rescan.matched
          if (rescan.errors.length > 0) errors.push(`${biz.business_id} (supplier_invoices rescan): ${rescan.errors.join('; ')}`)
        } catch (err: any) {
          console.error('[cron/fortnox-sync] rescanUnlinkedSupplierInvoices failed:', biz.business_id, err)
          errors.push(`${biz.business_id} (supplier_invoices rescan): ${err?.message || 'rescan failed'}`)
        }
      }
    } catch (err: any) {
      console.error('[cron/fortnox-sync] importSupplierInvoicesForBusiness failed:', biz.business_id, err)
      errors.push(`${biz.business_id} (supplier_invoices import): ${err?.message || 'import failed'}`)
    }

    try {
      const supplierResult = await syncSupplierInvoicePayments(biz.business_id)
      supplierResults.push(supplierResult)
      totalSupplierChecked += supplierResult.checked
      totalSupplierMarkedPaid += supplierResult.marked_paid
      if (supplierResult.errors.length > 0) {
        errors.push(`${biz.business_id} (supplier_invoices): ${supplierResult.errors.join('; ')}`)
      }
    } catch (err: any) {
      console.error('[cron/fortnox-sync] syncSupplierInvoicePayments failed:', biz.business_id, err)
      errors.push(`${biz.business_id} (supplier_invoices): ${err?.message || 'sync failed'}`)
    }
  }

  return NextResponse.json({
    ok: true,
    businesses_synced: businesses?.length || 0,
    total_customers_synced: totalCustomersSynced,
    total_checked: totalChecked,
    total_marked_paid: totalMarkedPaid,
    total_marked_overdue: totalMarkedOverdue,
    total_supplier_invoices_checked: totalSupplierChecked,
    total_supplier_invoices_marked_paid: totalSupplierMarkedPaid,
    total_supplier_invoices_imported: totalSupplierImported,
    total_supplier_invoices_auto_matched: totalSupplierAutoMatched,
    businesses_needing_reconnect: businessesNeedingReconnect,
    errors,
    results,
    supplier_results: supplierResults,
  })
}
