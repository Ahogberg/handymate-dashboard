/**
 * Fortnox-fakturamappning — ren, deterministisk översättning av en Fortnox-
 * fakturarad till den lokala `invoice`-insert-payloaden. Ingen DB, ingen tid
 * (dagens datum matas in) → enhetstestbar (tests/facit-fortnox-invoice-map.spec.ts).
 *
 * KRITISK SÄKERHET (låst av testet): detta är HISTORISK data. Payloaden sätter
 * ALLTID `reminder_count: 0` och innehåller ALDRIG `next_reminder_at` → importen
 * kan aldrig trigga ett automatiskt utskick. Karin FÖRESLÅR att jaga via den
 * godkännande-gatade vägen; inget skickas av importen själv.
 *
 * Rutten (app/api/fortnox/import/invoices/route.ts) lägger till business_id,
 * customer_id och fortnox_synced_at (icke-deterministisk tid) innan insert.
 */

import type { FortnoxInvoiceListItem } from '../fortnox'

/** Den deterministiska delen av invoice-insert:en (rutten kompletterar resten). */
export interface MappedInvoiceRow {
  invoice_number: string
  invoice_type: 'standard'
  status: 'sent' | 'overdue'
  total: number
  invoice_date: string
  due_date: string | null
  fortnox_document_number: string
  fortnox_invoice_number: string | null
  reminder_count: 0
}

export interface MappedInvoice {
  docNumber: string
  row: MappedInvoiceRow
  /** Utestående belopp (för total_outstanding_kr-summering; ej en insert-kolumn). */
  outstanding: number
}

/** Dokumentnummer att dedup:a/peka tillbaka på. Null → fakturan hoppas över. */
export function resolveDocNumber(fi: FortnoxInvoiceListItem): string | null {
  return fi.DocumentNumber ?? fi.InvoiceNumber ?? null
}

/**
 * Mappar en Fortnox-faktura → lokal invoice-rad (deterministisk del).
 *
 * @param today ISO-datum (YYYY-MM-DD) — förfallen om due_date < today.
 * @returns null om fakturan saknar dokumentnummer (kan varken dedup:as eller
 *          pekas tillbaka) → rutten räknar den som `skipped`.
 */
export function mapFortnoxInvoice(fi: FortnoxInvoiceListItem, today: string): MappedInvoice | null {
  const docNumber = resolveDocNumber(fi)
  if (!docNumber) return null

  const total = Number(fi.Total) || 0
  // Balance = utestående. Saknas fältet → obetald faktura, hela beloppet utestående.
  const outstanding = fi.Balance != null ? Number(fi.Balance) || 0 : total

  const invoice_date = fi.InvoiceDate ?? today
  const due_date = fi.DueDate ?? null
  // Förfallen om förfallodatum passerat, annars bara skickad.
  const status: 'sent' | 'overdue' = due_date && due_date < today ? 'overdue' : 'sent'

  return {
    docNumber,
    outstanding,
    row: {
      invoice_number: fi.InvoiceNumber ?? docNumber,
      invoice_type: 'standard',
      status,
      total,
      invoice_date,
      due_date,
      fortnox_document_number: docNumber,
      fortnox_invoice_number: fi.InvoiceNumber ?? null,
      // SÄKERHET: historisk faktura — inga påminnelser triggas. reminder_count = 0
      // och next_reminder_at utelämnas (lämnas orört/null i DB).
      reminder_count: 0,
    },
  }
}
