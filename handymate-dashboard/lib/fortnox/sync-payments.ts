import { getServerSupabase } from '@/lib/supabase'
import { fortnoxRequest, isFortnoxConnected, type FortnoxInvoice } from '@/lib/fortnox'
import { classifyFortnoxPayment, paidSoFarFromFortnox } from '@/lib/fortnox/classify-payment'
import { applyInvoicePayment } from '@/lib/invoices/apply-payment'
import { getCustomerShare } from '@/lib/invoices/customer-share'

export interface SyncResult {
  business_id: string
  checked: number
  marked_paid: number
  /** ROT/RUT: kunden har betalat SIN del, Skatteverkets del väntar (2026-08-26). */
  marked_customer_paid: number
  /** customer_paid → paid: Skatteverkets utbetalning registrerad i Fortnox. */
  marked_settled: number
  marked_overdue: number
  marked_cancelled: number
  errors: string[]
}

export interface SupplierInvoiceSyncResult {
  business_id: string
  checked: number
  marked_paid: number
  errors: string[]
}

interface FortnoxSupplierInvoiceDetail {
  GivenNumber: string
  Balance: number
}

interface LocalInvoiceRow {
  invoice_id: string
  business_id: string
  status: string | null
  fortnox_invoice_number: string | null
  fortnox_document_number: string | null
  due_date: string | null
  customer_id: string | null
  total: number | null
  rot_rut_type: string | null
  rot_rut_deduction: number | null
  customer_pays: number | null
  paid_amount: number | null
}

/**
 * Synka betal-status för alla Fortnox-kopplade fakturor i en business.
 *
 * Klassificeringen är ren (lib/fortnox/classify-payment.ts) och skiljer sedan
 * 2026-08-26 på:
 *   - Cancelled → makulera lokalt (prövas FÖRST — makulerad har Balance 0)
 *   - FullyPaid/Balance ≤ 0 → betald (från sent: to_paid; från customer_paid: settled)
 *   - ROT/RUT där kunden betalat SIN del (Balance = skattereduktionen) →
 *     customer_paid. Tidigare blev den "förfallen" och påminnelsetrappan
 *     jagade kunden för beloppet Skatteverket ska betala.
 *   - DueDate passerad, obetald → overdue
 *
 * Själva skrivningen + automationerna går genom SAMMA kärna som manuell
 * markering (lib/invoices/apply-payment.ts) — ingen egen kopia av
 * post-payment-kedjan här längre. Varje skrivning läser error; räknarna
 * räknas bara upp vid lyckad skrivning.
 */
export async function syncFortnoxPaymentsForBusiness(businessId: string): Promise<SyncResult> {
  const result: SyncResult = {
    business_id: businessId,
    checked: 0,
    marked_paid: 0,
    marked_customer_paid: 0,
    marked_settled: 0,
    marked_overdue: 0,
    marked_cancelled: 0,
    errors: [],
  }

  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    result.errors.push('not_connected')
    return result
  }

  const supabase = getServerSupabase()

  // Fakturor att synka: har Fortnox-kopplat ID + ej slutbehandlad i Handymate.
  // customer_paid ska MED — den väntar på Skatteverkets utbetalning (settle).
  const { data: invoices, error } = await supabase
    .from('invoice')
    .select('invoice_id, business_id, status, fortnox_invoice_number, fortnox_document_number, due_date, customer_id, total, rot_rut_type, rot_rut_deduction, customer_pays, paid_amount')
    .eq('business_id', businessId)
    .not('fortnox_invoice_number', 'is', null)
    .not('status', 'in', '(paid,cancelled)')

  if (error) {
    result.errors.push(`fetch: ${error.message}`)
    return result
  }

  const todayStr = new Date().toISOString().split('T')[0]

  for (const inv of (invoices || []) as LocalInvoiceRow[]) {
    result.checked++
    try {
      // Föredra DocumentNumber (Fortnox internt id) över InvoiceNumber
      const docNum = inv.fortnox_document_number || inv.fortnox_invoice_number
      const fnRes = await fortnoxRequest<{ Invoice: FortnoxInvoice }>(
        businessId,
        'GET',
        `/invoices/${docNum}`
      )
      const fnInv = fnRes?.Invoice
      if (!fnInv) continue

      const cls = classifyFortnoxPayment(fnInv, inv, todayStr)

      if (cls === 'cancelled') {
        if (inv.status !== 'cancelled') {
          const ok = await markInvoiceCancelled(inv.invoice_id, businessId)
          if (ok) result.marked_cancelled++
        }
        continue
      }

      if (cls === 'paid') {
        // Från customer_paid: belopp utelämnat = återstoden → 'settled'.
        // Från sent/overdue: hela beloppet → 'to_paid'.
        const r = await applyInvoicePayment({
          businessId,
          invoiceId: inv.invoice_id,
          amount: inv.status === 'customer_paid'
            ? undefined
            : (typeof fnInv.Total === 'number' && fnInv.Total > 0 ? fnInv.Total : undefined),
          paidVia: 'fortnox',
          source: 'fortnox',
        })
        if (!r.ok) throw new Error(r.error || 'apply-payment failed')
        if (r.transition === 'to_paid') result.marked_paid++
        else if (r.transition === 'settled') result.marked_settled++
        continue
      }

      if (cls === 'customer_paid') {
        const r = await applyInvoicePayment({
          businessId,
          invoiceId: inv.invoice_id,
          amount: paidSoFarFromFortnox(fnInv) ?? getCustomerShare(inv),
          paidVia: 'fortnox',
          source: 'fortnox',
        })
        if (!r.ok) throw new Error(r.error || 'apply-payment failed')
        if (r.transition === 'to_customer_paid') result.marked_customer_paid++
        else if (r.transition === 'to_paid') result.marked_paid++
        continue
      }

      if (cls === 'overdue' && inv.status !== 'overdue') {
        const ok = await markInvoiceOverdue(inv.invoice_id, businessId)
        if (ok) result.marked_overdue++
      }
    } catch (err: unknown) {
      result.errors.push(`${inv.invoice_id}: ${err instanceof Error ? err.message : 'sync error'}`)
    }
  }

  // Uppdatera last_synced_at
  const { error: stampError } = await supabase
    .from('business_config')
    .update({ fortnox_last_synced_at: new Date().toISOString() })
    .eq('business_id', businessId)
  if (stampError) result.errors.push(`last_synced_at: ${stampError.message}`)

  return result
}

