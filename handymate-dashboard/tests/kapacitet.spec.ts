/**
 * Kapacitet-primitiv v1 — facit-tester för den rena beräkningsmotorn.
 * Körs: npx playwright test tests/kapacitet.spec.ts --no-deps
 *
 * Veckofönster i alla tester: weekStart='2026-07-13' (måndag, sommartid/CEST
 * UTC+2) → svensk midnatt = 2026-07-12T22:00:00Z, veckoslut (exkl.) =
 * 2026-07-19T22:00:00Z (svensk midnatt 2026-07-20).
 *
 * Kärnregel: booked_hours räknas alltid fram (aldrig null) — även när
 * provided_hours är null. Endast fälten som BEROR på provided_hours
 * (open_hours, utilization_pct, thin_week) blir null vid okonfigurerat.
 */
import { test, expect } from '@playwright/test'
import {
  computeWeekCapacity,
  mondayOfWeek,
  type WeekCapacityInput,
} from '../lib/capacity/week-capacity'

const WEEK_START = '2026-07-13'

function base(over: Partial<WeekCapacityInput> = {}): WeekCapacityInput {
  return {
    weekStart: WEEK_START,
    providedHoursPerWeek: 40,
    bookingCapPct: 80,
    defaultBookingHours: 2,
    bookings: [],
    ...over,
  }
}

