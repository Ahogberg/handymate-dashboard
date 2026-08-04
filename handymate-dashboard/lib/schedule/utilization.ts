/**
 * Beläggningsberäkningen för resurstavlan (R2, tasks/resurs-masterplan.md,
 * punkt 2). Extraherad ur app/dashboard/schedule/page.tsx:s
 * utilizationData-memo (R1) till en ren, testbar funktion — SAMMA formel,
 * ingen ändrad affärslogik, bara flyttad hit så den kan facit-testas och
 * återanvändas av resurstavlan (personrader) och mobilvyn.
 *
 *   beläggning % = summa passtimmar (arbetsdagar) / (antal ARBETSDAGAR
 *   (mån-fre) i intervallet × 8h-schablonen)
 *
 * STANDARD_WORKDAY_HOURS (8h) är en dokumenterad schablon-konstant — ingen
 * individuell arbetstidsprocent per person än (det är ett R5-ämne,
 * kapacitet-fyllnad per person, se masterplanen).
 *
 * Två medvetna arv från R1-heatmapen som INTE ändras här (samma beteende,
 * bara flyttat):
 *  - Helger (lör/sön) räknas bort UR BÅDE täljare och nämnare — ett pass
 *    som ligger på en lördag bidrar inte till veckans beläggnings-%.
 *  - Frånvarodagar (isAbsent) räknas INTE bort ur nämnaren. En hel
 *    semestervecka visar alltså 0% "beläggning" snarare än att exkluderas
 *    helt ur beräkningen. Det är R1:s befintliga beteende — ändra bara i
 *    en egen sprint om produktbeslutet blir att skilja "ledig" från "0%
 *    beläggd" (t.ex. genom att exkludera isAbsent-dagar ur workdayCount).
 */

import type { PersonDay } from './person-day'

/** Schablon-konstanten som beläggningsberäkningen (och R1-heatmapen) bygger på. */
export const STANDARD_WORKDAY_HOURS = 8

export interface UtilizationDay {
  /** YYYY-MM-DD */
  date: string
  /** Summerade passtimmar denna dag (heldagspass räknas som STANDARD_WORKDAY_HOURS). */
  hours: number
  isWeekend: boolean
  isAbsent: boolean
}

export interface PersonWeekUtilization {
  businessUserId: string
  days: UtilizationDay[]
  /** Summan av hours för arbetsdagar (helger exkluderade), se filhuvudet. */
  totalHours: number
  /** Antal arbetsdagar (mån-fre) i det givna datumintervallet. */
  workdayCount: number
  /** 0-100+. Kan i teorin överstiga 100 om en dag har fler passtimmar än 8h. */
  utilizationPct: number
}

/** Veckodag via Intl-oberoende UTC-ankring vid middag — vi behöver bara
 * VILKEN veckodag datumet är, inte klockslaget, så DST spelar ingen roll
 * (samma ankringsmönster som fetchPersonDays i person-day.ts). */
function isWeekendDate(date: string): boolean {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

/**
 * Beräknar en persons beläggning för en uppsättning datum (normalt en
 * mån-sön-vecka, men fungerar för vilket datumintervall som helst).
 *
 * Ren funktion — tar redan hämtade PersonDay[] (från fetchPersonDays),
 * ingen I/O. Facit-testas i tests/schedule-utilization.spec.ts.
 */
export function computePersonWeekUtilization(
  personDays: PersonDay[],
  businessUserId: string,
  weekDates: string[],
): PersonWeekUtilization {
  const days: UtilizationDay[] = weekDates.map((date) => {
    const personDay = personDays.find((pd) => pd.businessUserId === businessUserId && pd.date === date)
    const shifts = personDay?.shifts || []

    let hours = 0
    for (const s of shifts) {
      if (s.allDay) {
        hours += STANDARD_WORKDAY_HOURS
      } else {
        const ms = new Date(s.end).getTime() - new Date(s.start).getTime()
        if (Number.isFinite(ms) && ms > 0) hours += ms / 3_600_000
      }
    }

    return {
      date,
      hours,
      isWeekend: isWeekendDate(date),
      isAbsent: personDay?.isAbsent ?? false,
    }
  })

  const workdays = days.filter((d) => !d.isWeekend)
  const totalHours = workdays.reduce((sum, d) => sum + d.hours, 0)
  const workdayCount = workdays.length
  const utilizationPct = workdayCount > 0 ? (totalHours / (workdayCount * STANDARD_WORKDAY_HOURS)) * 100 : 0

  return { businessUserId, days, totalHours, workdayCount, utilizationPct }
}

/** Samma tröskelfärger som R1-heatmapen (schedule/page.tsx getUtilColor/
 * getUtilTextColor) — <50% grön, <80% amber, annars röd. Ren UI-hjälpare,
 * ingen affärslogik, därför inte facit-testad. */
export function utilizationColorClasses(pct: number): { bar: string; text: string } {
  if (pct < 50) return { bar: 'bg-emerald-500', text: 'text-emerald-600' }
  if (pct < 80) return { bar: 'bg-amber-500', text: 'text-amber-600' }
  return { bar: 'bg-red-500', text: 'text-red-600' }
}