/**
 * Synka betal-status för Fortnox-kopplade LEVERANTÖRSfakturor i en business.
 * Speglar syncFortnoxPaymentsForBusiness ovan, men mot supplier_invoices —
 * OBS: INGA sidoeffekter utöver statusuppdateringen (ingen portal-notis,
 * inget automation-event) — till skillnad från kundfakturors motsvarande
 * synk. supplier_invoices status-kolumnen har inget 'overdue'-värde (se
 * sql/v11_supplier_invoices.sql: 'unpaid' | 'paid' | 'invoiced'), så denna
 * funktion rör ALDRIG förfallenhet — bara betald-status.
 *
 * Logik:
 *   - Hämta supplier_invoices-rader med fortnox_supplier_invoice_number satt
 *     och status != 'paid'
 *   - För varje: läs Fortnox-fakturan via GET /supplierinvoices/{GivenNumber}
 *   - Om Balance <= 0 → markera som betald lokalt
 */
export async function syncSupplierInvoicePayments(businessId: string): Promise<SupplierInvoiceSyncResult> {
  const result: SupplierInvoiceSyncResult = {
    business_id: businessId,
    checked: 0,
    marked_paid: 0,
    errors: [],
  }

  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    result.errors.push('not_connected')
    return result
  }

  const supabase = getServerSupabase()

  const { data: invoices, error } = await supabase
    .from('supplier_invoices')
    .select('id, fortnox_supplier_invoice_number, status')
    .eq('business_id', businessId)
    .not('fortnox_supplier_invoice_number', 'is', null)
    .neq('status', 'paid')

  if (error) {
    result.errors.push(`fetch: ${error.message}`)
    return result
  }

  for (const inv of invoices || []) {
    result.checked++
    try {
      const docNum = inv.fortnox_supplier_invoice_number
      const fnRes = await fortnoxRequest<{ SupplierInvoice: FortnoxSupplierInvoiceDetail }>(
        businessId,
        'GET',
        `/supplierinvoices/${docNum}`
      )
      const fnInv = fnRes?.SupplierInvoice
      if (!fnInv) continue

      const isPaid = typeof fnInv.Balance === 'number' && fnInv.Balance <= 0

      if (isPaid && inv.status !== 'paid') {
        const { error: updError } = await supabase
          .from('supplier_invoices')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', inv.id)
          .eq('business_id', businessId)
        if (updError) throw updError
        result.marked_paid++
      }
    } catch (err: unknown) {
      result.errors.push(`${inv.id}: ${err instanceof Error ? err.message : 'sync error'}`)
    }
  }

  return result
}

async function markInvoiceCancelled(invoiceId: string, businessId: string): Promise<boolean> {
  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('invoice')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
  if (error) throw error
  return true
}

async function markInvoiceOverdue(invoiceId: string, businessId: string): Promise<boolean> {
  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('invoice')
    .update({ status: 'overdue' })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
  if (error) throw error

  // Karin/automation-engine plockar upp via check-overdue/send-reminders cron
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'invoice_overdue', businessId, { invoice_id: invoiceId })
  } catch { /* non-blocking */ }
  return true
}
