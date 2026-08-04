/**
 * Persondagen — facit-tester för den rena sammanslagningskärnan
 * (tasks/resurs-masterplan.md, R1-A). Körs:
 *   npx playwright test tests/person-day.spec.ts --no-deps
 *
 * Testar ENDAST mergePersonDay — ren funktion, ingen I/O. fetchPersonDays
 * (Supabase-wrappern) testas inte här, samma upplägg som
 * tests/tidrapport-forslag.spec.ts / tests/kapacitet-fyllnad.spec.ts.
 */
import { test, expect } from '@playwright/test'
import {
  mergePersonDay,
  type BookingForPersonDay,
  type ScheduleEntryForPersonDay,
} from '../lib/schedule/person-day'

const RANGE = { from: '2026-08-01', to: '2026-08-31' }

function booking(overrides: Partial<BookingForPersonDay> = {}): BookingForPersonDay {
  return {
    booking_id: 'book_1',
    assigned_user_id: 'user_1',
    scheduled_start: '2026-08-10T08:00:00.000Z',
    scheduled_end: '2026-08-10T10:00:00.000Z',
    title: 'Badrumsrenovering',
    project_id: 'proj_1',
    customer_id: 'cust_1',
    status: 'confirmed',
    ...overrides,
  }
}

function entry(overrides: Partial<ScheduleEntryForPersonDay> = {}): ScheduleEntryForPersonDay {
  return {
    id: 'entry_1',
    business_user_id: 'user_1',
    project_id: null,
    title: 'Internt möte',
    start_datetime: '2026-08-10T12:00:00.000Z',
    end_datetime: '2026-08-10T13:00:00.000Z',
    all_day: false,
    type: 'internal',
    status: 'scheduled',
    ...overrides,
  }
}

