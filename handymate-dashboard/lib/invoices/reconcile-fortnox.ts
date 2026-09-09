import type { SupabaseClient } from '@supabase/supabase-js'
import { fortnoxRequest, isFortnoxConnected } from '@/lib/fortnox'

export interface ReconciliationResult {
  outcome: 'matched' | 'not_found' | 'ambiguous' | 'mismatch' | 'unavailable' | 'conflict' | 'not_eligible'
  message: string
  documentNumber?: string
}
const unresolved = (outcome: ReconciliationResult['outcome'], message: string): ReconciliationResult => ({ outcome, message })
const number = (value: unknown): string | null => typeof value === 'string' && /^\d{1,30}$/.test(value) ? value : null
const cents = (value: unknown): number | null => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/** GET-only against Fortnox. Finding an invoice does NOT prove customer
 * delivery or tax-reduction submission. Keep pending until those are reviewed.
 * API contract: https://api.fortnox.se/apidocs, verified 2026-09-09.
 * Search is LIKE-based; verify each candidate's exact external reference. */
export async function reconcileFortnoxInvoice(db: SupabaseClient, businessId: string, invoiceId: string): Promise<ReconciliationResult> {
  const { data: invoice, error } = await db.from('invoice').select('*')
    .eq('business_id', businessId).eq('invoice_id', invoiceId).maybeSingle()
  if (error) return unresolved('unavailable', 'Fakturauppgifterna kunde inte hämtas.')
  if (!invoice) return unresolved('not_eligible', 'Fakturan kunde inte hittas.')
  if (!['pending', 'failed'].includes(invoice.fortnox_sync_status) || invoice.is_credit_note) {
    return unresolved('not_eligible', 'Den här fakturan har ingen osäker synk som kan stämmas av här.')
  }
  // A live writer can still be between POST and its local receipt.
  const attempted = Date.parse(invoice.fortnox_sync_attempted_at || '')
  if (invoice.fortnox_sync_status === 'pending' && Number.isFinite(attempted) && Date.now() - attempted < 5 * 60 * 1000) {
    return unresolved('conflict', 'Synken kan fortfarande pågå. Kontrollera igen när den har avslutats.')
  }
  const { data: customer, error: customerError } = await db.from('customer').select('fortnox_customer_number')
    .eq('business_id', businessId).eq('customer_id', invoice.customer_id).maybeSingle()
  if (customerError || !customer?.fortnox_customer_number || cents(invoice.total) === null) {
    return unresolved('unavailable', 'Kundkoppling eller fakturabelopp saknas för en säker kontroll.')
  }
  try {
    if (!await isFortnoxConnected(businessId)) return unresolved('unavailable', 'Fortnox är inte anslutet.')
    const matches: Record<string, unknown>[] = []
    const seen = new Set<string>()
    // Bound work. Incomplete pagination is never evidence of absence/uniqueness.
    let totalPages: number | null = null
    for (let page = 1; page <= 3; page++) {
      const result = await fortnoxRequest<{ Invoices?: { DocumentNumber?: unknown }[]; MetaInformation?: Record<string, unknown> }>(
        businessId, 'GET', `/invoices?externalinvoicereference1=${encodeURIComponent(invoiceId)}&limit=20&page=${page}`)
      const pages = Number(result.MetaInformation?.['@TotalPages'])
      const current = Number(result.MetaInformation?.['@CurrentPage'])
      if (!Array.isArray(result.Invoices) || !Number.isInteger(pages) || pages < 0 || pages > 3 || current !== page || (totalPages !== null && totalPages !== pages) || result.Invoices.length > 20) {
        return unresolved('unavailable', 'Fortnox-listan kunde inte kontrolleras fullständigt. Spärren ligger kvar.')
      }
      totalPages = pages
      if (pages === 0 && result.Invoices.length !== 0) return unresolved('unavailable', 'Fortnox gav en ofullständig lista.')
      for (const candidate of result.Invoices) {
        const id = number(candidate.DocumentNumber)
        if (!id || seen.has(id)) return unresolved('unavailable', 'Fortnox-listan ändrades under kontrollen. Försök kontrollera igen.')
        seen.add(id)
        const detail = await fortnoxRequest<{ Invoice?: Record<string, unknown> }>(businessId, 'GET', `/invoices/${id}`)
        if (!detail.Invoice || detail.Invoice.DocumentNumber !== id || typeof detail.Invoice.ExternalInvoiceReference1 !== 'string') {
          return unresolved('unavailable', 'En fakturas identitet kunde inte verifieras i Fortnox.')
        }
        if (detail.Invoice.ExternalInvoiceReference1 === invoiceId) matches.push(detail.Invoice)
      }
      if (page >= pages) break
    }
    if (matches.length === 0) return unresolved('not_found', 'Ingen exakt träff hittades. Det bevisar inte att skapandet misslyckades; inget nytt skapande har tillåtits.')
    if (matches.length !== 1) return unresolved('ambiguous', 'Flera Fortnox-fakturor har samma referens. Kontrollera dem i Fortnox; inget nytt skapande har tillåtits.')
    const match = matches[0]
    if (match.CustomerNumber !== String(customer.fortnox_customer_number) || match.Currency !== 'SEK' || cents(match.Total) !== cents(invoice.total) || match.Cancelled !== false || match.InvoiceType !== 'INVOICE') {
      return unresolved('mismatch', 'Referensen hittades men kund, belopp, valuta eller fakturatyp avviker. Ingen koppling ändrades.')
    }
    const documentNumber = number(match.DocumentNumber)!
    if ([invoice.fortnox_document_number, invoice.fortnox_invoice_number].some(n => n && n !== documentNumber)) {
      return unresolved('mismatch', 'Fakturan är redan kopplad till ett annat Fortnox-nummer. Kontrollera kopplingen manuellt.')
    }
    const message = `Faktura ${documentNumber} återfunnen i Fortnox. Kopplingen är sparad; leverans och eventuell ROT/RUT-begäran behöver kontrolleras innan flödet kan fortsätta.`
    let update = db.from('invoice').update({ fortnox_document_number: documentNumber, fortnox_invoice_number: documentNumber,
      fortnox_sync_status: 'pending', fortnox_sync_error: message })
      .eq('business_id', businessId).eq('invoice_id', invoiceId).eq('fortnox_sync_status', invoice.fortnox_sync_status)
      .eq('customer_id', invoice.customer_id).eq('total', invoice.total)
    for (const field of ['fortnox_sync_attempted_at', 'fortnox_document_number', 'fortnox_invoice_number']) {
      update = invoice[field] == null ? update.is(field, null) : update.eq(field, invoice[field])
    }
    const { data: saved, error: saveError } = await update.select('invoice_id').maybeSingle()
    if (saveError || !saved) return unresolved('conflict', 'Träffen hittades men kopplingen kunde inte sparas, eller fakturan ändrades. Kontrollera igen.')
    return { outcome: 'matched', message, documentNumber }
  } catch {
    return unresolved('unavailable', 'Fortnox kunde inte kontrolleras. Spärren ligger kvar och ingen ny faktura har skapats.')
  }
}
