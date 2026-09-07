/**
 * Ekonomiprojektion för projektdetaljen (/api/projects/[id]).
 *
 * Bakgrund (rollgranskning 2026-09-07, fynd R1): rutten nollade
 * summeringen och strippade ÄTA-priserna för den som saknar see_financials,
 * men skickade råa underobjekt orörda — quote.total, materialens inköps-
 * och försäljningspris, tidposternas timpris och milstolpsintäkten. Kunden
 * såg "prices_redacted: true" i ett svar som innehöll alla priser.
 *
 * Regeln: när betraktaren inte får se ekonomi går HELA svaret genom
 * `projiceraProjektdetalj`. Fältlistorna är explicita (kolumner verifierade
 * mot information_schema 2026-09-07), inte en regex — en ny kolumn som bär
 * pengar måste läggas till här medvetet. Timmar är arbetsinstruktion, inte
 * pris, och behålls.
 *
 * Samma fält som projektlistan (app/api/projects/route.ts) tar bort, plus
 * de kolumner listan aldrig skickar.
 */

export const PROJEKT_EKONOMIFALT = [
  'budget_amount',
  'budget_hours',
  'actual_labor_cost',
  'actual_material_cost',
  'profitability_status',
] as const

export const TIDPOST_EKONOMIFALT = ['hourly_rate', 'cost_rate'] as const

export const MATERIAL_EKONOMIFALT = [
  'purchase_price',
  'sell_price',
  'markup_percent',
  'total_purchase',
  'total_sell',
] as const

export const MILSTOLPE_EKONOMIFALT = ['budget_amount', 'actual_revenue'] as const

/** Offerten reduceras till identitet och status — inga belopp alls. */
export const OFFERT_SYNLIGA_FALT = ['quote_id', 'title', 'status'] as const

type Rad = Record<string, unknown>

export function utanFalt<T extends Rad>(rad: T, falt: readonly string[]): T {
  const ut: Rad = { ...rad }
  for (const f of falt) delete ut[f]
  return ut as T
}

export function behallFalt<T extends Rad>(rad: T, falt: readonly string[]): Partial<T> {
  const ut: Rad = {}
  for (const f of falt) if (f in rad) ut[f] = rad[f]
  return ut as Partial<T>
}

export interface ProjektdetaljSvar {
  project: Rad
  quote: Rad | null
  milestones: Rad[]
  time_entries: Rad[]
  materials: Rad[]
  [key: string]: unknown
}

/**
 * Returnerar samma objekt när betraktaren får se ekonomi, annars en kopia
 * där varje beloppsfält i project, quote, milestones, time_entries och
 * materials är borttaget. `changes` och `summary` hanteras redan av
 * maybeStripAtaList respektive rutten själv och rörs inte här.
 */
export function projiceraProjektdetalj<T extends ProjektdetaljSvar>(svar: T, redacted: boolean): T {
  if (!redacted) return svar
  return {
    ...svar,
    project: utanFalt(svar.project, PROJEKT_EKONOMIFALT),
    quote: svar.quote ? behallFalt(svar.quote, OFFERT_SYNLIGA_FALT) : null,
    milestones: svar.milestones.map(m => utanFalt(m, MILSTOLPE_EKONOMIFALT)),
    time_entries: svar.time_entries.map(t => utanFalt(t, TIDPOST_EKONOMIFALT)),
    materials: svar.materials.map(m => utanFalt(m, MATERIAL_EKONOMIFALT)),
  }
}
