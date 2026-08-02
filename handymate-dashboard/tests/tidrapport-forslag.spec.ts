/**
 * Egenkontroll-agenten — Etapp 2a facit-tester (tasks/easoft-gap-plan.md).
 * Körs: npx playwright test tests/tidrapport-forslag.spec.ts --no-deps
 *
 * Testar den rena, exporterade funktionen i
 * lib/egenkontroll/suggest-time-entry.ts:
 *   - findProjectsMissingTimeEntry (vilka DISTINKTA project_id som saknar
 *     en matchande time_entry för gårdagens genomförda bokningar)
 *
 * INGEN DB, INGET Supabase — suggestTimeEntriesForBusiness (som gör I/O)
 * testas inte här, bara den rena matchningslogiken den bygger på. Samma
 * upplägg som tests/egenkontroll-checklist.spec.ts (etapp 1d).
 */
import { test, expect } from '@playwright/test'
import {
  findProjectsMissingTimeEntry,
  type BookingForTimeMatch,
  type TimeEntryForTimeMatch,
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
