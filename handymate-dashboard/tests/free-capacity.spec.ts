/**
 * Fri kapacitet-primitiven — facit-tester för den rena beräkningskärnan
 * (Fas 1, "Kapacitets-primitiven", tasks/vad-kan-vi-kopiera-snug-phoenix.md).
 * Körs:
 *   npx playwright test tests/free-capacity.spec.ts --no-deps
 *
 * getFreeCapacity (I/O-wrappern) testas INTE här — kräver en riktig
 * Supabase-klient, samma princip som fetchPersonDays/getWeekCapacity.
 */
import { test, expect } from '@playwright/test'
import {
  computeFreeCapacity,
  DEFAULT_FREE_CAPACITY_SETTINGS,
  DEFAULT_BOOKING_CAP_PCT,
  DEFAULT_EMERGENCY_RESERVE_HOURS,
  type FreeCapacitySettings,
} from '../lib/capacity/free-capacity'
import type { PersonDay, PersonDayShift } from '../lib/schedule/person-day'

const MON_TO_SUN = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']
// 2026-08-03 är en måndag, 2026-08-08/09 lör/sön (samma vecka som tests/schedule-utilization.spec.ts).

function shift(overrides: Partial<PersonDayShift> = {}): PersonDayShift {
  return {
    source: 'booking',
    type: 'booking',
    start: '2026-08-04T08:00:00.000Z',
    end: '2026-08-04T16:00:00.000Z',
    title: 'Jobb',
    refId: 'ref_1',
    projectId: null,
    customerId: null,
    allDay: false,
    conflict: false,
    ...overrides,
  }
}

function personDay(overrides: Partial<PersonDay> = {}): PersonDay {
  return {
    businessUserId: 'user_1',
    date: '2026-08-04',
    shifts: [],
    isAbsent: false,
    ...overrides,
  }
}

test.describe('computeFreeCapacity — defaults', () => {
  test('DEFAULT_BOOKING_CAP_PCT är 0.75 (boka max 75%)', () => {
    expect(DEFAULT_BOOKING_CAP_PCT).toBe(0.75)
  })

  test('DEFAULT_EMERGENCY_RESERVE_HOURS är 0', () => {
    expect(DEFAULT_EMERGENCY_RESERVE_HOURS).toBe(0)
  })

  test('DEFAULT_FREE_CAPACITY_SETTINGS matchar de exporterade konstanterna', () => {
    expect(DEFAULT_FREE_CAPACITY_SETTINGS).toEqual({
      bookingCapPct: DEFAULT_BOOKING_CAP_PCT,
      emergencyReserveHours: DEFAULT_EMERGENCY_RESERVE_HOURS,
    })
  })
})

test.describe('computeFreeCapacity — grundläggande lediga timmar', () => {
  test('inga pass alls en vardag → 8h ledigt', () => {
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(8)
  })

  test('4h-pass en vardag → 4h ledigt kvar', () => {
    const days: PersonDay[] = [
      personDay({ date: MON_TO_SUN[0], shifts: [shift({ start: `${MON_TO_SUN[0]}T08:00:00.000Z`, end: `${MON_TO_SUN[0]}T12:00:00.000Z` })] }),
    ]
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(4)
  })

  test('heldagspass (booking) → 0h ledigt (räknas som STANDARD_WORKDAY_HOURS, samma som utilization)', () => {
    const days: PersonDay[] = [personDay({ date: MON_TO_SUN[0], shifts: [shift({ allDay: true })] })]
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(0)
  })
})

test.describe('computeFreeCapacity — aldrig negativt', () => {
  test('överbokad dag (10h pass) → 0h ledigt, inte minus', () => {
    const days: PersonDay[] = [
      personDay({ date: MON_TO_SUN[0], shifts: [shift({ start: `${MON_TO_SUN[0]}T07:00:00.000Z`, end: `${MON_TO_SUN[0]}T17:00:00.000Z` })] }),
    ]
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(0)
    expect(result.people[0].days[0].bookableHours).toBe(0)
  })

  test('flera överlappande pass som summerar över 8h → fortfarande 0, aldrig minus', () => {
    const days: PersonDay[] = [
      personDay({
        date: MON_TO_SUN[0],
        shifts: [
          shift({ refId: 'a', start: `${MON_TO_SUN[0]}T06:00:00.000Z`, end: `${MON_TO_SUN[0]}T14:00:00.000Z` }),
          shift({ refId: 'b', start: `${MON_TO_SUN[0]}T13:00:00.000Z`, end: `${MON_TO_SUN[0]}T20:00:00.000Z` }),
        ],
      }),
    ]
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(0)
  })

  test('stor emergencyReserveHours (större än freeHours) → bookableHours 0, inte minus', () => {
    const settings: FreeCapacitySettings = { bookingCapPct: 1, emergencyReserveHours: 100 }
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] }, settings)
    expect(result.people[0].days[0].bookableHours).toBe(0)
  })
})

