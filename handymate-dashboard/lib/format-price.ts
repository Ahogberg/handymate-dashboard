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
