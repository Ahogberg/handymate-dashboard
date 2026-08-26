/**
 * Fakturastatusar — EN sanningskälla för "kunden har gjort sitt" (2026-08-26).
 *
 * Bakgrund (ROT/RUT-delbetalning): när kunden betalar SIN del av en ROT/RUT-
 * faktura är kundrelationen klar — resterande belopp (skattereduktionen)
 * begärs från Skatteverket, inte från kunden. Det tillståndet heter
 * `customer_paid` (sql/v170). `paid` betyder helt slutbetald (settled_at).
 *
 * Alla ställen som tidigare frågade `status === 'paid'` i betydelsen "kunden
 * har betalat" ska gå via isCustomerSettled() — påminnelser, portalens
 * synlighet, ROT-grinden, ekonomi-aggregat. Tolv hårdkodade listor var
 * exakt det som gjorde delbetalning osynlig.
 */

export const CUSTOMER_SETTLED_STATUSES = ['paid', 'customer_paid'] as const
export type CustomerSettledStatus = (typeof CUSTOMER_SETTLED_STATUSES)[number]

/** Statusar kunden ska kunna se i portalen (utkast/makulerad/krediterad döljs). */
export const PORTAL_VISIBLE_STATUSES = ['sent', 'customer_paid', 'paid', 'overdue'] as const

/** true när kunden inte längre är skyldig något på fakturan. */
export function isCustomerSettled(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'customer_paid'
}

/** true när hela fakturan är reglerad (inkl. ev. Skatteverkets del). */
export function isFullySettled(status: string | null | undefined): boolean {
  return status === 'paid'
}
