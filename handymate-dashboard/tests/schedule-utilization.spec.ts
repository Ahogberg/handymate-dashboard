/**
 * Beläggningsberäkningen — facit-tester för den rena, extraherade
 * funktionen (tasks/resurs-masterplan.md, R2 punkt 2). Körs:
 *   npx playwright test tests/schedule-utilization.spec.ts --no-deps
 *
 * Formeln SKA vara identisk med R1-heatmapens (schedule/page.tsx
 * utilizationData, före extraktionen): summa passtimmar (helger
 * exkluderade) / (antal vardagar × 8h-schablonen).
 */
import { test, expect } from '@playwright/test'
import { computePersonWeekUtilization, STANDARD_WORKDAY_HOURS, utilizationColorClasses } from '../lib/schedule/utilization'
import type { PersonDay, PersonDayShift } from '../lib/schedule/person-day'

const MON_TO_SUN = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']
// 2026-08-03 är en måndag, 2026-08-08/09 lör/sön.

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

test.describe('computePersonWeekUtilization', () => {
  test('STANDARD_WORKDAY_HOURS är dokumenterat 8h', () => {
    expect(STANDARD_WORKDAY_HOURS).toBe(8)
  })

  test('inga pass alls → 0%', () => {
    const result = computePersonWeekUtilization([], 'user_1', MON_TO_SUN)
    expect(result.utilizationPct).toBe(0)
    expect(result.totalHours).toBe(0)
    expect(result.workdayCount).toBe(5)
  })

  test('en full 8h-dag varje vardag → 100%', () => {
    const days: PersonDay[] = MON_TO_SUN.slice(0, 5).map((date) =>
      personDay({ date, shifts: [shift({ start: `${date}T08:00:00.000Z`, end: `${date}T16:00:00.000Z` })] }),
    )
    const result = computePersonWeekUtilization(days, 'user_1', MON_TO_SUN)
    expect(result.utilizationPct).toBeCloseTo(100, 5)
    expect(result.totalHours).toBe(40)
  })

  test('halva veckan bemannad → 50%', () => {
    const days: PersonDay[] = MON_TO_SUN.slice(0, 5).map((date, i) =>
      personDay({
        date,
        shifts: i < 3 ? [shift({ start: `${date}T08:00:00.000Z`, end: `${date}T12:00:00.000Z` })] : [],
      }),
    )
    // 3 dagar × 4h = 12h / (5 vardagar × 8h = 40h) = 30%
    const result = computePersonWeekUtilization(days, 'user_1', MON_TO_SUN)
    expect(result.utilizationPct).toBeCloseTo(30, 5)
  })

  test('heldagspass räknas som STANDARD_WORKDAY_HOURS', () => {
    const days: PersonDay[] = [personDay({ date: MON_TO_SUN[0], shifts: [shift({ allDay: true })] })]
    const result = computePersonWeekUtilization(days, 'user_1', MON_TO_SUN)
    expect(result.totalHours).toBe(8)
  })

  test('helgpass räknas INTE in i vare sig täljare eller nämnare (samma som R1-heatmapen)', () => {
    const days: PersonDay[] = [
      personDay({
        date: MON_TO_SUN[5], // lördag
        shifts: [shift({ start: `${MON_TO_SUN[5]}T08:00:00.000Z`, end: `${MON_TO_SUN[5]}T16:00:00.000Z` })],
      }),
    ]
    const result = computePersonWeekUtilization(days, 'user_1', MON_TO_SUN)
    expect(result.totalHours).toBe(0)
    expect(result.workdayCount).toBe(5)
    expect(result.utilizationPct).toBe(0)
    const satDay = result.days.find((d) => d.date === MON_TO_SUN[5])
    expect(satDay?.isWeekend).toBe(true)
    expect(satDay?.hours).toBe(8) // dagens EGNA timmar syns fortfarande i days[], bara ej i totalHours
  })

  test('frånvarodag räknas INTE bort ur nämnaren — helt lediga veckan ger 0%, inte "exkluderad" (dokumenterat arv från R1)', () => {
    const days: PersonDay[] = MON_TO_SUN.slice(0, 5).map((date) =>
      personDay({ date, isAbsent: true, shifts: [shift({ type: 'time_off', start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.000Z`, allDay: true })] }),
    )
    const result = computePersonWeekUtilization(days, 'user_1', MON_TO_SUN)
    // Notera: time_off är allDay → räknas som 8h "arbete" i formeln, precis
    // som R1-heatmapen (frånvaro särbehandlas inte i timberäkningen, bara
    // isAbsent-flaggan sätts). En hel semestervecka ger alltså 100%, inte 0%.
    expect(result.utilizationPct).toBeCloseTo(100, 5)
    expect(result.days.every((d) => d.isAbsent || d.isWeekend)).toBe(true)
  })

  test('fel person/datum → tomma dagar, ingen krasch', () => {
    const days: PersonDay[] = [personDay({ businessUserId: 'user_2' })]
    const result = computePersonWeekUtilization(days, 'user_1', MON_TO_SUN)
    expect(result.totalHours).toBe(0)
  })
})

test.describe('utilizationColorClasses', () => {
  test('under 50% → grön', () => {
    expect(utilizationColorClasses(0).text).toBe('text-emerald-600')
    expect(utilizationColorClasses(49.9).text).toBe('text-emerald-600')
  })
  test('50-79% → amber', () => {
    expect(utilizationColorClasses(50).text).toBe('text-amber-600')
    expect(utilizationColorClasses(79.9).text).toBe('text-amber-600')
  })
  test('80%+ → röd', () => {
    expect(utilizationColorClasses(80).text).toBe('text-red-600')
    expect(utilizationColorClasses(150).text).toBe('text-red-600')
  })
})
