/**
 * Serviceavtal-motorn v1 — facit-tester för de rena kärnfunktionerna.
 * Körs: npx playwright test tests/serviceavtal.spec.ts --no-deps
 * Mönster: tests/kapacitet.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { addIntervalMonths, pickBestWeek, type WeekCapacityCandidate } from '../lib/agreements/schedule'

test.describe('addIntervalMonths — nästa-besöks-beräkning', () => {
  test('vanligt fall: +1 månad inom samma år', () => {
    expect(addIntervalMonths('2026-01-15', 1)).toBe('2026-02-15')
  })

  test('månadsskifte: 31 jan + 1 månad klamras till feb (icke-skottår, 28 dagar)', () => {
    expect(addIntervalMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  test('skottår: 31 jan + 1 månad klamras till 29 feb 2028', () => {
    expect(addIntervalMonths('2028-01-31', 1)).toBe('2028-02-29')
  })

  test('årsskifte: december + 1 månad → januari nästa år', () => {
    expect(addIntervalMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  test('flera månader samtidigt över årsskifte + klamring: 30 nov + 3 månader → 28 feb (icke-skottår)', () => {
    expect(addIntervalMonths('2026-11-30', 3)).toBe('2027-02-28')
  })

  test('helt år (12 månader): samma dag, nästa år', () => {
    expect(addIntervalMonths('2026-12-15', 12)).toBe('2027-12-15')
  })

  test('två år (24 månader)', () => {
    expect(addIntervalMonths('2026-08-15', 24)).toBe('2028-08-15')
  })

  test('31-dagarsmånad → 31-dagarsmånad: ingen klamring behövs', () => {
    expect(addIntervalMonths('2026-03-31', 12)).toBe('2027-03-31')
  })

  test('36 månader (takgenomgångsintervallet i katalogen)', () => {
    expect(addIntervalMonths('2026-01-10', 36)).toBe('2029-01-10')
  })
})

test.describe('pickBestWeek — Lars-cronens veckoval', () => {
  test('väljer veckan med flest lediga timmar bland tre kandidater', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 5 },   // föregående vecka
      { week_start: '2026-08-10', open_hours: 12 },  // målveckan
      { week_start: '2026-08-17', open_hours: 20 },  // nästa vecka — tunnast
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-17')
  })

  test('målveckan vinner om den redan har mest lediga timmar', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 5 },
      { week_start: '2026-08-10', open_hours: 25 },
      { week_start: '2026-08-17', open_hours: 8 },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('okänd kapacitet (null) ignoreras — väljer bland de kända', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: null },
      { week_start: '2026-08-10', open_hours: 10 },
      { week_start: '2026-08-17', open_hours: null },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('alla okonfigurerade (null) → faller tillbaka på målveckan', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: null },
      { week_start: '2026-08-10', open_hours: null },
      { week_start: '2026-08-17', open_hours: null },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('tom kandidatlista → faller tillbaka på målveckan', () => {
    expect(pickBestWeek([], '2026-08-10')).toBe('2026-08-10')
  })

  test('lika open_hours → närmast målveckan vinner', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 15 },
      { week_start: '2026-08-10', open_hours: 15 },
      { week_start: '2026-08-17', open_hours: 15 },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('endast en kandidat känd (t.ex. föregående vecka) → den väljs oavsett', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 3 },
      { week_start: '2026-08-10', open_hours: null },
      { week_start: '2026-08-17', open_hours: null },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-03')
  })

  test('open_hours=0 räknas som känt (tätbokad vecka) — väljs bara om ingen bättre finns', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 0 },
      { week_start: '2026-08-10', open_hours: 0 },
    ]
    // Lika (båda 0) → närmast målveckan (2026-08-10 = målveckan själv, avstånd 0)
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })
})
