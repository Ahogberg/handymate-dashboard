/**
 * Serviceavtal — delad prisberäkning (Motor 2, Etapp 2).
 *
 * service_agreement.price_items (och service_agreement_type.price_items)
 * lagras EXKL. moms (se lib/agreement-type-defaults.ts-kommentaren och
 * lib/agreements/invoice-visit.ts som fakturerar med en fast 25%-sats).
 * Kundvända ytor (portalen, erbjudande-SMS) ska visa INKL. moms — samma
 * 25%-regel som invoice-visit.ts steg 3 använder vid fakturering, så
 * summan kunden ser i SMS/portal stämmer med vad hen faktiskt faktureras.
 *
 * Ren funktion — inga DB-anrop, testbar direkt.
 */

export interface PriceItemLike {
  quantity?: number | null
  unit_price?: number | null
}

const VAT_RATE = 0.25

/** Summera price_items EXKL. moms (kvantitet × styckpris, default kvantitet 1). */
export function priceExclVat(priceItems: PriceItemLike[] | null | undefined): number {
  if (!Array.isArray(priceItems)) return 0
  return priceItems.reduce((sum, item) => {
    const qty = Number(item?.quantity ?? 1) || 1
    const unitPrice = Number(item?.unit_price ?? 0) || 0
    return sum + qty * unitPrice
  }, 0)
}

/**
 * Pris per besök INKL. moms (avrundat till närmaste krona) — samma 25%-sats
 * som lib/agreements/invoice-visit.ts fakturerar med. Används i kundvända
 * ytor: portalens avtalsvy och Hannas erbjudande-SMS (fallback + Haiku-
 * prompten som underlag, aldrig AI-uppfunnet).
 */
export function priceInclVatPerVisit(priceItems: PriceItemLike[] | null | undefined): number {
  return Math.round(priceExclVat(priceItems) * (1 + VAT_RATE))
}
