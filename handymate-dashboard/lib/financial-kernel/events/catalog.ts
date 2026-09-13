/**
 * Financial Kernel — kanonisk eventkatalog (Paket C0, 2026-09-13).
 *
 * Detta är den maskinläsbara spegeln av tabellen i ARCHITECTURE.md
 * "Financial Kernel — kontrakt" §FK.1. Namnen ägs av dokumentet; filen
 * finns för att kernel-kod ska kunna skriva `FinancialEventType` i stället
 * för lösa strängar. `tests/financial-kernel-event-contract.spec.ts` failar
 * om listan här och tabellen där skiljer sig åt — lägg till raden i
 * ARCHITECTURE.md först, sedan här, i samma PR.
 *
 * Inget beteende. Ingen tabell, ingen publish, ingen konsument — det är
 * Paket C2/C3. Kernel-event går ALDRIG genom fireEvent() i
 * lib/automation-engine.ts; bryggan (events/bridge-automation.ts, Paket C5)
 * är det enda undantaget och får bara skicka legacy-namn ur ARCHITECTURE.md §4.
 */

export const FINANCIAL_EVENT_TYPES = [
  // Fordran (kommersiell)
  'invoice_issued',
  'invoice_credited',
  'receivable_created',
  'receivable_adjusted',
  'receivable_settled',
  // Pay (pengarörelse) — gäller även provider 'manual' och 'fortnox'
  'payment_intent_created',
  'payment_initiated',
  'payment_authorized',
  'payment_processing_started',
  'payment_settled',
  'payment_failed',
  'payment_cancelled',
  'payment_refunded',
  'payment_disputed',
  'payout_created',
  'payout_settled',
  // Allokering och avstämning
  'payment_allocated',
  'payment_allocation_reversed',
  'bank_transaction_imported',
  'reconciliation_matched',
  'reconciliation_unmatched',
  'reconciliation_reversed',
  // Ledger (bokföring) och shadow
  'journal_entry_posted',
  'journal_entry_reversed',
  'period_locked',
  'period_unlocked',
  'payment_divergence_detected',
  'accounting_divergence_detected',
  // Leverantör / AP
  'supplier_invoice_approved',
  'payable_created',
  'supplier_payment_settled',
  'payable_settled',
] as const

export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[number]

/** Aktuell schemaversion per eventtyp. Startar på 1; höjs bara vid bakåtinkompatibel payloadändring. */
export const FINANCIAL_EVENT_SCHEMA_VERSION = 1

export function isFinancialEventType(value: string): value is FinancialEventType {
  return (FINANCIAL_EVENT_TYPES as readonly string[]).includes(value)
}
