/**
 * Varför kunden tackade nej — strukturerat, inte fritext.
 *
 * Bakgrund: förlorade offerter försvann i tystnad. Hantverkaren visste aldrig
 * VARFÖR, och kunde därför aldrig ändra något. Fritext hjälper inte heller —
 * kunden orkar sällan skriva, och det som skrivs går inte att räkna på.
 *
 * Fyra val, låg friktion för kunden, räknebart för hantverkaren. Fritext
 * finns kvar som frivilligt komplement.
 *
 * 'not_now' är den viktigaste kategorin: den är inte en förlust utan en
 * uppskjuten affär, och matar återaktiveringsmotorn (vilande pengar) med
 * kandidater i stället för att skrivas av.
 *
 * Rena funktioner — facit-testade i tests/decline-reasons.spec.ts.
 */

export type DeclineReasonCode = 'too_expensive' | 'chose_other' | 'not_now' | 'other'

export interface DeclineReasonOption {
  code: DeclineReasonCode
  /** Kundens formulering — vänlig, aldrig anklagande. */
  label: string
  /** Hantverkarens formulering i statistiken. */
  analyticsLabel: string
}

export const DECLINE_REASONS: DeclineReasonOption[] = [
  { code: 'too_expensive', label: 'Priset var för högt', analyticsLabel: 'För dyrt' },
  { code: 'chose_other', label: 'Vi valde en annan leverantör', analyticsLabel: 'Valde konkurrent' },
  { code: 'not_now', label: 'Inte aktuellt just nu', analyticsLabel: 'Uppskjutet' },
  { code: 'other', label: 'Annat skäl', analyticsLabel: 'Annat' },
]

const VALID_CODES = new Set<string>(DECLINE_REASONS.map(r => r.code))

/** Validerar en inkommande kod. Okänt värde → null (aldrig ett kast). */
export function parseDeclineReasonCode(value: unknown): DeclineReasonCode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return VALID_CODES.has(normalized) ? (normalized as DeclineReasonCode) : null
}

/** Etiketten hantverkaren ser i statistiken. */
export function declineReasonLabel(code: string | null | undefined): string {
  if (!code) return 'Skäl saknas'
  return DECLINE_REASONS.find(r => r.code === code)?.analyticsLabel ?? 'Annat'
}

/**
 * Bygger den lagrade `lost_reason`-strängen: koden först så den går att
 * gruppera på, kundens egna ord efter om de finns.
 * Format: "too_expensive" eller "too_expensive: fick 20% billigare"
 */
export function buildLostReason(code: DeclineReasonCode | null, freeText?: string | null): string | null {
  const text = (freeText || '').trim()
  if (!code) return text || null
  return text ? `${code}: ${text}` : code
}

/** Plockar ut koden ur en lagrad lost_reason-sträng. */
export function extractReasonCode(lostReason: string | null | undefined): DeclineReasonCode | null {
  if (!lostReason) return null
  const head = lostReason.split(':')[0]
  return parseDeclineReasonCode(head)
}

export interface DeclinedQuoteRow {
  lost_reason?: string | null
  total?: number | null
  /** Fritt grupperingsfält — t.ex. jobbtyp eller mallnamn. */
  segment?: string | null
}

export interface DeclineBreakdownEntry {
  code: DeclineReasonCode | 'unknown'
  label: string
  count: number
  /** Summerat offertvärde för de förlorade offerterna i kategorin. */
  lostValue: number
  /** Andel av alla avböjda, avrundat till heltalsprocent. */
  share: number
}

/**
 * Aggregerar avböjda offerter per skäl. Sorterad på antal, störst först —
 * hantverkaren ska se sitt vanligaste tapp överst utan att leta.
 */
export function summarizeDeclineReasons(rows: DeclinedQuoteRow[]): DeclineBreakdownEntry[] {
  if (rows.length === 0) return []

  const buckets = new Map<string, { count: number; lostValue: number }>()
  for (const row of rows) {
    const code = extractReasonCode(row.lost_reason) ?? 'unknown'
    const bucket = buckets.get(code) || { count: 0, lostValue: 0 }
    bucket.count++
    bucket.lostValue += Number(row.total) || 0
    buckets.set(code, bucket)
  }

  const total = rows.length
  return Array.from(buckets.entries())
    .map(([code, bucket]) => ({
      code: code as DeclineReasonCode | 'unknown',
      label: code === 'unknown' ? 'Skäl saknas' : declineReasonLabel(code),
      count: bucket.count,
      lostValue: Math.round(bucket.lostValue),
      share: Math.round((bucket.count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv'))
}

/**
 * Den mening hantverkaren faktiskt vill läsa. Returnerar null när underlaget
 * är för tunt — tre avböjda offerter är ingen trend, och att påstå det vore
 * att uppfinna insikter.
 */
export const MIN_DECLINES_FOR_INSIGHT = 5
/** Ett skäl måste både dominera OCH förekomma nog många gånger. */
export const MIN_SHARE_FOR_INSIGHT = 40
export const MIN_COUNT_FOR_INSIGHT = 3

export function buildDeclineInsight(rows: DeclinedQuoteRow[]): string | null {
  if (rows.length < MIN_DECLINES_FOR_INSIGHT) return null

  const breakdown = summarizeDeclineReasons(rows).filter(entry => entry.code !== 'unknown')
  if (breakdown.length === 0) return null

  const top = breakdown[0]
  // Både andel OCH antal krävs. Två av fem är 40 % men fortfarande bara två
  // kunder — att kalla det ett mönster vore att uppfinna en insikt.
  if (top.share < MIN_SHARE_FOR_INSIGHT || top.count < MIN_COUNT_FOR_INSIGHT) return null

  if (top.code === 'too_expensive') {
    return `${top.share} % av dina avböjda offerter föll på priset — ${top.lostValue.toLocaleString('sv-SE')} kr i förlorat värde.`
  }
  if (top.code === 'chose_other') {
    return `${top.share} % av kunderna valde en konkurrent. Det handlar oftare om trygghet än om pris.`
  }
  if (top.code === 'not_now') {
    return `${top.share} % sköt upp jobbet — de är inte förlorade, de är för tidiga. Teamet kan väcka dem senare.`
  }
  return null
}
