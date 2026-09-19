/**
 * Offertstartens adressrad — EN läsare, EN dialekt (rivningen A3, 2026-09-17).
 *
 * Tio ingångar ledde till /dashboard/quotes/new med fem dialekter: kundkortet
 * och affärsmodalen skrev `customerId`, affärskortet och kundunderlaget
 * `customer_id`, och `?description` sattes på offerten utan att nå intagets
 * ruta eller räknas som startsignal — en djuplänk med beskrivning öppnade
 * ändå det tomma intaget. Varje ingång läste dessutom sina parametrar på
 * eget sätt inne i QuoteBuilder.
 *
 * Alla ingångar skriver nu `customer_id` (samma form som `deal_id`,
 * `preparation_id`, `job_type`). `customerId` läses fortfarande, tyst, tills
 * gamla bokmärken och mejlade länkar dött — men ingen kod i repot får skriva
 * den formen; facit tests/offertstarten-en-skarm.spec.ts vaktar det.
 *
 * Ren modul: tar bara ett `get`, så både Next:s searchParams och facit kan
 * mata den.
 */

export interface QuoteStartParams {
  customerId: string | null
  dealId: string | null
  leadId: string | null
  title: string | null
  description: string | null
  transcript: string | null
  preparationId: string | null
  relief: string | null
}

const MAX = 4000

function read(params: Pick<URLSearchParams, 'get'>, key: string, max = 200): string | null {
  const value = params.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

export function readQuoteStartParams(params: Pick<URLSearchParams, 'get'> | null | undefined): QuoteStartParams {
  if (!params) return { customerId: null, dealId: null, leadId: null, title: null, description: null, transcript: null, preparationId: null, relief: null }
  return {
    // Dialekten i repot är customer_id. camelCase bara som läsbakåtkompatibilitet.
    customerId: read(params, 'customer_id') ?? read(params, 'customerId'),
    dealId: read(params, 'deal_id'),
    leadId: read(params, 'lead_id'),
    title: read(params, 'title', 300),
    description: read(params, 'description', MAX),
    transcript: read(params, 'transcript', MAX),
    preparationId: read(params, 'preparation_id'),
    relief: read(params, 'relief', 500),
  }
}

/**
 * Sant när adressraden redan pekat ut vad offerten ska bli. Då döljs
 * startsteget: jobbtypen är vald, kunden känd, eller texten finns redan.
 * `description`, `preparation_id` och `relief` räknades inte förut — en
 * djuplänk med färdig beskrivning landade i ett tomt intag.
 */
export function hasQuoteStartSignal(start: QuoteStartParams): boolean {
  return !!(start.transcript || start.dealId || start.leadId || start.customerId || start.title
    || start.description || start.preparationId || start.relief)
}
