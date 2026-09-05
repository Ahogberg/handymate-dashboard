import type { DayFreeCapacityAggregate } from '@/lib/capacity/free-capacity'

/**
 * Föreslagna starttider när kunden just signerat (idé 4).
 *
 * Varför: signeringen är det enda ögonblick då kunden är maximalt engagerad.
 * Går hen därifrån utan datum blir bokningen ett telefonsamtal som ska jagas
 * — och jobb glider. "Vi har plats vecka 38, passar det?" stänger loopen från
 * offert till kalender utan att någon behöver ringa.
 *
 * ÄRLIGHETSREGELN: vi föreslår bara dagar där det faktiskt finns bokningsbar
 * kapacitet enligt kapacitetsmotorn (som redan räknar bort helger, frånvaro,
 * befintliga bokningar och hantverkarens bokningstak). Ett förslag som inte
 * håller är värre än inget förslag — det blir ett löfte hantverkaren måste
 * ta tillbaka.
 *
 * Rena funktioner — facit-testade i tests/booking-suggestions.spec.ts.
 */

export interface BookingSuggestion {
  /** YYYY-MM-DD */
  date: string
  /** ISO-veckonummer, för "vecka 38"-formuleringen. */
  week: number
  /** Bokningsbara timmar den dagen, summerat över teamet. */
  bookableHours: number
}

/** Minsta bokningsbara timmar för att en dag ska räknas som en möjlig start. */
export const MIN_BOOKABLE_HOURS = 4
/** Så många dagar framåt vi som tidigast föreslår — hantverkaren behöver framförhållning. */
export const MIN_LEAD_DAYS = 3
export const MAX_SUGGESTIONS = 3

/** ISO-veckonummer för ett YYYY-MM-DD-datum. */
export function isoWeek(dateStr: string): number {
  const date = new Date(`${dateStr}T12:00:00Z`)
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // Torsdagen i samma vecka avgör vilket år/vecka det är (ISO-8601).
  const dayNumber = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNumber + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3)
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600_000))
}

/**
 * Väljer de dagar som ska erbjudas kunden.
 *
 * Högst en dag per vecka — tre alternativ i samma vecka är inte tre val, det
 * är ett val som ser ut som tre. Den tidigaste dagen i varje vecka vinner.
 */
export function suggestBookingDates(
  days: DayFreeCapacityAggregate[],
  todayStr: string,
  opts: { minBookableHours?: number; minLeadDays?: number; max?: number } = {},
): BookingSuggestion[] {
  const minHours = opts.minBookableHours ?? MIN_BOOKABLE_HOURS
  const minLead = opts.minLeadDays ?? MIN_LEAD_DAYS
  const max = opts.max ?? MAX_SUGGESTIONS

  const earliest = addDays(todayStr, minLead)

  const eligible = days
    .filter(day => !day.isWeekend)
    .filter(day => day.date >= earliest)
    .filter(day => day.bookableHours >= minHours)
    .sort((a, b) => a.date.localeCompare(b.date))

  const seenWeeks = new Set<number>()
  const suggestions: BookingSuggestion[] = []

  for (const day of eligible) {
    const week = isoWeek(day.date)
    if (seenWeeks.has(week)) continue
    seenWeeks.add(week)
    suggestions.push({ date: day.date, week, bookableHours: Math.round(day.bookableHours) })
    if (suggestions.length >= max) break
  }

  return suggestions
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Hämtar förslag för ett företag. Fail-soft: utan lediga tider (eller vid
 * fel) returneras en tom lista och kundvyn visar helt enkelt inget
 * bokningserbjudande — aldrig ett gissat datum.
 *
 * Fönstret är fyra veckor framåt: längre än så är kapacitetsdatat för osäkert
 * för att lova något på.
 */
export async function getBookingSuggestionsForBusiness(
  supabase: any,
  businessId: string,
  today: string,
): Promise<BookingSuggestion[]> {
  try {
    const { data: members, error } = await supabase
      .from('business_users')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)

    if (error || !members || members.length === 0) return []

    const memberIds = (members as { id: string }[]).map(m => m.id)
    const to = new Date(`${today}T12:00:00Z`)
    to.setUTCDate(to.getUTCDate() + 28)
    const range = { from: today, to: to.toISOString().slice(0, 10) }

    const { fetchPersonDays } = await import('@/lib/schedule/person-day')
    const { computeFreeCapacity } = await import('@/lib/capacity/free-capacity')

    const personDays = await fetchPersonDays(supabase, businessId, memberIds, range.from, range.to)
    const capacity = computeFreeCapacity(personDays, memberIds, range)

    return suggestBookingDates(capacity.days, today)
  } catch (err) {
    console.warn('[booking-suggestions] kunde inte räkna fram tider (icke-blockerande):', err)
    return []
  }
}

/** "vecka 38 (måndag 15 september)" — hela formuleringen kunden ser. */
export function formatSuggestion(suggestion: BookingSuggestion): string {
  const date = new Date(`${suggestion.date}T12:00:00Z`)
  const weekday = date.toLocaleDateString('sv-SE', { weekday: 'long', timeZone: 'Europe/Stockholm' })
  const dayMonth = date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })
  return `vecka ${suggestion.week} (${weekday} ${dayMonth})`
}

/**
 * "mån 22 sep" — kort etikett för ett YYYY-MM-DD-datum (kundens
 * requested_date). Delad källa för approve-knappen (lib/jarvis/
 * approval-view.ts), push-titeln (lib/notifications/approval-push.ts) och
 * kvittot (lib/approvals/value-receipt.ts) i Starttiden-loopen
 * (2026-09-05) — samma UTC-noon-ankring som isoWeek/addDays ovan, så
 * veckodagen aldrig glider en dag av en tidszons skull.
 */
export function formatRequestedDateShort(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`)
  return date.toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Stockholm',
  })
}
