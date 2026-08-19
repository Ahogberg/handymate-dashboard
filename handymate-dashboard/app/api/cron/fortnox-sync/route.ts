import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { syncFortnoxPaymentsForBusiness, syncSupplierInvoicePayments } from '@/lib/fortnox/sync-payments'

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
  const errors: string[] = []

  for (const biz of businesses || []) {
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
    total_checked: totalChecked,
    total_marked_paid: totalMarkedPaid,
    total_marked_overdue: totalMarkedOverdue,
    total_supplier_invoices_checked: totalSupplierChecked,
    total_supplier_invoices_marked_paid: totalSupplierMarkedPaid,
    errors,
    results,
    supplier_results: supplierResults,
  })
}