test.describe('mergePersonDay — grundläggande sammanslagning', () => {
  test('en bokning → ett pass på rätt person/dag', () => {
    const days = mergePersonDay([booking()], [], RANGE)
    expect(days).toHaveLength(1)
    expect(days[0].businessUserId).toBe('user_1')
    expect(days[0].shifts).toHaveLength(1)
    expect(days[0].shifts[0].source).toBe('booking')
    expect(days[0].shifts[0].type).toBe('booking')
    expect(days[0].shifts[0].title).toBe('Badrumsrenovering')
  })

  test('en schedule_entry → ett pass, korrekt typ', () => {
    const days = mergePersonDay([], [entry()], RANGE)
    expect(days).toHaveLength(1)
    expect(days[0].shifts[0].source).toBe('schedule')
    expect(days[0].shifts[0].type).toBe('internal')
  })

  test('bokning + schedule_entry samma person/dag → båda i samma PersonDay', () => {
    const days = mergePersonDay([booking()], [entry()], RANGE)
    expect(days).toHaveLength(1)
    expect(days[0].shifts).toHaveLength(2)
  })

  test('olika personer → separata PersonDay-poster', () => {
    const days = mergePersonDay(
      [booking({ assigned_user_id: 'user_1' }), booking({ booking_id: 'book_2', assigned_user_id: 'user_2' })],
      [],
      RANGE,
    )
    expect(days).toHaveLength(2)
    expect(days.map(d => d.businessUserId).sort()).toEqual(['user_1', 'user_2'])
  })

  test('olika dagar samma person → separata PersonDay-poster', () => {
    const days = mergePersonDay(
      [booking({ scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T09:00:00.000Z' }),
       booking({ booking_id: 'book_2', scheduled_start: '2026-08-11T08:00:00.000Z', scheduled_end: '2026-08-11T09:00:00.000Z' })],
      [],
      RANGE,
    )
    expect(days).toHaveLength(2)
    expect(days.map(d => d.date)).toEqual(['2026-08-10', '2026-08-11'])
  })
})

test.describe('mergePersonDay — bokning utan tilldelning', () => {
  test('assigned_user_id null → hoppas över helt (ingen gissning)', () => {
    const days = mergePersonDay([booking({ assigned_user_id: null })], [], RANGE)
    expect(days).toHaveLength(0)
  })

  test('avbokad bokning (status cancelled) → hoppas över', () => {
    const days = mergePersonDay([booking({ status: 'cancelled' })], [], RANGE)
    expect(days).toHaveLength(0)
  })

  test('avbokad schedule_entry (status cancelled) → hoppas över', () => {
    const days = mergePersonDay([], [entry({ status: 'cancelled' })], RANGE)
    expect(days).toHaveLength(0)
  })

  test('utanför dateRange → hoppas över', () => {
    const days = mergePersonDay(
      [booking({ scheduled_start: '2026-09-05T08:00:00.000Z', scheduled_end: '2026-09-05T09:00:00.000Z' })],
      [],
      RANGE,
    )
    expect(days).toHaveLength(0)
  })

  test('bokning utan scheduled_end → använder scheduled_start som slut (nolldurationspass, ingen krasch)', () => {
    const days = mergePersonDay([booking({ scheduled_end: null })], [], RANGE)
    expect(days[0].shifts[0].end).toBe(days[0].shifts[0].start)
  })
})

test.describe('mergePersonDay — frånvaro (time_off)', () => {
  test('time_off-pass → isAbsent true för dagen', () => {
    const days = mergePersonDay([], [entry({ type: 'time_off', all_day: true, start_datetime: '2026-08-10T00:00:00.000Z', end_datetime: '2026-08-10T23:59:59.000Z' })], RANGE)
    expect(days[0].isAbsent).toBe(true)
  })

  test('ingen time_off-post → isAbsent false', () => {
    const days = mergePersonDay([], [entry({ type: 'internal' })], RANGE)
    expect(days[0].isAbsent).toBe(false)
  })

  test('time_off vinner visuellt men DÖLJER INTE en krockande bokning — bokningen finns kvar och flaggas conflict', () => {
    const timeOff = entry({
      id: 'off_1', type: 'time_off', all_day: true,
      start_datetime: '2026-08-10T00:00:00.000Z', end_datetime: '2026-08-10T23:59:59.000Z',
    })
    const conflictingBooking = booking({
      scheduled_start: '2026-08-10T09:00:00.000Z', scheduled_end: '2026-08-10T11:00:00.000Z',
    })
    const days = mergePersonDay([conflictingBooking], [timeOff], RANGE)
    expect(days).toHaveLength(1)
    expect(days[0].isAbsent).toBe(true)
    // Bokningen är fortfarande med i shifts — den göms INTE bort.
    const bookingShift = days[0].shifts.find(s => s.source === 'booking')
    expect(bookingShift).toBeDefined()
    expect(bookingShift?.conflict).toBe(true)
    const timeOffShift = days[0].shifts.find(s => s.type === 'time_off')
    expect(timeOffShift?.conflict).toBe(true)
  })
})

test.describe('mergePersonDay — konfliktdetektering (överlapp)', () => {
  test('två överlappande bokningar → båda flaggas conflict:true', () => {
    const b1 = booking({ booking_id: 'b1', scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T10:00:00.000Z' })
    const b2 = booking({ booking_id: 'b2', scheduled_start: '2026-08-10T09:00:00.000Z', scheduled_end: '2026-08-10T11:00:00.000Z' })
    const days = mergePersonDay([b1, b2], [], RANGE)
    expect(days[0].shifts.every(s => s.conflict)).toBe(true)
  })

  test('pass som bara nuddar varandra (10-12 och 12-14) → INGEN konflikt', () => {
    const b1 = booking({ booking_id: 'b1', scheduled_start: '2026-08-10T10:00:00.000Z', scheduled_end: '2026-08-10T12:00:00.000Z' })
    const b2 = booking({ booking_id: 'b2', scheduled_start: '2026-08-10T12:00:00.000Z', scheduled_end: '2026-08-10T14:00:00.000Z' })
    const days = mergePersonDay([b1, b2], [], RANGE)
    expect(days[0].shifts.every(s => !s.conflict)).toBe(true)
  })

  test('helt separata pass samma dag → ingen konflikt', () => {
    const b1 = booking({ booking_id: 'b1', scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T09:00:00.000Z' })
    const e1 = entry({ id: 'e1', start_datetime: '2026-08-10T13:00:00.000Z', end_datetime: '2026-08-10T14:00:00.000Z' })
    const days = mergePersonDay([b1], [e1], RANGE)
    expect(days[0].shifts.every(s => !s.conflict)).toBe(true)
  })

  test('bokning krockar med schedule_entry (dubbelbokad kund + internt) → båda flaggas', () => {
    const b1 = booking({ scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T10:00:00.000Z' })
    const e1 = entry({ start_datetime: '2026-08-10T09:00:00.000Z', end_datetime: '2026-08-10T11:00:00.000Z' })
    const days = mergePersonDay([b1], [e1], RANGE)
    expect(days[0].shifts.every(s => s.conflict)).toBe(true)
  })

  test('tre pass, bara två av dem krockar → endast de två flaggas', () => {
    const b1 = booking({ booking_id: 'b1', scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T10:00:00.000Z' })
    const b2 = booking({ booking_id: 'b2', scheduled_start: '2026-08-10T09:00:00.000Z', scheduled_end: '2026-08-10T11:00:00.000Z' })
    const b3 = booking({ booking_id: 'b3', scheduled_start: '2026-08-10T14:00:00.000Z', scheduled_end: '2026-08-10T15:00:00.000Z' })
    const days = mergePersonDay([b1, b2, b3], [], RANGE)
    const byId = (id: string) => days[0].shifts.find(s => s.refId === id)
    expect(byId('b1')?.conflict).toBe(true)
    expect(byId('b2')?.conflict).toBe(true)
    expect(byId('b3')?.conflict).toBe(false)
  })

  test('olika personer, samma tid → ingen konflikt (krock gäller bara inom samma person/dag)', () => {
    const b1 = booking({ booking_id: 'b1', assigned_user_id: 'user_1', scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T10:00:00.000Z' })
    const b2 = booking({ booking_id: 'b2', assigned_user_id: 'user_2', scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T10:00:00.000Z' })
    const days = mergePersonDay([b1, b2], [], RANGE)
    for (const day of days) {
      expect(day.shifts.every(s => !s.conflict)).toBe(true)
    }
  })
})

test.describe('mergePersonDay — heldag vs tidsatt', () => {
  test('heldagspost (all_day) flaggas allDay:true och spänner hela dagen i överlappskontrollen', () => {
    const allDayEntry = entry({
      type: 'internal', all_day: true,
      start_datetime: '2026-08-10T00:00:00.000Z', end_datetime: '2026-08-10T23:59:59.000Z',
    })
    const middayBooking = booking({ scheduled_start: '2026-08-10T12:00:00.000Z', scheduled_end: '2026-08-10T13:00:00.000Z' })
    const days = mergePersonDay([middayBooking], [allDayEntry], RANGE)
    expect(days[0].shifts.find(s => s.allDay)?.conflict).toBe(true)
    expect(days[0].shifts.find(s => s.source === 'booking')?.conflict).toBe(true)
  })

  test('tidsatt pass (allDay:false) i övrigt oförändrat', () => {
    const days = mergePersonDay([booking()], [], RANGE)
    expect(days[0].shifts[0].allDay).toBe(false)
  })
})

test.describe('mergePersonDay — determinism/ordning', () => {
  test('pass inom en dag sorteras kronologiskt', () => {
    const late = booking({ booking_id: 'late', scheduled_start: '2026-08-10T14:00:00.000Z', scheduled_end: '2026-08-10T15:00:00.000Z' })
    const early = booking({ booking_id: 'early', scheduled_start: '2026-08-10T07:00:00.000Z', scheduled_end: '2026-08-10T08:00:00.000Z' })
    const days = mergePersonDay([late, early], [], RANGE)
    expect(days[0].shifts.map(s => s.refId)).toEqual(['early', 'late'])
  })

  test('resultatet sorteras på datum sedan person-id', () => {
    const days = mergePersonDay(
      [
        booking({ booking_id: 'b1', assigned_user_id: 'user_2', scheduled_start: '2026-08-11T08:00:00.000Z', scheduled_end: '2026-08-11T09:00:00.000Z' }),
        booking({ booking_id: 'b2', assigned_user_id: 'user_1', scheduled_start: '2026-08-10T08:00:00.000Z', scheduled_end: '2026-08-10T09:00:00.000Z' }),
      ],
      [],
      RANGE,
    )
    expect(days.map(d => `${d.date}:${d.businessUserId}`)).toEqual(['2026-08-10:user_1', '2026-08-11:user_2'])
  })

  test('tom input → tom output', () => {
    expect(mergePersonDay([], [], RANGE)).toEqual([])
  })
})
