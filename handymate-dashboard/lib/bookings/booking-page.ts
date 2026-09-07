/**
 * Bokningssidan (/site/[slug]/boka) — ren logik utan React och utan DB.
 *
 * Yta 5 i varumärkeslagret (Design "Bokning.dc.html", 2026-09-07). Sidan
 * bär hantverkarens varumärke och säger ärligt vad kunden bokar: ett besök
 * på en timme, inte ett arbete. Allt som går att räkna ut utan webbläsare
 * ligger här så facit (tests/bokningsflodet.spec.ts) kan låsa det:
 *
 *  - accentrampen (accent → a50/a100/a700 + kontrastfärg på accentyta)
 *  - svenska datumsträngar ("Tisdag 15 september kl 09:00–10:00")
 *  - veckogruppering av dagarna API:t ger (ISO-vecka, mån–sön)
 *  - sammanfattning av arbetstiderna ("mån–fre 07–16")
 *  - ICS-filen bakom "Lägg i kalendern"
 *
 * Datum hanteras som "YYYY-MM-DD" (svensk lokal dag). Vi tolkar dem som
 * UTC-middag när vi behöver en Date — veckodag och datumdelar blir då
 * rätt oavsett var klienten står.
 */
import { isWorkingDayActive, type Slot, type WorkingHours } from './availability'

/** Hur långt fram kunden får boka — "närmaste två veckorna" i designen. */
export const BOOKING_WINDOW_DAYS = 14
/** Besöket är alltid en timme; ingen tjänstelista, inget val av längd. */
export const VISIT_DURATION_MIN = 60

// ── Accentrampen ─────────────────────────────────────────────────────────

/** Accentfärgen sidan faller tillbaka på — amber, ALDRIG Handymate-teal. */
export const BOOKING_DEFAULT_ACCENT = '#F59E0B'

