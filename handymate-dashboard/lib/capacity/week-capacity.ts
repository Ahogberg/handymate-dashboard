/**
 * Kapacitet-primitiv v1 (ServiceTitan Max-analysen, medvetet FÖRENKLAD för
 * 1–5-mannalag).
 *
 * ETT tal varje kanal kan läsa: ledig kapacitet = tillhandahållna timmar
 * minus bokade timmar, per VECKA. Inga zoner, inga skills — det är
 * enterprise-komplexitet som inte är relevant för lag i den här storleken.
 *
 * Booking-cap: "boka max X % av veckan, spara resten till akutjobb"
 * (default 80 %) — förhindrar att hela veckan bokas full utan buffert.
 *
 * Framtida konsumenter: Hannas "tunn vecka"-trigger för uppsökande
 * kontakt (nästa steg), Röst-Lisas bokningslogik (senare).
 *
 * Design-regel från ST Max-analysen: orealistiska default-jobblängder ger
 * tyst överbokning. Bokningar utan scheduled_end använder därför en
 * KONFIGURERBAR default-längd (defaultBookingHours), inte ett hårdkodat
 * antagande.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svDateStr, svDateStrPlusDays, svStartOfDay } from '@/lib/dates'
import { getBusinessPreferences } from '@/lib/business-preferences'

// ─────────────────────────────────────────────────────────────────
// Konstanter
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_BOOKING_CAP_PCT = 80
export const DEFAULT_BOOKING_HOURS = 2
/** Gissning när ingen inställning finns: 40 h/vecka per aktiv teammedlem. */
export const FALLBACK_HOURS_PER_MEMBER = 40
/** Under denna beläggning räknas veckan som "tunn" (Hannas framtida trigger). */
const THIN_WEEK_UTILIZATION_THRESHOLD = 40

const EXCLUDED_STATUSES = new Set(['cancelled', 'no_show'])

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export interface WeekCapacityBookingInput {
  scheduled_start: string
  scheduled_end: string | null
  status: string
}

export interface WeekCapacityInput {
  /** YYYY-MM-DD (måndag, svensk lokaltid). */
  weekStart: string
  /** null = okonfigurerat — ingen gissning görs i den rena funktionen. */
  providedHoursPerWeek: number | null
  /** Boka max X % av veckan — resten reserveras för akutjobb. Default 80. */
  bookingCapPct: number
  /** Antagen längd (h) för bokningar utan scheduled_end. Default 2. */
  defaultBookingHours: number
  bookings: WeekCapacityBookingInput[]
}

export interface WeekCapacity {
  week_start: string
  /** null om okonfigurerat → alla övriga beräknade fält blir null också. */
  provided_hours: number | null
  booked_hours: number
  /** max(0, provided_hours × cap% − booked_hours). Null om okonfigurerat. */
  open_hours: number | null
  /** booked / (provided × cap%), i procent. Kan överstiga 100 (överbokad vecka). */
  utilization_pct: number | null
  /** utilization_pct < 40. Null om okonfigurerat. */
  thin_week: boolean | null
  /** True endast om provided_hours kommer från en verklig inställning. */
  configured: boolean
  /**
   * 'settings' = verklig inställning i business_preferences.
   * 'fallback' = gissning (40h × aktiva teammedlemmar) — ren beräkningsfunktion
   * vet inte vilket, den rena funktionen sätter alltid 'settings'; det är
   * fetch-wrappern (getWeekCapacity) som avgör och skriver över värdet.
   */
  source: 'settings' | 'fallback'
}

// ─────────────────────────────────────────────────────────────────
// Datum-hjälpare (kalenderdag-aritmetik, återanvänder lib/dates.ts)
// ─────────────────────────────────────────────────────────────────

/**
 * "Säker ankare"-tidpunkt för en kalenderdag-sträng: UTC-middag samma dag.
 * Stockholm ligger som mest +2h före UTC, så UTC-middag hamnar alltid på
 * samma kalenderdag i svensk lokaltid — vi undviker därmed midnattsfällan
 * (se lib/dates.ts-kommentarerna) utan att behöva känna till DST-offsetet.
 */
