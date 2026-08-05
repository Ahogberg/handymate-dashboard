/**
 * Fri kapacitet-primitiven (Fas 1, "Kapacitets-primitiven" —
 * tasks/vad-kan-vi-kopiera-snug-phoenix.md). EN funktion alla kanaler
 * läser (Hannas kapacitet-fyllnad, dispatch-bedömningen, get_person_schedule
 * -verktyget, senare Röst-Lisas bokningslogik) istället för att var och en
 * räknar ledig tid på sitt eget sätt.
 *
 * Skiljer sig medvetet från lib/capacity/week-capacity.ts (kapacitet-
 * primitiv v1): week-capacity är ETT businessaggregat per VECKA (Hannas
 * tunn-vecka-trigger). Den här modulen är PER PERSON, PER DAG — den
 * primitiv Röst-Lisa (och resurstavlan/dispatch) behöver för att svara
 * "vem är ledig imorgon, och hur mycket" istället för bara "är veckan
 * tunn totalt sett". De två lever sida vid sida, ingen ersätter den andra.
 *
 * Två lager, samma uppdelning som person-day.ts/week-capacity.ts:
 *  - computeFreeCapacity: ren beräkningskärna, ingen I/O — facit-testas i
 *    tests/free-capacity.spec.ts. Bygger på REDAN hämtade PersonDay[]
 *    (lib/schedule/person-day.ts, fetchPersonDays) — ingen ny datamodell.
 *  - getFreeCapacity: I/O-wrappern som hämtar aktiva business_users +
 *    fetchPersonDays och kör dem genom kärnan. Kastar aldrig — DB-fel
 *    loggas och behandlas som "ingen ledig kapacitet den här körningen"
 *    (tom lista), samma fail-safe-hållning som fetchPersonDays.
 *
 * Timberäkning: ÅTERANVÄNDER sumShiftHours + STANDARD_WORKDAY_HOURS från
 * lib/schedule/utilization.ts — SAMMA formel som beläggningsberäkningen
 * (computePersonWeekUtilization), extraherad dit som en delad hjälpare så
 * den inte duplicerades en tredje gång här.
 *
 * Regler för lediga timmar per person/dag (medvetet EGNA regler, skiljer
 * sig från utilization.ts på två punkter — se resp. kommentar nedan):
 *  - Frånvarodag (isAbsent) → 0 lediga timmar. Till skillnad från
 *    beläggningsberäkningen (som räknar ett allDay time_off-pass som 8h
 *    "bemannat" i sin nämnare, se utilization.ts-testerna) är frågan här
 *    "hur mycket går det att BOKA den dagen" — svaret är noll när personen
 *    är borta, oavsett vad passets klocktider råkar summera till.
 *  - Helg → 0 lediga timmar (samma helgregel/isWeekendDate som
 *    utilization.ts — inga bokningsbara helgtimmar).
 *  - Annars: lediga timmar = max(0, STANDARD_WORKDAY_HOURS − summa
 *    passtimmar den dagen). Aldrig negativt (en överbokad dag ger 0, inte
 *    minus).
 *
 * Bokningsbart utrymme ovanpå det: bookableHours = max(0, freeHours ×
 * bookingCapPct − emergencyReserveHours) — "boka max X % av den lediga
 * tiden, spara resten till akutjobb", samma andemening som week-capacitys
 * booking-cap men applicerad per dag istället för per vecka.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonDay, PersonDayRange } from '../schedule/person-day'
import { fetchPersonDays } from '../schedule/person-day'
import { STANDARD_WORKDAY_HOURS, sumShiftHours, isWeekendDate } from '../schedule/utilization'

// ─────────────────────────────────────────────────────────────────
// Inställningar
// ─────────────────────────────────────────────────────────────────

/**
 * TODO (Fas 2 / Röst-Lisa-specen avgör): business_config har INGA kolumner
 * för boknings-tak eller akutreserv (grep sql/ 2026-08-05: inga
 * booking_cap_pct/emergency_reserve*-träffar). Ingen migration i denna
 * etapp — hårdkodade defaults tills ett inställnings-UI byggs och en
 * riktig kolumn/rad tillkommer (samma "verklig inställning vs. gissning"
 * -princip som week-capacity.ts redan etablerat, se dess `configured`-fält
 * — när UI:t byggs, följ samma mönster här).
 */
export interface FreeCapacitySettings {
  /** Andel (0–1) av lediga timmar som får bokas. Default 0.75 (boka max 75 %). */
  bookingCapPct: number
  /** Timmar per dag som ALLTID sparas till akutjobb, utöver bookingCapPct. Default 0. */
  emergencyReserveHours: number
}

export const DEFAULT_BOOKING_CAP_PCT = 0.75
export const DEFAULT_EMERGENCY_RESERVE_HOURS = 0

export const DEFAULT_FREE_CAPACITY_SETTINGS: FreeCapacitySettings = {
  bookingCapPct: DEFAULT_BOOKING_CAP_PCT,
  emergencyReserveHours: DEFAULT_EMERGENCY_RESERVE_HOURS,
}

// ─────────────────────────────────────────────────────────────────
// Typer
// ─────────────────────────────────────────────────────────────────

export interface PersonDayFreeCapacity {
  businessUserId: string
  /** YYYY-MM-DD */
  date: string
  isWeekend: boolean
  isAbsent: boolean
  /** max(0, 8h − bokade timmar). 0 på helg/frånvarodag. */
  freeHours: number
  /** max(0, freeHours × bookingCapPct − emergencyReserveHours). */
  bookableHours: number
}

export interface PersonFreeCapacity {
  businessUserId: string
  days: PersonDayFreeCapacity[]
  totalFreeHours: number
  totalBookableHours: number
}

