/**
 * Publik self-bokning — tillgänglighetsberäkning (ren logik, testbar).
 *
 * Arbetstider lagras som lokal svensk tid ("08:00") i business_config.working_hours.
 * Bokningar lagras som TIMESTAMPTZ. Vi räknar allt i epoch-ms för korrekt
 * överlappskontroll oavsett serverns tidszon (Vercel kör UTC).
 */

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export interface WorkingDay { active: boolean; start: string; end: string }
export type WorkingHours = Record<string, WorkingDay>

/** UTC-offset (minuter) för en tidszon på ett givet datum — robust oavsett server-TZ. */
export function tzOffsetMinutes(dateStr: string, tz = 'Europe/Stockholm'): number {
  const d = new Date(`${dateStr}T12:00:00Z`)
  const tzStr = d.toLocaleString('en-US', { timeZone: tz, hour12: false })
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC', hour12: false })
  return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000)
}

/** Bygg ISO-tidsstämpel (UTC) från lokalt svenskt datum + "HH:MM". DST-korrekt. */
export function stockholmLocalToISO(dateStr: string, timeStr: string): string {
  const off = tzOffsetMinutes(dateStr)
  const [h, m] = timeStr.split(':').map(Number)
  const epoch = Date.parse(`${dateStr}T00:00:00Z`) + ((h * 60 + (m || 0)) - off) * 60000
  return new Date(epoch).toISOString()
}

export function workingDayFor(hours: WorkingHours | null | undefined, dateStr: string): WorkingDay | null {
  if (!hours) return null
  const day = WEEKDAY_KEYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()]
  const wd = hours[day]
  return wd && wd.active ? wd : null
}

export interface Slot { time: string; startISO: string; endISO: string }

/**
 * Generera lediga slots för ett datum.
 * @param bookings befintliga bokningar (scheduled_start/end ISO) — ej cancelled.
 * @param now epoch-ms (slots i det förflutna filtreras bort).
 * @param stepMin slot-intervall (default = duration).
 */
export function computeAvailableSlots(opts: {
  hours: WorkingHours | null | undefined
  dateStr: string
  durationMin: number
  bookings: { scheduled_start: string; scheduled_end: string | null }[]
  now?: number
  stepMin?: number
}): Slot[] {
  const { hours, dateStr, durationMin, bookings } = opts
  const now = opts.now ?? Date.now()
  const step = opts.stepMin || durationMin
  const wd = workingDayFor(hours, dateStr)
  if (!wd) return []

  const [sh, sm] = wd.start.split(':').map(Number)
  const [eh, em] = wd.end.split(':').map(Number)
  const dayStartMin = sh * 60 + (sm || 0)
  const dayEndMin = eh * 60 + (em || 0)

  // Boknings-intervall i epoch-ms.
  const busy = bookings.map(b => {
    const start = Date.parse(b.scheduled_start)
    const end = b.scheduled_end ? Date.parse(b.scheduled_end) : start + 60 * 60000
    return { start, end }
  })

  const slots: Slot[] = []
  for (let t = dayStartMin; t + durationMin <= dayEndMin; t += step) {
    const hh = String(Math.floor(t / 60)).padStart(2, '0')
    const mm = String(t % 60).padStart(2, '0')
    const time = `${hh}:${mm}`
    const startISO = stockholmLocalToISO(dateStr, time)
    const startEpoch = Date.parse(startISO)
    const endEpoch = startEpoch + durationMin * 60000
    if (startEpoch < now) continue // inte i det förflutna
    const overlaps = busy.some(b => startEpoch < b.end && endEpoch > b.start)
    if (overlaps) continue
    slots.push({ time, startISO, endISO: new Date(endEpoch).toISOString() })
  }
  return slots
}