function safeAnchor(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`)
}

/**
 * Måndagen i samma vecka som ett givet YYYY-MM-DD-datum.
 *
 * Veckodag är en egenskap hos KALENDERDATUMET, inte hos klockslag eller
 * tidszon (måndag är måndag oavsett timme) — så getUTCDay() på ankaret ger
 * rätt veckodag direkt, ingen Stockholm-konvertering behövs för det steget.
 * Själva förskjutningen görs sedan med svDateStrPlusDays för att hålla all
 * kalenderdag-aritmetik i en och samma, redan verifierade, DST-säkra modul.
 */
export function mondayOfWeek(dateStr: string): string {
  const anchor = safeAnchor(dateStr)
  const dow = anchor.getUTCDay() // 0=söndag..6=lördag
  const daysSinceMonday = (dow + 6) % 7 // måndag=0, tisdag=1, ..., söndag=6
  return svDateStrPlusDays(-daysSinceMonday, anchor)
}

/** Innevarande veckas måndag, svensk lokaltid. */
export function currentWeekMonday(): string {
  return mondayOfWeek(svDateStr())
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─────────────────────────────────────────────────────────────────
// Del 1 — Ren beräkning
// ─────────────────────────────────────────────────────────────────

export function computeWeekCapacity(input: WeekCapacityInput): WeekCapacity {
  const { weekStart, providedHoursPerWeek, bookingCapPct, defaultBookingHours, bookings } = input

  // Veckofönstret som faktiska tidpunkter (instants), inte bara datumsträngar
  // — nödvändigt för att klippa bokningar som spänner över veckogränsen
  // korrekt, oavsett vilken tidszon scheduled_start/scheduled_end är lagrade i.
  const weekEndExclusiveStr = svDateStrPlusDays(7, safeAnchor(weekStart))
  const weekStartInstant = svStartOfDay(safeAnchor(weekStart)).getTime()
  const weekEndInstant = svStartOfDay(safeAnchor(weekEndExclusiveStr)).getTime()

  // ── Bokade timmar ──────────────────────────────────────────────
  let bookedHours = 0
  for (const b of bookings) {
    if (EXCLUDED_STATUSES.has(b.status)) continue

    const startMs = new Date(b.scheduled_start).getTime()
    if (Number.isNaN(startMs)) continue

    let endMs: number
    if (b.scheduled_end) {
      const parsedEnd = new Date(b.scheduled_end).getTime()
      // Ogiltig scheduled_end → falla tillbaka på default-längden hellre än
      // att tappa bokningen helt (samma andemening som defaultBookingHours).
      endMs = Number.isNaN(parsedEnd) ? startMs + defaultBookingHours * 3_600_000 : parsedEnd
    } else {
      endMs = startMs + defaultBookingHours * 3_600_000
    }
    if (endMs <= startMs) continue // noll/negativ längd — räknas inte

    // Klipp till veckofönstret — en bokning som börjar fredag kväll och
    // slutar lördag i nästa vecka ska bara bidra med timmarna INOM veckan.
    const clippedStart = Math.max(startMs, weekStartInstant)
    const clippedEnd = Math.min(endMs, weekEndInstant)
    if (clippedEnd > clippedStart) {
      bookedHours += (clippedEnd - clippedStart) / 3_600_000
    }
  }
  bookedHours = round1(bookedHours)

  // ── Tillhandahållna timmar / öppen kapacitet ─────────────────────
  const configured = providedHoursPerWeek != null
  const providedHours = configured ? round1(providedHoursPerWeek as number) : null

  let openHours: number | null = null
  let utilizationPct: number | null = null
  let thinWeek: boolean | null = null

  if (configured) {
    const capHours = (providedHoursPerWeek as number) * (bookingCapPct / 100)
    openHours = round1(Math.max(0, capHours - bookedHours))
    // Guard mot division med 0 (t.ex. providedHoursPerWeek=0 eller cap%=0).
    utilizationPct = capHours > 0 ? Math.round((bookedHours / capHours) * 100) : null
    thinWeek = utilizationPct != null ? utilizationPct < THIN_WEEK_UTILIZATION_THRESHOLD : null
  }

  return {
    week_start: weekStart,
    provided_hours: providedHours,
    booked_hours: bookedHours,
    open_hours: openHours,
    utilization_pct: utilizationPct,
    thin_week: thinWeek,
    configured,
    source: 'settings',
  }
}

// ─────────────────────────────────────────────────────────────────
// Del 2 — Fetch-wrapper
// ─────────────────────────────────────────────────────────────────

interface CapacitySettings {
  provided_hours_per_week?: number
  booking_cap_pct?: number
  default_booking_hours?: number
}

/**
 * Hämtar och beräknar kapacitet för en given vecka.
 *
 * Inställningar läses från business_preferences (key='capacity_settings',
 * JSON i value-kolumnen) — samma key-value-tabell som t.ex.
 * morning_report_latest använder (se app/dashboard/page.tsx). Ingen ny
 * schema-migrering behövs.
 *
 * Om inställningen saknas görs en GISSNING (40h × antal aktiva
 * teammedlemmar) så att kapacitetstalen ändå går att räkna fram — men
 * `configured` sätts till false och `source` till 'fallback' så att
 * konsumenter (UI, Hanna, Röst-Lisa) kan skilja en verklig inställning
 * från en gissning istället för att av misstag lita blint på gissningen.
 */
export async function getWeekCapacity(
  supabase: SupabaseClient,
  businessId: string,
  weekStart: string,
): Promise<WeekCapacity> {
  // ── 1. Inställningar ────────────────────────────────────────────
  const prefs = await getBusinessPreferences(businessId)
  let settings: CapacitySettings = {}
  if (prefs.capacity_settings) {
    try {
      settings = JSON.parse(prefs.capacity_settings)
    } catch {
      settings = {}
    }
  }

  let providedHoursPerWeek: number | null =
    typeof settings.provided_hours_per_week === 'number' ? settings.provided_hours_per_week : null
  let source: 'settings' | 'fallback' = providedHoursPerWeek != null ? 'settings' : 'fallback'

  if (providedHoursPerWeek == null) {
    const { count } = await supabase
      .from('business_users')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
    const activeMembers = count ?? 0
    // Fortfarande null om det inte finns några aktiva teammedlemmar heller
    // — då finns det inget rimligt tal alls att gissa fram.
    providedHoursPerWeek = activeMembers > 0 ? activeMembers * FALLBACK_HOURS_PER_MEMBER : null
  }

  const bookingCapPct =
    typeof settings.booking_cap_pct === 'number' ? settings.booking_cap_pct : DEFAULT_BOOKING_CAP_PCT
  const defaultBookingHours =
    typeof settings.default_booking_hours === 'number'
      ? settings.default_booking_hours
      : DEFAULT_BOOKING_HOURS

  // ── 2. Bokningar i veckofönstret ────────────────────────────────
  const weekEndExclusive = svDateStrPlusDays(7, safeAnchor(weekStart))

  const { data: bookingsData, error: bookingsError } = await supabase
    .from('booking')
    .select('scheduled_start, scheduled_end, status')
    .eq('business_id', businessId)
    .gte('scheduled_start', weekStart)
    .lt('scheduled_start', weekEndExclusive)

  if (bookingsError) {
    console.warn('[week-capacity] kunde inte hämta bokningar', { businessId, weekStart, error: bookingsError })
  }

  const bookings = (bookingsData || []) as WeekCapacityBookingInput[]

  // ── 3. Beräkna ───────────────────────────────────────────────────
  const result = computeWeekCapacity({
    weekStart,
    providedHoursPerWeek,
    bookingCapPct,
    defaultBookingHours,
    bookings,
  })

  // Skriv över configured/source med den verkliga proveniensen — den rena
  // funktionen känner bara till "finns ett tal eller inte", inte om talet
  // var en riktig inställning eller en gissning.
  return {
    ...result,
    configured: source === 'settings',
    source,
  }
}
