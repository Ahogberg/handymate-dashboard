/**
 * Facit: bokningsflödet i hantverkarens varumärke (yta 5, 2026-09-07).
 *
 *   /site/[slug]/boka + GET /api/public/booking-page/[slug] + lib/bookings/booking-page
 *
 * Det som får sidan att hålla över tid:
 *  1. varumärket kommer ur brand-lagret (loadBranding), ingen Handymate-teal
 *  2. sanningen: "kostar inget" bara bakom firmans reglage; inget "fast pris";
 *     kunden bokar ett BESÖK, inte ett arbete
 *  3. den gamla book-routen är orörd — sidan lever på samma grindar (409/429)
 *  4. datum/veckor/ICS räknas i ren logik som går att bevisa här
 *
 *   npx playwright test tests/bokningsflodet.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  accentRamp,
  activeWeekdays,
  addDays,
  buildVisitIcs,
  dayLabel,
  groupWeeks,
  hoursSummary,
  isoWeek,
  mondayOf,
  nextFreeDay,
  todayInStockholm,
  weekdayOf,
  whenLong,
  whenShort,
  BOOKING_DEFAULT_ACCENT,
  type BookingDay,
} from '../lib/bookings/booking-page'

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const PAGE = 'app/site/[slug]/boka/page.tsx'
const ROUTE = 'app/api/public/booking-page/[slug]/route.ts'
const BOOK_ROUTE = 'app/api/public/book/[slug]/route.ts'
const CARD = 'components/settings/kundvy/BookingLinkCard.tsx'
const KUNDVY = 'app/dashboard/settings/kundvy/page.tsx'
const MIGRATION = 'sql/v222_bokning_gratis_besok.sql'

const slot = (date: string, time: string) => ({
  time,
  startISO: `${date}T${time}:00.000Z`,
  endISO: `${date}T${time}:00.000Z`,
})

// ── Ren logik ──────────────────────────────────────────────────────────────

test.describe('accentrampen', () => {
  test('mörk accent får vit text, ljus accent får mörk text', () => {
    expect(accentRamp('#0F172A').onAccent).toBe('#ffffff')
    expect(accentRamp('#F59E0B').onAccent).toBe('#0F172A')
  })
  test('ogiltig eller saknad färg faller till standardaccenten — aldrig teal', () => {
    expect(accentRamp(null).accent).toBe(BOOKING_DEFAULT_ACCENT)
    expect(accentRamp('teal').accent).toBe(BOOKING_DEFAULT_ACCENT)
    expect(BOOKING_DEFAULT_ACCENT.toUpperCase()).not.toBe('#0F766E')
  })
  test('tintarna är ljusare än accenten, a700 mörkare', () => {
    const r = accentRamp('#2563EB')
    expect(r.a50.toLowerCase()).not.toBe(r.accent.toLowerCase())
    expect(r.a700.toLowerCase()).not.toBe(r.accent.toLowerCase())
    expect(r.a50).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

test.describe('datum på svenska', () => {
  test('whenShort/whenLong för en tisdag i september', () => {
    expect(whenShort('2026-09-15', '09:00', 60)).toBe('tis 15 sep kl 09:00–10:00')
    expect(whenLong('2026-09-15', '09:00', 60)).toBe('Tisdag 15 september kl 09:00–10:00')
    expect(dayLabel('2026-09-17')).toBe('torsdag 17 sep')
  })
  test('veckodag och ISO-vecka är tidszonsäkra', () => {
    expect(weekdayOf('2026-09-14')).toBe('monday')
    expect(weekdayOf('2026-09-20')).toBe('sunday')
    expect(isoWeek('2026-09-14')).toBe(38)
    expect(mondayOf('2026-09-17')).toBe('2026-09-14')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(todayInStockholm(new Date('2026-09-14T22:30:00Z'))).toBe('2026-09-15')
  })
  test('hoursSummary beskriver firmans arbetstider', () => {
    const monFri = Object.fromEntries(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((d) => [d, { active: true, start: '07:00', end: '16:00' }]),
    )
    expect(hoursSummary({ ...monFri, saturday: { active: false, start: '', end: '' } })).toBe('mån–fre 07–16')
    expect(hoursSummary({ ...monFri, friday: { active: true, start: '07:00', end: '12:00' } })).toBe('mån–tor 07–16, fre 07–12')
    // Utan arbetstider finns inga tider (availability ger null) — sidan säger
    // "inga bokningsbara tider", den hittar inte på mån–fre.
    expect(hoursSummary(null)).toBe('')
    expect(activeWeekdays(null)).toEqual([])
  })
})

test.describe('veckoindelningen', () => {
  const days: BookingDay[] = [
    { date: '2026-09-10', slots: [] }, // torsdag, fullt
    { date: '2026-09-11', slots: [slot('2026-09-11', '09:00')] },
    { date: '2026-09-14', slots: [slot('2026-09-14', '07:00'), slot('2026-09-14', '08:00')] },
    { date: '2026-09-15', slots: [] },
    { date: '2026-09-16', slots: [] },
    { date: '2026-09-17', slots: [slot('2026-09-17', '13:00')] },
    { date: '2026-09-18', slots: [] },
  ]
  const columns = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const

  test('en kolumn per aktiv veckodag, tomma celler före idag, etikett per vecka', () => {
    const weeks = groupWeeks(days, [...columns])
    expect(weeks).toHaveLength(2)
    expect(weeks[0].label).toBe('Vecka 37 · 7–11 sep')
    expect(weeks[0].cells.map((c) => c.date)).toEqual([null, null, null, '2026-09-10', '2026-09-11'])
    expect(weeks[1].label).toBe('Vecka 38 · 14–18 sep')
    expect(weeks[1].cells.map((c) => c.slotCount)).toEqual([2, 0, 0, 1, 0])
  })
  test('nästa lediga dag hoppar över fulla dagar', () => {
    expect(nextFreeDay(days)?.date).toBe('2026-09-11')
    expect(nextFreeDay(days, '2026-09-14')?.date).toBe('2026-09-17')
    expect(nextFreeDay(days, '2026-09-17')).toBeNull()
  })
})

test.describe('ICS-filen', () => {
  test('giltig VEVENT i UTC med firmans namn och telefon', () => {
    const ics = buildVisitIcs({
      uid: 'book_abc',
      startISO: '2026-09-15T07:00:00.000Z',
      endISO: '2026-09-15T08:00:00.000Z',
      businessName: 'Nordström El AB',
      phone: '070-123 45 67',
      now: new Date('2026-09-07T10:00:00Z'),
    })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20260915T070000Z')
    expect(ics).toContain('DTEND:20260915T080000Z')
    expect(ics).toContain('UID:book_abc@handymate.se')
    expect(ics).toContain('SUMMARY:Besök av Nordström El AB')
    expect(ics).toContain('070-123 45 67')
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })
})

// ── Routen ─────────────────────────────────────────────────────────────────

test.describe('GET /api/public/booking-page/[slug]', () => {
  test('force-dynamic, varumärke ur brand-lagret, samma publiceringsgrind som book-routen', () => {
    const src = read(ROUTE)
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain('loadBranding(supabase, businessId)')
    expect(src).toContain('attribution: branding.attribution')
    expect(src).toContain('!storefront.is_published')
    expect(src).toContain('{ status: 404 }')
  })
  test('lediga tider räknas med samma motor som /availability, aldrig egen', () => {
    const src = read(ROUTE)
    expect(src).toContain('computeAvailableSlots({')
    expect(src).toContain(".neq('status', 'cancelled')")
  })
  test('"kostar inget" läses separat och tolkas som AV vid fel — löftet går aldrig ut av misstag', () => {
    const src = read(ROUTE)
    expect(src).toContain("select('booking_visit_free')")
    expect(src).toMatch(/if \(error\) return false/)
    expect(src).toContain('=== true')
  })
  test('book-routen är orörd av omdesignen (samma felkoder)', () => {
    const src = read(BOOK_ROUTE)
    expect(src).toContain('{ status: 409 }')
    expect(src).toContain('{ status: 429 }')
    expect(src).toContain("status: 'confirmed'")
  })
})

// ── Sidan ──────────────────────────────────────────────────────────────────

test.describe('bokningssidan', () => {
  test('hämtar från booking-page och bokar via den gamla book-routen', () => {
    const src = read(PAGE)
    expect(src).toContain('/api/public/booking-page/${')
    expect(src).toContain('/api/public/book/${')
    expect(src).not.toContain('/api/public/availability/')
  })
  test('varumärke: accentramp + stämpel, ingen Handymate-teal, inga emoji-ikoner', () => {
    const src = read(PAGE)
    expect(src).toContain('accentRamp(')
    expect(src).toContain('<AttributionStamp')
    expect(src.toUpperCase()).not.toContain('#0F766E')
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
  test('sanningen: kostar inget bara bakom visit_free, inget fast pris, besök inte arbete', () => {
    const src = read(PAGE)
    expect(src).not.toMatch(/fast pris/i)
    // Varje "kostar inget" ska stå i en visit_free-gren.
    const lines = src.split('\n').filter((l) => l.includes('kostar inget'))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l).toContain('visit_free')
    expect(src).toContain('Boka besöket')
    expect(src).toContain('Besöket är bokat.')
    expect(src).not.toContain('Din uppgifter')
  })
  test('felen är lugna inforutor: 409 laddar om listan, 429 hänvisar till telefon, aldrig alert()', () => {
    const src = read(PAGE)
    expect(src).toContain('res.status === 409')
    expect(src).toContain('Tiden är tyvärr inte längre ledig.')
    expect(src).toContain('res.status === 429')
    expect(src).toContain('För många bokningsförsök.')
    expect(src).not.toMatch(/\balert\(/)
  })
  test('bekräftelsen är ärlig: kalenderfil i klienten, ändring sker via telefon', () => {
    const src = read(PAGE)
    expect(src).toContain('buildVisitIcs(')
    expect(src).toContain('Lägg i kalendern')
    expect(src).toContain('Du kan inte ändra bokningen här ännu.')
    expect(src).not.toMatch(/med en länk som den här/)
  })
  test('ingen ROT-/BankID-text på en sida som bokar ett besök', () => {
    const src = read(PAGE)
    expect(src).not.toMatch(/BankID/i)
    expect(src).not.toMatch(/ROT-avdrag/i)
  })
})

// ── Kundvyn + migrationen ──────────────────────────────────────────────────

test.describe('Din bokningslänk i kundvyn', () => {
  test('kortet monteras och skriver booking_visit_free', () => {
    expect(read(KUNDVY)).toContain('<BookingLinkCard')
    const src = read(CARD)
    expect(src).toContain('/site/${slug}/boka')
    expect(src).toContain('booking_visit_free: next')
    expect(src).toContain('Länken aktiveras när hemsidan är publicerad.')
  })
  test('v222 lägger kolumnen med default false', () => {
    const src = read(MIGRATION)
    expect(src).toContain('ADD COLUMN IF NOT EXISTS booking_visit_free BOOLEAN NOT NULL DEFAULT false')
  })
})
