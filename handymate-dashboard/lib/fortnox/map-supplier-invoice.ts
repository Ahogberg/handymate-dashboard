/**
 * Fortnox-leverantörsfakturamappning — ren, deterministisk översättning av
 * en Fortnox SupplierInvoice-rad till den lokala supplier_invoices-insert-
 * payloaden. Ingen DB, ingen tid (dagens datum matas in) → enhetstestbar.
 * Speglar lib/fortnox/map-invoice.ts:s idiom.
 *
 * Rutten (app/api/integrations/fortnox/import/supplier-invoices/route.ts)
 * lägger till business_id och fortnox_synced_at innan insert. project_id
 * och subcontractor_id sätts ALDRIG av importen — det är matchningsköns
 * jobb (Etapp 3).
 */

import type { FortnoxSupplierInvoiceListItem } from '../fortnox'

export interface MappedSupplierInvoiceRow {
  supplier_name: string
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  amount_excl_vat: number
  vat_amount: number
  total_amount: number
  status: 'unpaid' | 'overdue' | 'paid'
  fortnox_supplier_invoice_number: string
  fortnox_supplier_number: string | null
}

export interface MappedSupplierInvoice {
  docNumber: string
  row: MappedSupplierInvoiceRow
}

/** Dokumentnummer att dedup:a/peka tillbaka på. Null → fakturan hoppas över. */
export function resolveSupplierDocNumber(fi: FortnoxSupplierInvoiceListItem): string | null {
  return fi.GivenNumber ?? fi.InvoiceNumber ?? null
}

/**
 * Mappar en Fortnox-leverantörsfaktura → lokal supplier_invoices-rad.
 * @param today ISO-datum (YYYY-MM-DD) — förfallen om due_date < today.
 * @returns null om fakturan saknar dokumentnummer.
 */
export function mapFortnoxSupplierInvoice(
  fi: FortnoxSupplierInvoiceListItem,
  today: string,
): MappedSupplierInvoice | null {
  const docNumber = resolveSupplierDocNumber(fi)
  if (!docNumber) return null

  const total = Number(fi.Total) || 0
  const balance = fi.Balance != null ? Number(fi.Balance) || 0 : total
  const isPaid = balance <= 0
  const due_date = fi.DueDate ?? null

  const status: 'unpaid' | 'overdue' | 'paid' = isPaid
    ? 'paid'
    : (due_date && due_date < today ? 'overdue' : 'unpaid')

  return {
    docNumber,
    row: {
      supplier_name: fi.SupplierName?.trim() || 'Okänd leverantör',
      invoice_number: fi.InvoiceNumber ?? docNumber,
      invoice_date: fi.InvoiceDate ?? null,
      due_date,
      amount_excl_vat: total,
      vat_amount: 0,
      total_amount: total,
      status,
      fortnox_supplier_invoice_number: docNumber,
      fortnox_supplier_number: fi.SupplierNumber ?? null,
    },
  }
}