export interface AccentRamp {
  accent: string
  /** Bakgrund bakom stegnummer och vald-tid-raden. */
  a50: string
  /** Kant runt vald-tid-raden. */
  a100: string
  /** Text/ikon på a50 — firmans mörka ton, aldrig själva accenten. */
  a700: string
  /** Textfärg ovanpå accenten (vald dag/tid, initialrutan). */
  onAccent: string
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function mix(hex: string, to: string, t: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(to)
  return (
    '#' +
    a
      .map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Relativ luminans (WCAG) 0–1. */
export function luminance(hex: string): number {
  const c = hexToRgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export function accentRamp(hexInput: string | null | undefined): AccentRamp {
  const hex = /^#[0-9a-fA-F]{6}$/.test((hexInput ?? '').trim()) ? (hexInput as string).trim() : BOOKING_DEFAULT_ACCENT
  return {
    accent: hex,
    a50: mix(hex, '#ffffff', 0.9),
    a100: mix(hex, '#ffffff', 0.78),
    a700: mix(hex, '#000000', 0.35),
    onAccent: luminance(hex) > 0.4 ? '#0F172A' : '#ffffff',
  }
}

// ── Svenska datum ────────────────────────────────────────────────────────

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]
/** Mån–sön i den ordning chipsen visas. */
export const WEEKDAY_ORDER: WeekdayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export const WEEKDAY_SHORT: Record<WeekdayKey, string> = {
  monday: 'mån', tuesday: 'tis', wednesday: 'ons', thursday: 'tor', friday: 'fre', saturday: 'lör', sunday: 'sön',
}
export const WEEKDAY_LONG: Record<WeekdayKey, string> = {
  monday: 'måndag', tuesday: 'tisdag', wednesday: 'onsdag', thursday: 'torsdag', friday: 'fredag', saturday: 'lördag', sunday: 'söndag',
}
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MONTH_LONG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function parts(dateStr: string): { y: number; m: number; d: number; weekday: WeekdayKey } {
  const dt = new Date(`${dateStr}T12:00:00Z`)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), weekday: WEEKDAY_KEYS[dt.getUTCDay()] }
}

export function weekdayOf(dateStr: string): WeekdayKey {
  return parts(dateStr).weekday
}

/** "YYYY-MM-DD" + n dagar. */
export function addDays(dateStr: string, n: number): string {
  const dt = new Date(`${dateStr}T12:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/** Dagens datum i svensk tid som "YYYY-MM-DD". */
export function todayInStockholm(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "15 sep" */
export function dayShort(dateStr: string): string {
  const p = parts(dateStr)
  return `${p.d} ${MONTH_SHORT[p.m]}`
}

/** "tisdag 15 sep" — dagraden under chipsen. */
export function dayLabel(dateStr: string): string {
  const p = parts(dateStr)
  return `${WEEKDAY_LONG[p.weekday]} ${p.d} ${MONTH_SHORT[p.m]}`
}

/** "09:00" + 60 min → "10:00". */
export function endTime(time: string, durationMin: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + (m || 0) + durationMin
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** "tis 15 sep kl 09:00–10:00" — vald-tid-raden och desktop-knappen. */
export function whenShort(dateStr: string, time: string, durationMin: number): string {
  const p = parts(dateStr)
  return `${WEEKDAY_SHORT[p.weekday]} ${p.d} ${MONTH_SHORT[p.m]} kl ${time}–${endTime(time, durationMin)}`
}

/** "Tisdag 15 september kl 09:00–10:00" — bekräftelsen. */
export function whenLong(dateStr: string, time: string, durationMin: number): string {
  const p = parts(dateStr)
  return `${capitalize(WEEKDAY_LONG[p.weekday])} ${p.d} ${MONTH_LONG[p.m]} kl ${time}–${endTime(time, durationMin)}`
}

/** ISO-veckonummer (måndag först). */
export function isoWeek(dateStr: string): number {
  const dt = new Date(`${dateStr}T12:00:00Z`)
  const day = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1)
  return Math.ceil(((dt.getTime() - yearStart) / 86400000 + 1) / 7)
}

/** Måndagen i den vecka datumet ligger i. */
export function mondayOf(dateStr: string): string {
  const dt = new Date(`${dateStr}T12:00:00Z`)
  const day = dt.getUTCDay() || 7
  return addDays(dateStr, 1 - day)
}

// ── Arbetstiderna ────────────────────────────────────────────────────────

/** Veckodagar med aktiv arbetstid, i mån–sön-ordning. */
export function activeWeekdays(hours: WorkingHours | null | undefined): WeekdayKey[] {
  if (!hours) return []
  return WEEKDAY_ORDER.filter((k) => isWorkingDayActive(hours[k]))
}

function hourOnly(t: string): string {
  const [h, m] = t.split(':')
  return m && m !== '00' ? `${h}:${m}` : h
}

/**
 * "mån–fre 07–16" när alla aktiva dagar följer varandra och har samma tider,
 * annars per grupp: "mån–tor 07–16, fre 07–12". Tom sträng utan arbetstid.
 */
export function hoursSummary(hours: WorkingHours | null | undefined): string {
  const days = activeWeekdays(hours)
  if (!days.length || !hours) return ''
  const groups: { from: WeekdayKey; to: WeekdayKey; start: string; end: string }[] = []
  for (const k of days) {
    const wd = hours[k]
    const last = groups[groups.length - 1]
    const consecutive = last && WEEKDAY_ORDER.indexOf(k) === WEEKDAY_ORDER.indexOf(last.to) + 1
    if (last && consecutive && last.start === wd.start && last.end === wd.end) {
      last.to = k
    } else {
      groups.push({ from: k, to: k, start: wd.start, end: wd.end })
    }
  }
  return groups
    .map((g) => {
      const span = g.from === g.to ? WEEKDAY_SHORT[g.from] : `${WEEKDAY_SHORT[g.from]}–${WEEKDAY_SHORT[g.to]}`
      return `${span} ${hourOnly(g.start)}–${hourOnly(g.end)}`
    })
    .join(', ')
}

// ── Veckorna i väljaren ──────────────────────────────────────────────────

export interface BookingDay {
  date: string
  slots: Slot[]
}

export interface WeekCell {
  /** Saknas när kolumnen ligger utanför de dagar API:t gav (före idag / efter fönstret). */
  date: string | null
  weekday: WeekdayKey
  slotCount: number
}

export interface BookingWeek {
  monday: string
  weekNumber: number
  /** "Vecka 38 · 14–18 sep" */
  label: string
  cells: WeekCell[]
}

/**
 * Grupperar API:ts dagar i ISO-veckor med EN kolumn per aktiv veckodag,
 * så chipsen står stilla när kunden bläddrar. Dagar utanför fönstret blir
 * tomma celler (visas nedtonade), dagar utan lediga tider får slotCount 0.
 * Veckor helt utan tider behålls — kunden ska se att veckan är full, inte
 * att den saknas.
 */
export function groupWeeks(days: BookingDay[], columns: WeekdayKey[]): BookingWeek[] {
  if (!days.length || !columns.length) return []
  const byDate = new Map(days.map((d) => [d.date, d]))
  const first = mondayOf(days[0].date)
  const last = mondayOf(days[days.length - 1].date)
  const weeks: BookingWeek[] = []
  for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
    const cells: WeekCell[] = columns.map((weekday) => {
      const date = addDays(monday, WEEKDAY_ORDER.indexOf(weekday))
      const day = byDate.get(date)
      return { date: day ? date : null, weekday, slotCount: day ? day.slots.length : 0 }
    })
    const shown = cells.filter((c) => c.date)
    if (shown.length === 0) continue
    const from = parts(addDays(monday, WEEKDAY_ORDER.indexOf(columns[0])))
    const to = addDays(monday, WEEKDAY_ORDER.indexOf(columns[columns.length - 1]))
    // "14–18 sep" inom samma månad, "28 sep–2 okt" över ett månadsskifte.
    const span = from.m === parts(to).m ? `${from.d}–${dayShort(to)}` : `${dayShort(addDays(monday, WEEKDAY_ORDER.indexOf(columns[0])))}–${dayShort(to)}`
    weeks.push({ monday, weekNumber: isoWeek(monday), label: `Vecka ${isoWeek(monday)} · ${span}`, cells })
  }
  return weeks
}

/** Första dagen med lediga tider efter `after` (eller första över huvud taget). */
export function nextFreeDay(days: BookingDay[], after?: string | null): BookingDay | null {
  for (const d of days) {
    if (after && d.date <= after) continue
    if (d.slots.length) return d
  }
  return null
}

// ── ICS ──────────────────────────────────────────────────────────────────

function icsStamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * "Lägg i kalendern" — genereras i klienten, ingen route. UTC-tider med Z
 * så kalenderprogrammet själv lägger dem i rätt tidszon.
 */
export function buildVisitIcs(input: {
  uid: string
  startISO: string
  endISO: string
  businessName: string
  phone?: string | null
  now?: Date
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Handymate//Bokning//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(input.uid)}@handymate.se`,
    `DTSTAMP:${icsStamp((input.now ?? new Date()).toISOString())}`,
    `DTSTART:${icsStamp(input.startISO)}`,
    `DTEND:${icsStamp(input.endISO)}`,
    `SUMMARY:${icsEscape(`Besök av ${input.businessName}`)}`,
    `DESCRIPTION:${icsEscape(
      `${input.businessName} kommer och tittar på jobbet. Räkna med ungefär en timme.` +
        (input.phone ? ` Behöver du ändra tiden, ring ${input.phone}.` : ''),
    )}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}