test.describe('computeWeekCapacity — bokade timmar', () => {
  test('bokning med scheduled_end (3h) + bokning utan (default 2h) → booked 5h', () => {
    const r = computeWeekCapacity(
      base({
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T11:00:00Z', status: 'confirmed' },
          { scheduled_start: '2026-07-15T08:00:00Z', scheduled_end: null, status: 'confirmed' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(5)
  })

  test('cancelled-bokning räknas inte in', () => {
    const r = computeWeekCapacity(
      base({
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T18:00:00Z', status: 'cancelled' },
          { scheduled_start: '2026-07-15T08:00:00Z', scheduled_end: '2026-07-15T09:00:00Z', status: 'confirmed' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(1)
  })

  test('no_show-bokning räknas inte in', () => {
    const r = computeWeekCapacity(
      base({
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T12:00:00Z', status: 'no_show' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(0)
  })

  test('ogiltig scheduled_end faller tillbaka på defaultBookingHours', () => {
    const r = computeWeekCapacity(
      base({
        defaultBookingHours: 3,
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: 'inte-ett-datum', status: 'confirmed' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(3)
  })

  test('rundar till 1 decimal (1h50m → 1.8)', () => {
    const r = computeWeekCapacity(
      base({
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T09:50:00Z', status: 'confirmed' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(1.8)
  })
})

test.describe('computeWeekCapacity — veckogräns-klippning', () => {
  test('bokning som slutar EFTER veckoslutet klipps till veckans andel', () => {
    // Start kl 20:00 UTC 07-19 (inom veckan), slut 23:30 UTC 07-19 (efter
    // veckoslutet 22:00 UTC 07-19). Endast 2h (20:00→22:00) ska räknas,
    // inte de fulla 3.5h.
    const r = computeWeekCapacity(
      base({
        bookings: [
          { scheduled_start: '2026-07-19T20:00:00Z', scheduled_end: '2026-07-19T23:30:00Z', status: 'confirmed' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(2)
  })

  test('bokning som börjar FÖRE veckostarten klipps till veckans andel', () => {
    // Start 20:00 UTC 07-12 (före veckostart 22:00 UTC 07-12), slut 02:00
    // UTC 07-13 (6h total). Endast 4h (22:00→02:00) ska räknas.
    const r = computeWeekCapacity(
      base({
        bookings: [
          { scheduled_start: '2026-07-12T20:00:00Z', scheduled_end: '2026-07-13T02:00:00Z', status: 'confirmed' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(4)
  })

  test('bokning helt utanför veckan bidrar med 0', () => {
    const r = computeWeekCapacity(
      base({
        bookings: [
          { scheduled_start: '2026-07-01T08:00:00Z', scheduled_end: '2026-07-01T12:00:00Z', status: 'confirmed' },
        ],
      }),
    )
    expect(r.booked_hours).toBe(0)
  })
})

test.describe('computeWeekCapacity — kapacitet, beläggning, tunn vecka', () => {
  test('provided 40h, cap 80% → open = 32 − booked', () => {
    const r = computeWeekCapacity(
      base({
        providedHoursPerWeek: 40,
        bookingCapPct: 80,
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T18:00:00Z', status: 'confirmed' }, // 10h
        ],
      }),
    )
    expect(r.booked_hours).toBe(10)
    expect(r.open_hours).toBe(22) // 32 - 10
    expect(r.utilization_pct).toBe(Math.round((10 / 32) * 100))
  })

  test('thin_week=true när beläggning < 40%', () => {
    const r = computeWeekCapacity(
      base({
        providedHoursPerWeek: 40,
        bookingCapPct: 80, // capHours = 32
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T10:00:00Z', status: 'confirmed' }, // 2h → 6.25%
        ],
      }),
    )
    expect(r.thin_week).toBe(true)
  })

  test('thin_week=false när beläggning >= 40%', () => {
    const r = computeWeekCapacity(
      base({
        providedHoursPerWeek: 40,
        bookingCapPct: 80, // capHours = 32
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T21:00:00Z', status: 'confirmed' }, // 13h → 40.6%
        ],
      }),
    )
    expect(r.thin_week).toBe(false)
  })

  test('överbokad vecka: utilization_pct kan överstiga 100', () => {
    const r = computeWeekCapacity(
      base({
        providedHoursPerWeek: 10,
        bookingCapPct: 100, // capHours = 10
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T23:00:00Z', status: 'confirmed' }, // 15h
        ],
      }),
    )
    expect(r.booked_hours).toBe(15)
    expect(r.utilization_pct).toBe(150)
    // open_hours kan aldrig bli negativt även om överbokad
    expect(r.open_hours).toBe(0)
  })
})

test.describe('computeWeekCapacity — okonfigurerat och division med noll', () => {
  test('providedHoursPerWeek=null → configured false, alla beroende fält null, booked_hours ändå reellt', () => {
    const r = computeWeekCapacity(
      base({
        providedHoursPerWeek: null,
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T10:00:00Z', status: 'confirmed' },
        ],
      }),
    )
    expect(r.configured).toBe(false)
    expect(r.provided_hours).toBeNull()
    expect(r.open_hours).toBeNull()
    expect(r.utilization_pct).toBeNull()
    expect(r.thin_week).toBeNull()
    expect(r.booked_hours).toBe(2)
  })

  test('providedHoursPerWeek=0 räknas som konfigurerat (medvetet: "0 timmar" är en giltig inställning)', () => {
    const r = computeWeekCapacity(base({ providedHoursPerWeek: 0, bookingCapPct: 80 }))
    expect(r.configured).toBe(true)
    expect(r.provided_hours).toBe(0)
    // capHours = 0 → division med noll guardas → utilization/thin_week null
    expect(r.utilization_pct).toBeNull()
    expect(r.thin_week).toBeNull()
    expect(r.open_hours).toBe(0)
  })

  test('bookingCapPct=0 guardas mot division med noll', () => {
    const r = computeWeekCapacity(
      base({
        providedHoursPerWeek: 40,
        bookingCapPct: 0,
        bookings: [
          { scheduled_start: '2026-07-14T08:00:00Z', scheduled_end: '2026-07-14T10:00:00Z', status: 'confirmed' },
        ],
      }),
    )
    expect(r.utilization_pct).toBeNull()
    expect(r.thin_week).toBeNull()
    expect(r.open_hours).toBe(0)
  })

  test('ren funktion sätter alltid source="settings" — proveniens avgörs av fetch-wrappern', () => {
    const r = computeWeekCapacity(base())
    expect(r.source).toBe('settings')
  })
})

test.describe('mondayOfWeek', () => {
  test('onsdag → föregående måndag', () => {
    expect(mondayOfWeek('2026-07-15')).toBe('2026-07-13')
  })

  test('måndag → sig själv', () => {
    expect(mondayOfWeek('2026-07-13')).toBe('2026-07-13')
  })

  test('söndag → måndagen samma (ISO-)vecka, dvs dagen innan', () => {
    expect(mondayOfWeek('2026-07-19')).toBe('2026-07-13')
  })
})
