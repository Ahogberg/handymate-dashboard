import type { CustomerPriceList, GeneratedQuoteItem, PriceListItem } from '../ai-quote-generator'
import { matchGeneratedItem, normalizeName, type MatchableProduct } from '../products/match-generated-items'
import { quotePriceUnit, type JobTypeGenerationContext } from './job-type-generation'

function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export type PricedGeneratedItem = GeneratedQuoteItem & { quantitySource: 'proposal' }

/**
 * Modellen väljer innehåll, aldrig ett auktoritativt pris. Gäller de tre
 * ingångarna med gemensamt verifierat underlag. Äldre generatoranrop är orörda.
 * Kundens EXAKTA namn+enhet → kundens vanliga timpris (arbete/tim) → vald
 * bankartikel → företagets timpris (endast olänkad, generell arbetsrad).
 * Ingen fuzzy-prissättning, materialpåslagsberäkning eller mängdomräkning.
 */
export function applyGeneratedPriceTruth(
  rows: GeneratedQuoteItem[], raw: Array<{ productRef?: unknown; customerRateRef?: unknown }>, prices: PriceListItem[],
  hourlyRate: number, customer?: CustomerPriceList, context?: JobTypeGenerationContext,
): PricedGeneratedItem[] {
  if (rows.length > 100) throw new Error('Offertförslaget innehåller för många rader. Dela upp beskrivningen och försök igen.')
  const products: MatchableProduct[] = prices.filter(p => p.id).map(p => ({ id: p.id!, name: p.name, unit: p.unit }))
  const handles = new Map<string, MatchableProduct>()
  prices.forEach((p, i) => { if (p.id) handles.set(`P${i + 1}`, { id: p.id, name: p.name, unit: p.unit }) })
  return rows.map((row, i) => {
    if (typeof row.description !== 'string' || !row.description.trim() || !quotePriceUnit(row.unit) ||
      !['labor', 'material', 'service'].includes(row.type) ||
      typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity < 0) {
      throw new Error('Offertförslaget innehåller en ogiltig rad eller mängd. Försök igen; inget utkast har sparats.')
    }
    const unit = quotePriceUnit(row.unit)
    const name = normalizeName(row.description)
    const ref = raw[i]?.productRef
    const explicit = ref !== undefined && ref !== null && ref !== ''
    const compatible = products.filter(p => quotePriceUnit(p.unit) === unit)
    let productId: string | null = null
    let matchType: 'handle' | 'exact' | null = null
    let ambiguous = false
    if (explicit) {
      const parsed = typeof ref === 'string' ? ref.trim().match(/^\[?(P\d+)\]?$/i) : null
      const product = parsed ? handles.get(parsed[1].toUpperCase()) : undefined
      if (product && quotePriceUnit(product.unit) === unit) {
        const found = matchGeneratedItem({ description: row.description, unit: row.unit, productRef: parsed![1] }, compatible, handles)
        const ownerLinked = context?.rows.some(r => r.linkedProductId === product.id && quotePriceUnit(r.unit) === unit && normalizeName(r.description) === name)
        if (ownerLinked || (found?.matchType === 'handle' && found.productId === product.id)) { productId = product.id; matchType = 'handle' }
      }
    } else {
      const exact = compatible.filter(p => normalizeName(p.name) === name)
      ambiguous = exact.length > 1
      if (exact.length === 1) { productId = exact[0].id; matchType = 'exact' }
    }

    // En mallrad vars explicita koppling gått sönder får inte återuppstå
    // genom en namnträff på en annan produkt eller ett generellt timpris.
    const basisRows = context?.rows.filter(r => normalizeName(r.description) === name && quotePriceUnit(r.unit) === unit) || []
    const brokenBasis = basisRows.some(r => !r.linkedProductId || (productId && r.linkedProductId !== productId))
    if (brokenBasis) { productId = null; matchType = null }
    const unsafeRef = (explicit && !productId) || brokenBasis || ambiguous
    const bank = productId ? prices.find(p => p.id === productId) : undefined
    const customerRows = (customer?.items || []).filter(p => quotePriceUnit(p.unit) === unit &&
      (normalizeName(p.name) === name || (bank && normalizeName(p.name) === normalizeName(bank.name))))
    const hourlyLabor = row.type === 'labor' && unit === 'tim'
    const rates = { normal: customer?.hourly_rate_normal, ob1: customer?.hourly_rate_ob1,
      ob2: customer?.hourly_rate_ob2, emergency: customer?.hourly_rate_emergency }
    const rateRef = raw[i]?.customerRateRef
    const hasRateChoice = rateRef !== undefined && rateRef !== null && rateRef !== ''
    const multipleRates = Object.values(rates).filter(validPrice).length > 1
    const chosenRate = typeof rateRef === 'string' && Object.prototype.hasOwnProperty.call(rates, rateRef)
      ? rates[rateRef as keyof typeof rates] : undefined
    let price: number | undefined
    if (!unsafeRef) {
      if (customerRows.length) {
        // Flera motstridiga kundrader är inte ett prisbeslut.
        if (customerRows.every(p => validPrice(p.price) && p.price === customerRows[0].price)) price = customerRows[0].price
      } else if (hourlyLabor && (hasRateChoice || multipleRates)) {
        // Modellen kan föreslå normal/OB/jour, aldrig själva beloppet.
        // Oklart val mellan flera avtalspriser kräver granskning.
        if (validPrice(chosenRate)) price = chosenRate
      } else if (hourlyLabor && validPrice(customer?.hourly_rate_normal)) price = customer!.hourly_rate_normal!
      else if (bank) { if (validPrice(bank.unit_price)) price = bank.unit_price }
      else if (!explicit && hourlyLabor && validPrice(hourlyRate)) price = hourlyRate
    }
    const missing = price === undefined
    const unitPrice = price ?? 0
    if (!Number.isFinite(row.quantity * unitPrice)) throw new Error('Offertens radbelopp är för stort. Granska mängden.')
    return { ...row, unitPrice, linkedProductId: productId, productMatchType: matchType,
      fromPriceList: !missing, quantitySource: 'proposal',
      note: missing ? 'PRIS SAKNAS — granska artikel, enhet och pris innan offerten skickas.'
        : row.note?.includes('PRIS SAKNAS') ? null : row.note }
  })
}
