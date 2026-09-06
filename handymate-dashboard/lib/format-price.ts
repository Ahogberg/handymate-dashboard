/**
 * Price formatting utilities for consistent display across the platform.
 * All amounts in the database are stored excluding VAT (exkl. moms).
 * VAT is calculated at display time using the business's vat_rate (default 25%).
 */

/**
 * Format an amount in SEK with Swedish locale, no decimals.
 * Example: 40000 → "40 000 kr"
 */
export function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount) + ' kr'
}

/**
 * Format a price showing both exkl. and inkl. moms.
 * Example: formatPriceWithVat(40000) → "40 000 kr exkl. moms (50 000 kr inkl. moms)"
 */
export function formatPriceWithVat(exVat: number, vatRate: number = 25): string {
  const inclVat = Math.round(exVat * (1 + vatRate / 100))
  return `${formatSEK(exVat)} exkl. moms (${formatSEK(inclVat)} inkl. moms)`
}

/**
 * Calculate VAT amount from an ex-VAT price.
 */
export function calculateVat(exVat: number, vatRate: number = 25): number {
  return Math.round(exVat * (vatRate / 100))
}

/**
 * Calculate ex-VAT price from an incl-VAT price.
 */
export function priceExVat(inclVat: number, vatRate: number = 25): number {
  return Math.round(inclVat / (1 + vatRate / 100))
}

/**
 * F20 (Codex liveprov 2026-09-06): samma belopp visades som 1 062,5 i
 * portalens lista, 1 063 i dokumentet och 812,5 / 813 i fakturaskaparen
 * respektive fakturadokumentet — sex formaterare med olika avrundning.
 * Regeln nu: hela kronor visas utan decimaler, öre visas med exakt två.
 * Det betalningsgrundande beloppet (invoice.total, Swish) är aldrig
 * avrundat, så visningen får inte heller vara det.
 */
export function formatKronorTal(amount: number | null | undefined): string {
  const n = Number(amount ?? 0)
  if (!Number.isFinite(n)) return '0'
  const avrundat = Math.round(n * 100) / 100
  const decimaler = Number.isInteger(avrundat) ? 0 : 2
  return new Intl.NumberFormat('sv-SE', {
    style: 'decimal',
    minimumFractionDigits: decimaler,
    maximumFractionDigits: decimaler,
  }).format(avrundat).replace(/[\u00a0\u202f]/g, ' ')
}

export function formatKronor(amount: number | null | undefined): string {
  return `${formatKronorTal(amount)} kr`
}

