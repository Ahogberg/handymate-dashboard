/**
 * Egenkontroll-agenten — Etapp 2a facit-tester (tasks/easoft-gap-plan.md),
 * utökade R1-D (tasks/resurs-masterplan.md) med bokningens EGEN
 * tilldelning som starkare signal än project_assignment.
 * Körs: npx playwright test tests/tidrapport-forslag.spec.ts --no-deps
 *
 * Testar de rena, exporterade funktionerna i
 * lib/egenkontroll/suggest-time-entry.ts:
 *   - findProjectsMissingTimeEntry (vilka DISTINKTA project_id som saknar
 *     en matchande time_entry för gårdagens genomförda bokningar — och nu
 *     även vilka assigned_user_id:n som bidrog)
 *   - pickUnambiguousBookingAssignee (R1-D: namn ENDAST vid exakt en
 *     distinkt assigned_user_id bland dagens bokningar för projektet)
 *   - pickUnambiguousAssignee (2a-förfining: namn ENDAST vid exakt en
 *     tilldelning via project_assignment — aldrig en gissning, aldrig en
 *     lista)
 *
 * INGEN DB, INGET Supabase — suggestTimeEntriesForBusiness och
 * fetchUnambiguousAssigneeName (som gör I/O) testas inte här, bara den
 * rena matchnings-/namnlogiken de bygger på. Samma upplägg som
 * tests/egenkontroll-checklist.spec.ts (etapp 1d).
 */
import { test, expect } from '@playwright/test'
import {
  findProjectsMissingTimeEntry,
  pickUnambiguousAssignee,
  pickUnambiguousBookingAssignee,
  type BookingForTimeMatch,
  type TimeEntryForTimeMatch,
  type AssigneeNameRow,
} from '../lib/egenkontroll/suggest-time-entry'

const REF_DATE = '2026-08-01'

function booking(overrides: Partial<BookingForTimeMatch> = {}): BookingForTimeMatch {
  return {
    booking_id: 'book_1',
    project_id: 'proj_1',
    job_status: 'completed',
    scheduled_start: `${REF_DATE}T07:00:00.000Z`,
    scheduled_end: `${REF_DATE}T15:00:00.000Z`,
    ...overrides,
  }
}

test.describe('findProjectsMissingTimeEntry — matchningskärna', () => {
  test('bokning genomförd utan tidrapport → projektet är med i resultatet', () => {
    const result = findProjectsMissingTimeEntry([booking()], [], REF_DATE)
    expect(result).toHaveLength(1)
    expect(result[0].project_id).toBe('proj_1')
    expect(result[0].booking_date).toBe(REF_DATE)
    expect(result[0].suggested_minutes).toBe(8 * 60)
  })

  test('bokning MED matchande tidrapport → projektet är INTE med', () => {
    const timeEntries: TimeEntryForTimeMatch[] = [{ project_id: 'proj_1' }]
    const result = findProjectsMissingTimeEntry([booking()], timeEntries, REF_DATE)
    expect(result).toHaveLength(0)
  })

  test('bokning utan project_id → hoppas över', () => {
    const result = findProjectsMissingTimeEntry([booking({ project_id: null })], [], REF_DATE)
    expect(result).toHaveLength(0)
  })

  test('bokning med status "pending" (job_status) → hoppas över (inte genomförd)', () => {
    const result = findProjectsMissingTimeEntry([booking({ job_status: 'pending' })], [], REF_DATE)
    expect(result).toHaveLength(0)
  })

  test('bokning med status "scheduled" (default job_status) → hoppas över', () => {
    const result = findProjectsMissingTimeEntry([booking({ job_status: 'scheduled' })], [], REF_DATE)
    expect(result).toHaveLength(0)
  })

  test('bokning med status "cancelled" → hoppas över', () => {
    const result = findProjectsMissingTimeEntry([booking({ job_status: 'cancelled' })], [], REF_DATE)
    expect(result).toHaveLength(0)
  })

  test('bokning med job_status null (aldrig satt) → hoppas över', () => {
    const result = findProjectsMissingTimeEntry([booking({ job_status: null })], [], REF_DATE)
    expect(result).toHaveLength(0)
  })

  test('flera bokningar samma projekt samma dag → projektet räknas EN gång, minuter summeras, spannet vidgas', () => {
    const morning = booking({
      booking_id: 'book_morning',
      scheduled_start: `${REF_DATE}T07:00:00.000Z`,
      scheduled_end: `${REF_DATE}T11:00:00.000Z`,
    })
    const afternoon = booking({
      booking_id: 'book_afternoon',
      scheduled_start: `${REF_DATE}T13:00:00.000Z`,
      scheduled_end: `${REF_DATE}T15:00:00.000Z`,
    })
    const result = findProjectsMissingTimeEntry([morning, afternoon], [], REF_DATE)
    expect(result).toHaveLength(1)
    expect(result[0].project_id).toBe('proj_1')
    expect(result[0].scheduled_start).toBe(`${REF_DATE}T07:00:00.000Z`)
    expect(result[0].scheduled_end).toBe(`${REF_DATE}T15:00:00.000Z`)
    // 4h + 2h = 6h, INTE hela 07-15-spannet (8h) som skulle räkna in luckan.
    expect(result[0].suggested_minutes).toBe(6 * 60)
  })

  test('flera projekt samma dag, ett med tidrapport och ett utan → bara det saknade är med', () => {
    const withEntry = booking({ booking_id: 'book_a', project_id: 'proj_with_entry' })
    const withoutEntry = booking({ booking_id: 'book_b', project_id: 'proj_missing' })
    const timeEntries: TimeEntryForTimeMatch[] = [{ project_id: 'proj_with_entry' }]
    const result = findProjectsMissingTimeEntry([withEntry, withoutEntry], timeEntries, REF_DATE)
    expect(result).toHaveLength(1)
    expect(result[0].project_id).toBe('proj_missing')
  })

  test('tom input → tom output', () => {
    const result = findProjectsMissingTimeEntry([], [], REF_DATE)
    expect(result).toEqual([])
  })
})