export interface DayFreeCapacityAggregate {
  /** YYYY-MM-DD */
  date: string
  isWeekend: boolean
  /** Summa över alla personer denna dag. */
  freeHours: number
  bookableHours: number
}

export interface FreeCapacityResult {
  range: PersonDayRange
  people: PersonFreeCapacity[]
  /** Per dag, summerat över alla personer — bekvämt för kanaler som bara
   *  vill veta "hur mycket ledigt finns totalt den 12:e", t.ex. Röst-Lisa. */
  days: DayFreeCapacityAggregate[]
  totalFreeHours: number
  totalBookableHours: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Alla YYYY-MM-DD-datum i [from, to], inklusive. Samma "säkert ankare"
 * -mönster (UTC-middag) som resten av schema-/kapacitetsmodulerna. */
function datesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  let cursor = from
  let guard = 0
  const MAX_DAYS = 400 // rimligt tak, samma andemening som MAX_PERSON_SCHEDULE_RANGE_DAYS i tool-router.ts
  while (cursor <= to && guard <= MAX_DAYS) {
    dates.push(cursor)
    const next = new Date(`${cursor}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    cursor = next.toISOString().slice(0, 10)
    guard++
  }
  return dates
}

// ─────────────────────────────────────────────────────────────────
// computeFreeCapacity — ren beräkningskärna
// ─────────────────────────────────────────────────────────────────

/**
 * Beräknar ledig/bokningsbar kapacitet per person och dag för ett
 * datumintervall. Ren funktion — tar redan hämtade PersonDay[] (från
 * fetchPersonDays), ingen I/O. Facit-testas i tests/free-capacity.spec.ts.
 */
export function computeFreeCapacity(
  personDays: PersonDay[],
  memberIds: string[],
  dateRange: PersonDayRange,
  settings: FreeCapacitySettings = DEFAULT_FREE_CAPACITY_SETTINGS,
): FreeCapacityResult {
  const dates = datesInRange(dateRange.from, dateRange.to)

  const people: PersonFreeCapacity[] = memberIds.map((businessUserId) => {
    const days: PersonDayFreeCapacity[] = dates.map((date) => {
      const personDay = personDays.find((pd) => pd.businessUserId === businessUserId && pd.date === date)
      const isWeekend = isWeekendDate(date)
      const isAbsent = personDay?.isAbsent ?? false

      let freeHours = 0
      if (!isWeekend && !isAbsent) {
        const bookedHours = sumShiftHours(personDay?.shifts || [])
        freeHours = round2(Math.max(0, STANDARD_WORKDAY_HOURS - bookedHours))
      }
      const bookableHours = round2(
        Math.max(0, freeHours * settings.bookingCapPct - settings.emergencyReserveHours),
      )

      return { businessUserId, date, isWeekend, isAbsent, freeHours, bookableHours }
    })

    return {
      businessUserId,
      days,
      totalFreeHours: round2(days.reduce((sum, d) => sum + d.freeHours, 0)),
      totalBookableHours: round2(days.reduce((sum, d) => sum + d.bookableHours, 0)),
    }
  })

  const dayAggregates: DayFreeCapacityAggregate[] = dates.map((date) => {
    const isWeekend = isWeekendDate(date)
    let freeHours = 0
    let bookableHours = 0
    for (const person of people) {
      const d = person.days.find((x) => x.date === date)
      if (d) {
        freeHours += d.freeHours
        bookableHours += d.bookableHours
      }
    }
    return { date, isWeekend, freeHours: round2(freeHours), bookableHours: round2(bookableHours) }
  })

  return {
    range: dateRange,
    people,
    days: dayAggregates,
    totalFreeHours: round2(people.reduce((sum, p) => sum + p.totalFreeHours, 0)),
    totalBookableHours: round2(people.reduce((sum, p) => sum + p.totalBookableHours, 0)),
  }
}

// ─────────────────────────────────────────────────────────────────
// getFreeCapacity — I/O-wrapper
// ─────────────────────────────────────────────────────────────────

/**
 * Hämtar aktiva business_users + fetchPersonDays för ett datumintervall och
 * kör dem genom computeFreeCapacity.
 *
 * Kastar aldrig — DB-fel loggas och behandlas som "ingen ledig kapacitet
 * den här körningen" (tomt resultat), samma fail-safe-hållning som
 * fetchPersonDays (lib/schedule/person-day.ts) och getWeekCapacity
 * (lib/capacity/week-capacity.ts).
 */
export async function getFreeCapacity(
  supabase: SupabaseClient | any,
  businessId: string,
  from: string,
  to: string,
  settings: FreeCapacitySettings = DEFAULT_FREE_CAPACITY_SETTINGS,
): Promise<FreeCapacityResult> {
  const emptyResult: FreeCapacityResult = {
    range: { from, to },
    people: [],
    days: datesInRange(from, to).map((date) => ({
      date,
      isWeekend: isWeekendDate(date),
      freeHours: 0,
      bookableHours: 0,
    })),
    totalFreeHours: 0,
    totalBookableHours: 0,
  }

  if (!businessId) return emptyResult

  try {
    const { data: membersData, error: membersError } = await supabase
      .from('business_users')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)

    if (membersError) {
      console.error('[free-capacity] kunde inte hämta aktiva teammedlemmar:', businessId, membersError)
      return emptyResult
    }

    const memberIds: string[] = (membersData || []).map((m: any) => m.id)
    if (memberIds.length === 0) return emptyResult

    const personDays = await fetchPersonDays(supabase, businessId, memberIds, from, to)
    return computeFreeCapacity(personDays, memberIds, { from, to }, settings)
  } catch (err: any) {
    console.error('[free-capacity] getFreeCapacity misslyckades, degraderar till tomt resultat:', businessId, err?.message || String(err))
    return emptyResult
  }
}
