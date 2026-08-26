/**
 * Enhetstest — deriveProjectDates (lib/projects/derive-dates.ts). Ren funktion.
 *   npx playwright test tests/project-derive-dates.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import { deriveProjectDates } from '../lib/projects/derive-dates'

const NOW = new Date('2026-08-26T10:00:00')

test.describe('deriveProjectDates', () => {
  test('planerat spann, pågående → "12 aug – 30 sep" + vecka X av Y', () => {
    const r = deriveProjectDates({ status: 'active', start_date: '2026-08-12', end_date: '2026-09-30' }, NOW)
    expect(r.label).toBe('12 aug. – 30 sep.')
    expect(r.sublabel).toMatch(/^vecka \d+ av \d+$/)
    expect(r.tone).toBe('neutral')
    expect(r.is_late).toBe(false)
  })

  test('startdatum i framtiden → "Startar …", tone upcoming, ingen veckoräkning', () => {
    const r = deriveProjectDates({ status: 'planning', start_date: '2026-09-03' }, NOW)
    expect(r.label).toBe('Startar 3 sep.')
    expect(r.sublabel).toBeNull()
    expect(r.tone).toBe('upcoming')
  })

  test('bara startdatum i det förflutna → "Start … · slut ej satt"', () => {
    const r = deriveProjectDates({ status: 'active', start_date: '2026-08-10' }, NOW)
    expect(r.label).toBe('Start 10 aug. · slut ej satt')
  })

  test('förfallet slutdatum och inte klart → försenad N dagar, tone late', () => {
    const r = deriveProjectDates({ status: 'active', start_date: '2026-07-01', end_date: '2026-08-20' }, NOW)
    expect(r.is_late).toBe(true)
    expect(r.days_late).toBe(6)
    expect(r.sublabel).toBe('försenad 6 dagar')
    expect(r.tone).toBe('late')
  })

  test('faktisk start avviker från planerad → "startade … (planerat …)"', () => {
    const r = deriveProjectDates({ status: 'active', start_date: '2026-08-12', end_date: '2026-09-30', actual_start: '2026-08-14' }, NOW)
    expect(r.sublabel).toContain('startade 14 aug. (planerat 12 aug.)')
  })

  test('faktisk start samma dag som planerad → ingen avvikelsetext', () => {
    const r = deriveProjectDates({ status: 'active', start_date: '2026-08-12', end_date: '2026-09-30', actual_start: '2026-08-12' }, NOW)
    expect(r.sublabel).not.toContain('planerat')
  })

  test('inga datum alls, men tidrapport finns → "Startade …" (aldrig ett gissat slut)', () => {
    const r = deriveProjectDates({ status: 'active', actual_start: '2026-08-14' }, NOW)
    expect(r.label).toBe('Startade 14 aug.')
    expect(r.sublabel).toBeNull()
  })

  test('inga datum alls och inget arbete → "Inga datum satta"', () => {
    expect(deriveProjectDates({ status: 'planning' }, NOW).label).toBe('Inga datum satta')
  })

  test('klart → "Klart …" + relation till planerat slut, aldrig försenad', () => {
    const r = deriveProjectDates({ status: 'completed', end_date: '2026-08-20', completed_at: '2026-08-24T15:00:00Z' }, NOW)
    expect(r.label).toBe('Klart 24 aug.')
    expect(r.sublabel).toBe('4 dagar efter planerat slut')
    expect(r.tone).toBe('done')
    expect(r.is_late).toBe(false)
  })

  test('completed_at satt men status inte uppdaterad räknas ändå som klart', () => {
    expect(deriveProjectDates({ status: 'active', completed_at: '2026-08-24T15:00:00Z' }, NOW).tone).toBe('done')
  })

  test('avbrutet → tone cancelled, aldrig försenad', () => {
    const r = deriveProjectDates({ status: 'cancelled', end_date: '2026-01-01' }, NOW)
    expect(r.tone).toBe('cancelled')
    expect(r.is_late).toBe(false)
  })
})
