/**
 * Facit-tester för bokningsförslag efter signering (idé 4, 2026-08-05).
 *
 * Kärnkravet: vi föreslår ALDRIG en dag som inte faktiskt har bokningsbar
 * kapacitet. Ett förslag som inte håller är värre än inget förslag — det blir
 * ett löfte hantverkaren måste ta tillbaka inför en kund som just signerat.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/booking-suggestions.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  isoWeek,
  suggestBookingDates,
  formatSuggestion,
  MIN_BOOKABLE_HOURS,
  MIN_LEAD_DAYS,
  MAX_SUGGESTIONS,
} from '../lib/quotes/booking-suggestions'

const day = (date: string, bookableHours: number, isWeekend = false) => ({
  date,
  isWeekend,
  freeHours: bookableHours,
  bookableHours,
})

// Måndag 2026-08-10 är utgångspunkt i testerna.
const TODAY = '2026-08-10'

test.describe('isoWeek', () => {
  test('räknar ISO-veckor rätt', () => {
    expect(isoWeek('2026-01-01')).toBe(1)
    expect(isoWeek('2026-08-10')).toBe(33)
  })

  test('nyårsdagar hamnar i rätt år-vecka (ISO-8601)', () => {
    // 2027-01-01 är en fredag → vecka 53 av 2026.
    expect(isoWeek('2027-01-01')).toBe(53)
  })
})

test.describe('suggestBookingDates — bara dagar som faktiskt håller', () => {
  test('dagar under kapacitetströskeln föreslås aldrig', () => {
    const suggestions = suggestBookingDates(
      [day('2026-08-17', MIN_BOOKABLE_HOURS - 1), day('2026-08-18', MIN_BOOKABLE_HOURS)],
      TODAY,
    )
    expect(suggestions.map(s => s.date)).toEqual(['2026-08-18'])
  })

  test('helger föreslås aldrig', () => {
    const suggestions = suggestBookingDates(
      [day('2026-08-15', 8, true), day('2026-08-17', 8)],
      TODAY,
    )
    expect(suggestions.map(s => s.date)).toEqual(['2026-08-17'])
  })

  test('dagar för nära i tiden föreslås inte — hantverkaren behöver framförhållning', () => {
    const tooSoon = '2026-08-11' // dagen efter TODAY
    const suggestions = suggestBookingDates([day(tooSoon, 8), day('2026-08-17', 8)], TODAY)
    expect(suggestions.map(s => s.date)).toEqual(['2026-08-17'])
  })

  test('framförhållningsgränsen är inklusiv', () => {
    const exactly = '2026-08-13' // TODAY + 3
    const suggestions = suggestBookingDates([day(exactly, 8)], TODAY, { minLeadDays: MIN_LEAD_DAYS })
    expect(suggestions.map(s => s.date)).toEqual([exactly])
  })

  test('högst ETT förslag per vecka — tre val i samma vecka är inte tre val', () => {
    const suggestions = suggestBookingDates(
      [day('2026-08-17', 8), day('2026-08-18', 8), day('2026-08-19', 8), day('2026-08-24', 8)],
      TODAY,
    )
    expect(suggestions).toHaveLength(2)
    expect(suggestions.map(s => s.date)).toEqual(['2026-08-17', '2026-08-24'])
  })

  test('tidigaste dagen i veckan vinner, oavsett indataordning', () => {
    const suggestions = suggestBookingDates(
      [day('2026-08-19', 8), day('2026-08-17', 8)],
      TODAY,
    )
    expect(suggestions[0].date).toBe('2026-08-17')
  })

  test('högst tre förslag', () => {
    const days = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07'].map(d => day(d, 8))
    expect(suggestBookingDates(days, TODAY)).toHaveLength(MAX_SUGGESTIONS)
  })

  test('ingen ledig kapacitet ger inga förslag — aldrig ett påhittat datum', () => {
    expect(suggestBookingDates([day('2026-08-17', 0)], TODAY)).toEqual([])
    expect(suggestBookingDates([], TODAY)).toEqual([])
  })

  test('bokningsbara timmar följer med så kunden ser att det finns utrymme', () => {
    const suggestions = suggestBookingDates([day('2026-08-17', 6.4)], TODAY)
    expect(suggestions[0].bookableHours).toBe(6)
  })
})

test.describe('formatSuggestion — svensk formulering', () => {
  test('innehåller veckonummer, veckodag och datum', () => {
    const text = formatSuggestion({ date: '2026-08-17', week: 34, bookableHours: 8 })
    expect(text).toContain('vecka 34')
    expect(text).toContain('måndag')
    expect(text).toContain('17 augusti')
  })
})
