import type { QuoteItem } from '@/lib/types/quote'

/**
 * Täckningsbidrag per offert — marginalen medan hantverkaren bygger.
 *
 * Varför: de flesta hantverkare offererar utan att veta sin marginal och
 * upptäcker den först i efterkalkylen, om ens då. Att se "du ligger på 22 %"
 * medan raderna läggs till ändrar beteendet i det ögonblick det spelar roll.
 *
 * ÄRLIGHETSREGELN: vi räknar BARA på rader där inköpspriset faktiskt är känt.
 * Ett saknat inköpspris får aldrig tolkas som noll — då hade en offert utan
 * ifyllda inköpspriser visat 100 % marginal, vilket är den värsta möjliga
 * lögnen att bygga prisbeslut på. Rader utan inköpspris redovisas separat som
 * "okänt", och siffran märks som partiell så länge de finns.
 *
 * Rena funktioner — facit-testade i tests/quote-margin.spec.ts.
 */

export interface QuoteMargin {
  /** Försäljningsvärde för de rader där inköpspriset är känt. */
  knownRevenue: number
  /** Inköpskostnad för samma rader. */
  knownCost: number
  /** knownRevenue − knownCost. */
  contribution: number
  /** Marginal i procent av knownRevenue. null när inget underlag finns. */
  marginPercent: number | null
  /** Antal artikelrader med känt inköpspris. */
  rowsWithCost: number
  /** Antal artikelrader UTAN inköpspris — de saknas i siffran. */
  rowsWithoutCost: number
  /** Försäljningsvärde som ligger utanför beräkningen. */
  revenueWithoutCost: number
  /** true när minst en rad saknar inköpspris → siffran är partiell. */
  isPartial: boolean
}

const EMPTY: QuoteMargin = {
  knownRevenue: 0,
  knownCost: 0,
  contribution: 0,
  marginPercent: null,
  rowsWithCost: 0,
  rowsWithoutCost: 0,
  revenueWithoutCost: 0,
  isPartial: false,
}

/**
 * Räknar täckningsbidrag på offertens artikelrader.
 *
 * Endast 'item' och valda 'option' räknas — rubriker, fritext, delsummor och
 * rabatter har inget inköpspris. Bortvalda tillval ingår inte i offerten och
 * ska därför inte påverka marginalen.
 */
export function calculateQuoteMargin(items: QuoteItem[]): QuoteMargin {
  const relevant = items.filter(item => {
    if (item.item_type === 'item') return true
    if (item.item_type === 'option') return item.option_selected === true
    return false
  })

  if (relevant.length === 0) return EMPTY

  let knownRevenue = 0
  let knownCost = 0
  let rowsWithCost = 0
  let rowsWithoutCost = 0
  let revenueWithoutCost = 0

  for (const item of relevant) {
    const revenue = Number(item.total) || 0
    const cost = item.cost_price

    // `== null` fångar både null och undefined. 0 är ett GILTIGT inköpspris
    // (egen arbetad timme, återanvänt material) och ska räknas som känt.
    if (cost == null || Number.isNaN(Number(cost))) {
      rowsWithoutCost++
      revenueWithoutCost += revenue
      continue
    }

    knownRevenue += revenue
    knownCost += Number(cost) * (Number(item.quantity) || 0)
    rowsWithCost++
  }

  const contribution = knownRevenue - knownCost

  return {
    knownRevenue: Math.round(knownRevenue),
    knownCost: Math.round(knownCost),
    contribution: Math.round(contribution),
    marginPercent: knownRevenue > 0 ? Math.round((contribution / knownRevenue) * 100) : null,
    rowsWithCost,
    rowsWithoutCost,
    revenueWithoutCost: Math.round(revenueWithoutCost),
    isPartial: rowsWithoutCost > 0,
  }
}

/**
 * Hur marginalen ska presenteras. Trösklarna är medvetet grova — det här är
 * en varningslampa, inte en branschanalys, och en hantverkare med 18 % kan ha
 * mycket goda skäl. Copyn dömer aldrig, den påpekar.
 */
export type MarginTone = 'saknas' | 'låg' | 'ok' | 'god'

export function marginTone(margin: QuoteMargin): MarginTone {
  if (margin.marginPercent === null) return 'saknas'
  if (margin.marginPercent < 15) return 'låg'
  if (margin.marginPercent < 30) return 'ok'
  return 'god'
}