test.describe('computeFreeCapacity — tak (bookingCapPct)', () => {
  test('8h ledigt × 75% tak → 6h bokningsbart', () => {
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(8)
    expect(result.people[0].days[0].bookableHours).toBe(6)
  })

  test('100% tak → bookableHours === freeHours (utan reserv)', () => {
    const settings: FreeCapacitySettings = { bookingCapPct: 1, emergencyReserveHours: 0 }
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] }, settings)
    expect(result.people[0].days[0].bookableHours).toBe(result.people[0].days[0].freeHours)
  })

  test('50% tak på 4h ledigt → 2h bokningsbart', () => {
    const days: PersonDay[] = [
      personDay({ date: MON_TO_SUN[0], shifts: [shift({ start: `${MON_TO_SUN[0]}T08:00:00.000Z`, end: `${MON_TO_SUN[0]}T12:00:00.000Z` })] }),
    ]
    const settings: FreeCapacitySettings = { bookingCapPct: 0.5, emergencyReserveHours: 0 }
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] }, settings)
    expect(result.people[0].days[0].freeHours).toBe(4)
    expect(result.people[0].days[0].bookableHours).toBe(2)
  })
})

test.describe('computeFreeCapacity — akutreserv (emergencyReserveHours)', () => {
  test('75% tak minus 1h reserv → 8h ledigt ger 5h bokningsbart', () => {
    const settings: FreeCapacitySettings = { bookingCapPct: 0.75, emergencyReserveHours: 1 }
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] }, settings)
    // 8 * 0.75 = 6, minus 1h reserv = 5
    expect(result.people[0].days[0].bookableHours).toBe(5)
  })

  test('reserv appliceras per dag, inte bara en gång för hela intervallet', () => {
    const settings: FreeCapacitySettings = { bookingCapPct: 1, emergencyReserveHours: 2 }
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[1] }, settings)
    expect(result.people[0].days[0].bookableHours).toBe(6) // 8 - 2
    expect(result.people[0].days[1].bookableHours).toBe(6) // 8 - 2, samma varje dag
  })
})

