/**
 * Kundens andel av en faktura (2026-08-26). Ren funktion.
 *
 * Utan ROT/RUT är kundens andel hela totalen. Med ROT/RUT är den
 * `customer_pays` om den är satt OCH mindre än totalen — det finns rader
 * där customer_pays defaultats till total (äldre skapandevägar), och då
 * är `total − rot_rut_deduction` den ärligare siffran. Saknas båda är
 * andelen totalen (ingen faktisk skattereduktion registrerad).
 *
 * Används av: betalbeslutet (apply-payment), Fortnox-klassificeraren
 * (sync-payments) och ROT-grinden (Skatteverket: begärt belopp ≤ betalt).
 */

export interface CustomerShareInput {
  total?: number | null
  rot_rut_type?: string | null
  rot_rut_deduction?: number | null
  customer_pays?: number | null
}

export function hasTaxReduction(inv: Pick<CustomerShareInput, 'rot_rut_type'>): boolean {
  return inv.rot_rut_type === 'rot' || inv.rot_rut_type === 'rut'
}

export function getCustomerShare(inv: CustomerShareInput): number {
  const total = Number(inv.total ?? 0)
  if (!hasTaxReduction(inv)) return total

  const customerPays = Number(inv.customer_pays ?? 0)
  if (customerPays > 0 && customerPays < total) return customerPays

  const deduction = Number(inv.rot_rut_deduction ?? 0)
  if (deduction > 0 && deduction < total) return total - deduction

  return total
}

/** Den del som Skatteverket ska betala (0 utan ROT/RUT). */
export function getTaxReductionShare(inv: CustomerShareInput): number {
  const total = Number(inv.total ?? 0)
  return Math.max(0, total - getCustomerShare(inv))
}
