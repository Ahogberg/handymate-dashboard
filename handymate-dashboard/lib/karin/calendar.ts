/**
 * Bolagskalenderns händelseform (2026-08-07).
 *
 * ═══ VARFÖR EN EGEN TYP OVANPÅ Obligation ═══
 *
 * Kalendern ska på sikt visa mer än myndighetsdatum: ägarens egna händelser,
 * återkommande kostnader, försäkringar som förnyas, leasing som löper ut.
 *
 * Om vyn byggs direkt mot `Obligation` blir varje sådant tillägg en
 * ombyggnad av gränssnittet. Med ett källagnostiskt event blir det i stället
 * en ny `source` och en ny mappningsfunktion — resten står orört.
 *
 * `source` är därför med redan nu, trots att bara `regel` förekommer i V1.
 * Det är billigt att lägga in i förväg och dyrt att lägga in efteråt.
 *
 * Rena funktioner — tests/karin-calendar.spec.ts.
 */

import type { Obligation } from '@/lib/karin/obligations'
import type { Confidence, ObligationCategory } from '@/lib/karin/obligation-rules'
import { daysBetween } from '@/lib/karin/business-days'

export type EventSource =
  /** Härledd ur en myndighetsregel och företagsprofilen. */
  | 'regel'
  /** Ägaren har lagt in den själv. */
  | 'egen'
  /** Härledd ur en återkommande kostnad eller ett avtal. */
  | 'kostnad'

export interface CalendarEvent {
  id: string
  source: EventSource
  /** Regelns kod för regelhändelser, null för egna poster och kostnader. */
  rule_code: string | null
  title: string
  /** Myndighet, motpart eller tom sträng för egna händelser. */
  authority: string
  category: ObligationCategory | 'egen' | 'kostnad'
  due_date: string
  prepare_from: string
  period_label: string
  why: string
  legal_basis: string
  source_url: string
  rule_version: number | null
  confidence: Confidence
  /** Belopp i kronor när det är känt. V1 känner aldrig till belopp. */
  amount: number | null
  /** Har ägaren markerat den som hanterad? */
  handled: boolean
}

export function obligationToEvent(o: Obligation): CalendarEvent {
  return {
    // Nyckeln är regel + datum, inte ett slumpat id: samma skyldighet ska få
    // samma id vid varje omräkning, annars kan "markerad som hanterad" inte
    // överleva att sidan laddas om.
    id: `regel:${o.rule_code}:${o.due_date}`,
    source: 'regel',
    rule_code: o.rule_code,
    title: o.title,
    authority: o.authority,
    category: o.category,
    due_date: o.due_date,
    prepare_from: o.prepare_from,
    period_label: o.period_label,
    why: o.why,
    legal_basis: o.legal_basis,
    source_url: o.source_url,
    rule_version: o.rule_version,
    confidence: o.confidence,
    amount: null,
    handled: false,
  }
}

export type Urgency = 'forfallen' | 'bradskande' | 'snart' | 'senare'

/**
 * Hur bråttom det är.
 *
 * Trösklarna är valda efter hur lång tid det faktiskt tar att göra något:
 * en momsdeklaration kräver att bokföringen är i fas, vilket tar dagar — inte
 * timmar. Under tre dagar är det för sent att förbereda, bara att göra.
 */
export function urgency(event: CalendarEvent, today: Date): Urgency {
  const dagar = daysBetween(today, new Date(event.due_date + 'T12:00:00'))
  if (dagar < 0) return 'forfallen'
  if (dagar <= 3) return 'bradskande'
  if (dagar <= 14) return 'snart'
  return 'senare'
}

/**
 * Kräver händelsen hantverkarens uppmärksamhet NU?
 *
 * Bara förfallna och brådskande. Att lyfta allt som ligger inom en månad hade
 * gjort sektionen till en andra kalender — och då slutar man läsa den, precis
 * som man slutar läsa amber när allt är gult.
 *
 * En hanterad händelse lyfts aldrig, hur nära den än ligger.
 */
export function needsAttention(event: CalendarEvent, today: Date): boolean {
  if (event.handled) return false
  const u = urgency(event, today)
  return u === 'forfallen' || u === 'bradskande'
}

/**
 * Ordningen i "kräver din uppmärksamhet".
 *
 * Förfallet först, sedan närmast i tiden. Belopp används som sista utslag —
 * inte som första: ett litet belopp som förfaller idag är mer akut än ett
 * stort om tre veckor, eftersom det förfallna redan kostar pengar.
 */
export function sortByUrgency(events: CalendarEvent[], today: Date): CalendarEvent[] {
  const rang: Record<Urgency, number> = { forfallen: 0, bradskande: 1, snart: 2, senare: 3 }
  return [...events].sort((a, b) => {
    const ra = rang[urgency(a, today)]
    const rb = rang[urgency(b, today)]
    if (ra !== rb) return ra - rb
    if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
    return (b.amount ?? 0) - (a.amount ?? 0)
  })
}

export interface MonthGroup {
  /** `2026-08` — sorterbar nyckel. */
  key: string
  /** "augusti 2026" — det som visas. */
  label: string
  events: CalendarEvent[]
}

const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]

/** Grupperar per månad i datumordning. Tomma månader hoppas över. */
export function groupByMonth(events: CalendarEvent[]): MonthGroup[] {
  const grupper = new Map<string, CalendarEvent[]>()
  for (const e of [...events].sort((a, b) => (a.due_date < b.due_date ? -1 : 1))) {
    const key = e.due_date.slice(0, 7)
    const lista = grupper.get(key)
    if (lista) lista.push(e)
    else grupper.set(key, [e])
  }
  return Array.from(grupper.entries()).map(([key, ev]) => {
    const [ar, man] = key.split('-')
    return { key, label: `${MANADER[Number(man) - 1]} ${ar}`, events: ev }
  })
}