test.describe('computeFreeCapacity — frånvaro', () => {
  test('frånvarodag → 0 lediga timmar, oavsett vad passtimmarna summerar till', () => {
    const days: PersonDay[] = [
      personDay({
        date: MON_TO_SUN[0],
        isAbsent: true,
        shifts: [shift({ type: 'time_off', start: `${MON_TO_SUN[0]}T00:00:00.000Z`, end: `${MON_TO_SUN[0]}T23:59:59.000Z`, allDay: true })],
      }),
    ]
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(0)
    expect(result.people[0].days[0].bookableHours).toBe(0)
    expect(result.people[0].days[0].isAbsent).toBe(true)
  })

  test('frånvaro EGEN regel — skiljer sig medvetet från utilization.ts (som räknar allDay time_off som 8h "bemannat")', () => {
    // Samma fixtur som schedule-utilization.spec.ts "frånvarodag räknas INTE
    // bort ur nämnaren"-testet (som ger 100% beläggning där) — här ska
    // svaret vara 0 lediga timmar, inte 8.
    const days: PersonDay[] = MON_TO_SUN.slice(0, 5).map((date) =>
      personDay({ date, isAbsent: true, shifts: [shift({ type: 'time_off', start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.000Z`, allDay: true })] }),
    )
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[4] })
    expect(result.people[0].days.every((d) => d.freeHours === 0)).toBe(true)
  })
})

test.describe('computeFreeCapacity — helg', () => {
  test('lördag/söndag → 0 lediga timmar, ingen bokningsbar helgtid', () => {
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[5], to: MON_TO_SUN[6] })
    expect(result.people[0].days.every((d) => d.isWeekend)).toBe(true)
    expect(result.people[0].days.every((d) => d.freeHours === 0)).toBe(true)
    expect(result.people[0].days.every((d) => d.bookableHours === 0)).toBe(true)
  })

  test('helgpass (om det ändå finns ett) ändrar inte 0-resultatet', () => {
    const days: PersonDay[] = [
      personDay({
        date: MON_TO_SUN[5],
        shifts: [shift({ start: `${MON_TO_SUN[5]}T08:00:00.000Z`, end: `${MON_TO_SUN[5]}T10:00:00.000Z` })],
      }),
    ]
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[5], to: MON_TO_SUN[5] })
    expect(result.people[0].days[0].freeHours).toBe(0)
  })
})

test.describe('computeFreeCapacity — flerpersonsaggregat', () => {
  test('days[] summerar freeHours/bookableHours över alla personer', () => {
    const days: PersonDay[] = [
      personDay({ businessUserId: 'user_1', date: MON_TO_SUN[0], shifts: [] }), // 8h ledigt
      personDay({
        businessUserId: 'user_2',
        date: MON_TO_SUN[0],
        shifts: [shift({ start: `${MON_TO_SUN[0]}T08:00:00.000Z`, end: `${MON_TO_SUN[0]}T12:00:00.000Z` })],
      }), // 4h ledigt
    ]
    const result = computeFreeCapacity(days, ['user_1', 'user_2'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    const dayAgg = result.days.find((d) => d.date === MON_TO_SUN[0])
    expect(dayAgg?.freeHours).toBe(12) // 8 + 4
    expect(dayAgg?.bookableHours).toBe(9) // (8*0.75) + (4*0.75) = 6 + 3
  })

  test('totalFreeHours/totalBookableHours summerar över alla personer och dagar', () => {
    const result = computeFreeCapacity([], ['user_1', 'user_2'], { from: MON_TO_SUN[0], to: MON_TO_SUN[1] })
    // 2 personer × 2 vardagar × 8h = 32h ledigt
    expect(result.totalFreeHours).toBe(32)
    expect(result.totalBookableHours).toBe(24) // 32 * 0.75
  })

  test('en persons pass påverkar inte en annan persons lediga timmar samma dag', () => {
    const days: PersonDay[] = [
      personDay({
        businessUserId: 'user_1',
        date: MON_TO_SUN[0],
        shifts: [shift({ start: `${MON_TO_SUN[0]}T08:00:00.000Z`, end: `${MON_TO_SUN[0]}T16:00:00.000Z` })],
      }), // fullbokad
    ]
    const result = computeFreeCapacity(days, ['user_1', 'user_2'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    const p1 = result.people.find((p) => p.businessUserId === 'user_1')
    const p2 = result.people.find((p) => p.businessUserId === 'user_2')
    expect(p1?.days[0].freeHours).toBe(0)
    expect(p2?.days[0].freeHours).toBe(8)
  })
})

test.describe('computeFreeCapacity — tom input', () => {
  test('tom memberIds-lista → tom people-lista, ingen krasch', () => {
    const result = computeFreeCapacity([], [], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people).toEqual([])
    expect(result.totalFreeHours).toBe(0)
    expect(result.totalBookableHours).toBe(0)
  })

  test('tomt personDays men medlemmar finns → fulla lediga timmar (ingen krasch på saknad data)', () => {
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people).toHaveLength(1)
    expect(result.people[0].days[0].freeHours).toBe(8)
  })

  test('personDays för fel person/datum → matchar inte, ingen krasch', () => {
    const days: PersonDay[] = [personDay({ businessUserId: 'user_annan', date: '2099-01-01' })]
    const result = computeFreeCapacity(days, ['user_1'], { from: MON_TO_SUN[0], to: MON_TO_SUN[0] })
    expect(result.people[0].days[0].freeHours).toBe(8)
  })

  test('range.from > range.to → tomma dagar, ingen krasch', () => {
    const result = computeFreeCapacity([], ['user_1'], { from: MON_TO_SUN[1], to: MON_TO_SUN[0] })
    expect(result.days).toEqual([])
    expect(result.people[0].days).toEqual([])
  })
})