test.describe('findProjectsMissingTimeEntry — assigned_user_ids (R1-D)', () => {
  test('bokning med assigned_user_id → id finns med i assigned_user_ids', () => {
    const result = findProjectsMissingTimeEntry([booking({ assigned_user_id: 'user_lars' })], [], REF_DATE)
    expect(result[0].assigned_user_ids).toEqual(['user_lars'])
  })

  test('bokning utan assigned_user_id → tom assigned_user_ids, ingen krasch', () => {
    const result = findProjectsMissingTimeEntry([booking({ assigned_user_id: null })], [], REF_DATE)
    expect(result[0].assigned_user_ids).toEqual([])
  })

  test('flera bokningar samma projekt, samma person → id upprepas (dedup sker i pickUnambiguousBookingAssignee)', () => {
    const morning = booking({ booking_id: 'm', assigned_user_id: 'user_lars', scheduled_start: `${REF_DATE}T07:00:00.000Z`, scheduled_end: `${REF_DATE}T11:00:00.000Z` })
    const afternoon = booking({ booking_id: 'a', assigned_user_id: 'user_lars', scheduled_start: `${REF_DATE}T13:00:00.000Z`, scheduled_end: `${REF_DATE}T15:00:00.000Z` })
    const result = findProjectsMissingTimeEntry([morning, afternoon], [], REF_DATE)
    expect(result[0].assigned_user_ids).toEqual(['user_lars', 'user_lars'])
  })

  test('flera bokningar samma projekt, olika personer → båda id:na med (rådata, ej deduplicerad här)', () => {
    const b1 = booking({ booking_id: 'b1', assigned_user_id: 'user_lars' })
    const b2 = booking({ booking_id: 'b2', assigned_user_id: 'user_hanna' })
    const result = findProjectsMissingTimeEntry([b1, b2], [], REF_DATE)
    expect(result[0].assigned_user_ids.sort()).toEqual(['user_hanna', 'user_lars'])
  })
})

test.describe('pickUnambiguousBookingAssignee — bokningens egen tilldelning (R1-D)', () => {
  test('exakt 1 distinkt id → det idet', () => {
    expect(pickUnambiguousBookingAssignee(['user_lars'])).toBe('user_lars')
  })

  test('samma id upprepat (flera bokningar, samma person) → fortfarande entydigt', () => {
    expect(pickUnambiguousBookingAssignee(['user_lars', 'user_lars', 'user_lars'])).toBe('user_lars')
  })

  test('0 id:n → null', () => {
    expect(pickUnambiguousBookingAssignee([])).toBeNull()
  })

  test('2 distinkta id:n (olika personer på olika besök samma dag) → null, aldrig en gissning', () => {
    expect(pickUnambiguousBookingAssignee(['user_lars', 'user_hanna'])).toBeNull()
  })

  test('null-luckor blandat med ett id → filtreras bort, kvar entydigt', () => {
    expect(pickUnambiguousBookingAssignee(['user_lars'])).toBe('user_lars')
  })
})

test.describe('pickUnambiguousAssignee — namn-kärna (2a-förfining)', () => {
  test('exakt 1 tilldelad person → namnet returneras', () => {
    const assignments: AssigneeNameRow[] = [{ name: 'Lars Andersson' }]
    expect(pickUnambiguousAssignee(assignments)).toBe('Lars Andersson')
  })

  test('0 tilldelade → inget namn (null)', () => {
    expect(pickUnambiguousAssignee([])).toBeNull()
  })

  test('2+ tilldelade → inget namn (aldrig en lista, aldrig "en av två")', () => {
    const assignments: AssigneeNameRow[] = [{ name: 'Lars Andersson' }, { name: 'Hanna Berg' }]
    expect(pickUnambiguousAssignee(assignments)).toBeNull()
  })

  test('3 tilldelade → inget namn', () => {
    const assignments: AssigneeNameRow[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    expect(pickUnambiguousAssignee(assignments)).toBeNull()
  })

  test('exakt 1 tilldelad men namnet är null (aldrig satt på business_users-raden) → inget namn', () => {
    const assignments: AssigneeNameRow[] = [{ name: null }]
    expect(pickUnambiguousAssignee(assignments)).toBeNull()
  })

  test('exakt 1 tilldelad men namnet är tomt/whitespace → inget namn', () => {
    const assignments: AssigneeNameRow[] = [{ name: '   ' }]
    expect(pickUnambiguousAssignee(assignments)).toBeNull()
  })
})
