/**
 * Persondagen — "En dag, en sanning" (tasks/resurs-masterplan.md, R1).
 *
 * Före denna fil var en persons dag FRAGMENTERAD över två källor:
 * kundjobb i `booking` (assigned_user_id, scheduled_start/end) och allt
 * annat (internt/frånvaro/resa) i `schedule_entry` (business_user_id,
 * start_datetime/end_datetime). Ingen vy förenade dem — utilization-
 * heatmapen i schedule/page.tsx räknade t.ex. ENDAST schedule_entry och
 * missade kundbokningar helt.
 *
 * Denna modul är den enda sammanslagningskärnan. Två delar:
 *  - mergePersonDay: ren funktion, ingen I/O — facit-testas hårt
 *    (tests/person-day.spec.ts). Tar redan hämtade booking-/schedule_entry-
 *    rader och bygger per-person-per-dag-pass.
 *  - fetchPersonDays: I/O-wrappern som hämtar båda tabellerna för ett
 *    business + en uppsättning användare + ett datumintervall, och kör
 *    dem genom mergePersonDay.
 *
 * Regler (se filhuvudets kommentarer per funktion för detaljer):
 *  - `time_off`-pass (schedule_entry.type === 'time_off') markerar dagen
 *    som frånvaro (PersonDay.isAbsent) — men DÖLJER INTE krockande pass.
 *    De flaggas istället som conflict:true, precis som vilken annan
 *    överlappning som helst (frånvaro "vinner visuellt", men en bokning
 *    som smugit sig in på en frånvarodag ska synas och varnas för, inte
 *    tystas bort).
 *  - Överlappande pass (booking↔booking, booking↔schedule, schedule↔
 *    schedule) flaggas conflict:true på BÅDA parter. Halvöppet intervall
 *    ([start, end)) — pass som bara nuddar varandra (10:00–12:00 och
 *    12:00–14:00) räknas INTE som krock.
 *  - Heldagspass (allDay: true) spänner hela dagen i intervalltermer
 *    (schedule/page.tsx sätter redan 00:00:00–23:59:59 vid skapande), så
 *    de deltar i samma generiska överlappskontroll utan specialfall.
 *  - Bokningar utan assigned_user_id kan inte buckets:as till en person
 *    och hoppas över (ingen gissning om vem som utför jobbet).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svDateStr, svStartOfDay, svDateStrPlusDays } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────
// Typer
// ─────────────────────────────────────────────────────────────────

/** Delmängd av booking-kolumner som sammanslagningskärnan behöver. */
export interface BookingForPersonDay {
  booking_id: string
  assigned_user_id: string | null
  scheduled_start: string
  scheduled_end: string | null
  /** Fritext att visa som pass-titel — booking.notes (service_type
      persisteras inte separat, se app/api/bookings/route.ts där den
      slås ihop i notes vid skapande). */
  title?: string | null
  project_id?: string | null
  customer_id?: string | null
  /** 'cancelled' bokningar räknas inte in. */
  status?: string | null
}

/** Delmängd av schedule_entry-kolumner som sammanslagningskärnan behöver. */
export interface ScheduleEntryForPersonDay {
  id: string
  business_user_id: string
  project_id: string | null
  title: string
  start_datetime: string
  end_datetime: string
  all_day: boolean
  type: 'project' | 'internal' | 'time_off' | 'travel'
  /** 'cancelled' poster räknas inte in. */
  status: 'scheduled' | 'completed' | 'cancelled'
}

export type PersonDaySource = 'booking' | 'schedule'

export interface PersonDayShift {
  source: PersonDaySource
  /** 'booking' för kundjobb, annars schedule_entry.type. */
  type: string
  start: string
  end: string
  title: string
  refId: string
  projectId: string | null
  customerId: string | null
  allDay: boolean
  /** Sätts av mergePersonDay — true om passet tidsmässigt överlappar
      minst ett annat pass samma person/dag. */
  conflict: boolean
}

export interface PersonDay {
  businessUserId: string
  /** YYYY-MM-DD, svensk lokaldag (se lib/dates.ts). */
  date: string
  shifts: PersonDayShift[]
  /** true om något av dagens pass är type === 'time_off'. */
  isAbsent: boolean
}

export interface PersonDayRange {
  /** YYYY-MM-DD, inklusive. */
  from: string
  /** YYYY-MM-DD, inklusive. */
  to: string
}

// ─────────────────────────────────────────────────────────────────
// mergePersonDay — ren, facit-testbar sammanslagningskärna
// ─────────────────────────────────────────────────────────────────

