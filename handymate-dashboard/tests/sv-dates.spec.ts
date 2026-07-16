/**
 * TD-3 — facit-test för lib/dates.ts (svensk tidszon-medveten datumhantering).
 * Körs: npx playwright test tests/sv-dates.spec.ts --no-deps
 *
 * Kärnbuggen som motiverar hela modulen: `new Date().toISOString().split('T')[0]`
 * ger UTC-datumet. Sverige är UTC+1/+2, så mellan 22:00/23:00 och midnatt
 * lokal tid pekar UTC-datumet fortfarande på GÅRDAGEN. Testerna nedan
 * bevisar både att buggen finns (dokumentation) och att svDateStr() undviker den.
 */
import { test, expect } from '@playwright/test'
import { svDateStr, svStartOfDay, svDateStrPlusDays, svTimeStr } from '../lib/dates'

test.describe('svDateStr — kärnbuggen (sommartid, CEST)', () => {
  test('22:30 UTC 15 juli = 00:30 lokal tid 16 juli → svDateStr ger MORGONDAGEN, toISOString ger GÅRDAGEN', () => {
    const d = new Date('2026-07-15T22:30:00Z')
    // Detta är HELA anledningen till att modulen finns: naiv UTC-splitting
    // ger fel dag så fort klockan är efter 22:00/23:00 svensk lokal tid.
    expect(d.toISOString().split('T')[0]).toBe('2026-07-15')
    expect(svDateStr(d)).toBe('2026-07-16')
  })
})

test.describe('svDateStr — vintertid (CET)', () => {
  test('23:30 UTC 15 jan = 00:30 lokal tid 16 jan (CET, +1) → svDateStr ger 16 jan', () => {
    const d = new Date('2026-01-15T23:30:00Z')
    expect(d.toISOString().split('T')[0]).toBe('2026-01-15')
    expect(svDateStr(d)).toBe('2026-01-16')
  })
})

test.describe('svDateStr — mitt på dagen (opåverkat av buggen)', () => {
  test('middagstid ger samma datum oavsett metod', () => {
    const d = new Date('2026-07-15T12:00:00Z')
    expect(svDateStr(d)).toBe('2026-07-15')
    expect(d.toISOString().split('T')[0]).toBe('2026-07-15')
  })
})

test.describe('svStartOfDay — roundtrip', () => {
  test('svDateStr(svStartOfDay(x)) === svDateStr(x) för blandade tidpunkter', () => {
    const cases = [
      new Date('2026-07-15T22:30:00Z'), // sommartid, nära midnatt
      new Date('2026-01-15T23:30:00Z'), // vintertid, nära midnatt
      new Date('2026-07-15T12:00:00Z'), // middag
      new Date('2026-03-29T12:00:00Z'), // DST-bytesdag (vår)
      new Date('2026-10-25T22:30:00Z'), // DST-bytesdag (höst)
    ]
    for (const d of cases) {
      expect(svDateStr(svStartOfDay(d))).toBe(svDateStr(d))
    }
  })

  test('svStartOfDay returnerar korrekt UTC-instans för sommar/vintertid', () => {
    // Stockholm 2026-07-16 00:00 CEST (+2) = 2026-07-15T22:00:00Z
    expect(svStartOfDay(new Date('2026-07-15T22:30:00Z')).toISOString()).toBe('2026-07-15T22:00:00.000Z')
    // Stockholm 2026-01-16 00:00 CET (+1) = 2026-01-15T23:00:00Z
    expect(svStartOfDay(new Date('2026-01-15T23:30:00Z')).toISOString()).toBe('2026-01-15T23:00:00.000Z')
  })
})

test.describe('DST-övergångsdagen 2026-03-29 (klockan ställs fram 02:00 → 03:00)', () => {
  test('svDateStr är korrekt både före och efter midnatt lokal tid på bytesdagen', () => {
    // Mitt på bytesdagen: fortfarande 29 mars lokalt
    expect(svDateStr(new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-29')
    // Sent på kvällen bytesdagen: 22:30 UTC = 00:30 CEST (+2, redan bytt) 30 mars
    expect(svDateStr(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30')
  })

  test('svStartOfDay för bytesdagen räknar med att midnatt SJÄLV fortfarande är CET (+1)', () => {
    // Bytet sker kl 02:00 lokal tid samma dag — midnatt (00:00) föregår bytet,
    // så offsetet vid Stockholm-midnatt för 29 mars är fortfarande +1 (CET).
    expect(svStartOfDay(new Date('2026-03-29T12:00:00Z')).toISOString()).toBe('2026-03-28T23:00:00.000Z')
  })
})

test.describe('svDateStrPlusDays — kalenderdag-aritmetik över månads-/årsgränser', () => {
  test('månadsgräns (31 jan → 1 feb)', () => {
    expect(svDateStrPlusDays(1, new Date('2026-01-31T12:00:00Z'))).toBe('2026-02-01')
  })
  test('årsgräns (31 dec → 1 jan)', () => {
    expect(svDateStrPlusDays(1, new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01')
  })
  test('negativt antal dagar (bakåt över månadsgräns)', () => {
    expect(svDateStrPlusDays(-1, new Date('2026-03-01T12:00:00Z'))).toBe('2026-02-28')
  })
  test('0 dagar respekterar svensk lokaldag, inte UTC-dag', () => {
    // Samma "sen kväll lokal tid"-scenario som kärnbuggs-testet ovan.
    expect(svDateStrPlusDays(0, new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
  })
})

test.describe('svTimeStr — HH:MM i svensk lokaltid', () => {
  test('sommartid (CEST, +2)', () => {
    expect(svTimeStr(new Date('2026-07-15T22:30:00Z'))).toBe('00:30')
    expect(svTimeStr(new Date('2026-07-15T12:00:00Z'))).toBe('14:00')
  })
  test('vintertid (CET, +1)', () => {
    expect(svTimeStr(new Date('2026-01-15T23:05:00Z'))).toBe('00:05')
  })
})