export function mergePersonDay(
  bookings: BookingForPersonDay[],
  scheduleEntries: ScheduleEntryForPersonDay[],
  dateRange: PersonDayRange,
): PersonDay[] {
  const byKey = new Map<string, PersonDay>()

  function inRange(date: string): boolean {
    return date >= dateRange.from && date <= dateRange.to
  }

  function bucket(userId: string, date: string): PersonDay {
    const key = `${userId}::${date}`
    let day = byKey.get(key)
    if (!day) {
      day = { businessUserId: userId, date, shifts: [], isAbsent: false }
      byKey.set(key, day)
    }
    return day
  }

  for (const b of bookings) {
    if (!b.assigned_user_id) continue
    if (b.status === 'cancelled') continue
    if (!b.scheduled_start) continue
    const end = b.scheduled_end || b.scheduled_start
    const date = svDateStr(new Date(b.scheduled_start))
    if (!inRange(date)) continue

    bucket(b.assigned_user_id, date).shifts.push({
      source: 'booking',
      type: 'booking',
      start: b.scheduled_start,
      end,
      title: (b.title && b.title.trim()) || 'Bokning',
      refId: b.booking_id,
      projectId: b.project_id ?? null,
      customerId: b.customer_id ?? null,
      allDay: false,
      conflict: false,
    })
  }

  for (const e of scheduleEntries) {
    if (e.status === 'cancelled') continue
    if (!e.start_datetime) continue
    const date = svDateStr(new Date(e.start_datetime))
    if (!inRange(date)) continue

    bucket(e.business_user_id, date).shifts.push({
      source: 'schedule',
      type: e.type,
      start: e.start_datetime,
      end: e.end_datetime,
      title: e.title,
      refId: e.id,
      projectId: e.project_id ?? null,
      customerId: null,
      allDay: e.all_day,
      conflict: false,
    })
  }

  const days = Array.from(byKey.values())
  for (const day of days) {
    day.shifts.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    day.isAbsent = day.shifts.some(s => s.type === 'time_off')
    flagConflicts(day.shifts)
  }

  days.sort((a, b) => (a.date === b.date ? a.businessUserId.localeCompare(b.businessUserId) : a.date.localeCompare(b.date)))
  return days
}

/** Flaggar conflict:true på båda parter för varje par av tidsmässigt
    överlappande pass i listan. Muterar shifts-objekten på plats. */
function flagConflicts(shifts: PersonDayShift[]): void {
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (overlaps(shifts[i], shifts[j])) {
        shifts[i].conflict = true
        shifts[j].conflict = true
      }
    }
  }
}

/** Halvöppet intervall — pass som bara nuddar varandra krockar inte. */
function overlaps(a: PersonDayShift, b: PersonDayShift): boolean {
  const aStart = new Date(a.start).getTime()
  const aEnd = new Date(a.end).getTime()
  const bStart = new Date(b.start).getTime()
  const bEnd = new Date(b.end).getTime()
  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || !Number.isFinite(bStart) || !Number.isFinite(bEnd)) return false
  return aStart < bEnd && bStart < aEnd
}

// ─────────────────────────────────────────────────────────────────
// fetchPersonDays — I/O-wrapper
// ─────────────────────────────────────────────────────────────────

/**
 * Hämtar booking + schedule_entry för ett business, en uppsättning
 * användare och ett datumintervall, och kör dem genom mergePersonDay.
 *
 * Kastar aldrig — DB-fel loggas och behandlas som "inga pass" för den
 * tabellen (samma fail-safe-hållning som lib/egenkontroll/*), så en
 * trasig delfråga inte kraschar hela vyn (t.ex. schedule/page.tsx
 * utilization-läget som konsumerar detta).
 */
export async function fetchPersonDays(
  supabase: SupabaseClient | any,
  businessId: string,
  userIds: string[],
  from: string,
  to: string,
): Promise<PersonDay[]> {
  if (!businessId || userIds.length === 0) return []

  // Samma svensk-lokaldag-säkra intervallmönster som
  // lib/egenkontroll/suggest-time-entry.ts: rangeStart = from 00:00
  // svensk tid, rangeEnd = dagen EFTER `to` 00:00 svensk tid (exklusiv
  // övre gräns) — robust över DST-gränser.
  const rangeStart = svStartOfDay(new Date(`${from}T12:00:00Z`))
  const dayAfterTo = svDateStrPlusDays(1, new Date(`${to}T12:00:00Z`))
  const rangeEnd = svStartOfDay(new Date(`${dayAfterTo}T12:00:00Z`))

  const [bookingRes, scheduleRes] = await Promise.all([
    supabase
      .from('booking')
      .select('booking_id, assigned_user_id, scheduled_start, scheduled_end, notes, project_id, customer_id, status')
      .eq('business_id', businessId)
      .in('assigned_user_id', userIds)
      .neq('status', 'cancelled')
      .gte('scheduled_start', rangeStart.toISOString())
      .lt('scheduled_start', rangeEnd.toISOString()),
    supabase
      .from('schedule_entry')
      .select('id, business_user_id, project_id, title, start_datetime, end_datetime, all_day, type, status')
      .eq('business_id', businessId)
      .in('business_user_id', userIds)
      .neq('status', 'cancelled')
      .gte('start_datetime', rangeStart.toISOString())
      .lt('start_datetime', rangeEnd.toISOString()),
  ])

  if (bookingRes.error) {
    console.error('[person-day] kunde inte hämta bokningar:', bookingRes.error)
  }
  if (scheduleRes.error) {
    console.error('[person-day] kunde inte hämta schedule_entry:', scheduleRes.error)
  }

  const bookingRows: BookingForPersonDay[] = (bookingRes.data || []).map((b: any) => ({
    booking_id: b.booking_id,
    assigned_user_id: b.assigned_user_id,
    scheduled_start: b.scheduled_start,
    scheduled_end: b.scheduled_end,
    title: b.notes,
    project_id: b.project_id,
    customer_id: b.customer_id,
    status: b.status,
  }))

  const scheduleRows: ScheduleEntryForPersonDay[] = (scheduleRes.data || []) as ScheduleEntryForPersonDay[]

  return mergePersonDay(bookingRows, scheduleRows, { from, to })
}
