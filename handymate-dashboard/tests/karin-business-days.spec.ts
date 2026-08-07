/**
 * Facit för svenska helgdagar och vardagsförskjutning (2026-08-07).
 *
 * Hela bolagskalendern vilar på den här filen. Räknar den fel blir VARJE
 * deadline fel — och en felaktig deadline är värre än ingen deadline alls.
 *
 * Påskdatumen nedan är kontrollerade mot kalender, inte mot vår egen kod.
 * Ett test som bara jämför implementationen med sig själv bevisar ingenting.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/karin-business-days.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  dateStr,
  ymd,
  easterSunday,
  swedishHolidays,
  isNonBusinessDay,
  nextBusinessDay,
  lastDayOfMonth,
  daysBetween,
} from '../lib/karin/business-days'

test.describe('påskdagen — fyra helgdagar hänger på den', () => {
  test('kända påskdagar stämmer', () => {
    // Kontrollerade mot kalender.
    const facit: Record<number, string> = {
      2024: '2024-03-31',
      2025: '2025-04-20',
      2026: '2026-04-05',
      2027: '2027-03-28',
      2028: '2028-04-16',
      2029: '2029-04-01',
      2030: '2030-04-21',
    }
    for (const [ar, datum] of Object.entries(facit)) {
      expect(dateStr(easterSunday(Number(ar))), `påsk ${ar}`).toBe(datum)
    }
  })

  test('påskdagen infaller alltid på en söndag', () => {
    for (let ar = 2024; ar <= 2040; ar++) {
      expect(easterSunday(ar).getDay(), `påsk ${ar} är inte söndag`).toBe(0)
    }
  })
})

test.describe('helgdagarna', () => {
  test('de rörliga räknas fram, inte hårdkodas', () => {
    // 2026: påsk 5 april → långfredag 3 april, annandag 6 april,
    // Kristi himmelsfärd 14 maj, pingstdagen 24 maj.
    const h = swedishHolidays(2026)
    for (const d of ['2026-04-03', '2026-04-05', '2026-04-06', '2026-05-14', '2026-05-24']) {
      expect(h.has(d), `${d} saknas`).toBe(true)
    }
  })

  test('de fasta finns med', () => {
    const h = swedishHolidays(2026)
    for (const d of ['2026-01-01', '2026-01-06', '2026-05-01', '2026-06-06', '2026-12-25', '2026-12-26']) {
      expect(h.has(d), `${d} saknas`).toBe(true)
    }
  })

  test('midsommardagen är lördagen mellan 20 och 26 juni', () => {
    for (let ar = 2024; ar <= 2035; ar++) {
      const midsommar = Array.from(swedishHolidays(ar))
        .map(s => new Date(s + 'T12:00:00'))
        .filter(d => d.getMonth() === 5 && d.getDate() >= 20 && d.getDate() <= 26 && d.getDay() === 6)
      expect(midsommar.length, `midsommardagen ${ar}`).toBe(1)
    }
  })

  test('alla helgons dag är lördagen mellan 31 oktober och 6 november', () => {
    for (let ar = 2024; ar <= 2035; ar++) {
      const alla = Array.from(swedishHolidays(ar))
        .map(s => new Date(s + 'T12:00:00'))
        .filter(d =>
          d.getDay() === 6 &&
          ((d.getMonth() === 9 && d.getDate() === 31) || (d.getMonth() === 10 && d.getDate() <= 6)))
      expect(alla.length, `alla helgons dag ${ar}`).toBe(1)
    }
  })

  test('jul- och nyårsafton räknas som stängda', () => {
    // Formellt inte helgdagar, men en kalender som säger "betala på julafton"
    // har fel i praktiken även om den har rätt i juridiken.
    const h = swedishHolidays(2026)
    expect(h.has('2026-12-24')).toBe(true)
    expect(h.has('2026-12-31')).toBe(true)
  })

  test('en vanlig onsdag är ingen helgdag', () => {
    // Vakt mot att listan sväller och gör halva året stängt.
    expect(swedishHolidays(2026).has('2026-08-12')).toBe(false)
  })
})

test.describe('FÖRSKJUTNINGEN — den som avgör varje deadline', () => {
  test('en vardag flyttas inte', () => {
    // 12 augusti 2026 är en onsdag.
    expect(dateStr(nextBusinessDay(ymd(2026, 8, 12)))).toBe('2026-08-12')
  })

  test('lördag flyttas till måndag', () => {
    // 12 september 2026 är en lördag.
    expect(ymd(2026, 9, 12).getDay()).toBe(6)
    expect(dateStr(nextBusinessDay(ymd(2026, 9, 12)))).toBe('2026-09-14')
  })

  test('söndag flyttas till måndag', () => {
    // 12 juli 2026 är en söndag.
    expect(ymd(2026, 7, 12).getDay()).toBe(0)
    expect(dateStr(nextBusinessDay(ymd(2026, 7, 12)))).toBe('2026-07-13')
  })

  test('förskjutningen går FRAMÅT, aldrig bakåt', () => {
    // Bakåt hade gjort kalendern strängare än lagen — ett eget slags osanning.
    for (let m = 1; m <= 12; m++) {
      for (const dag of [1, 12, 17, 26, 28]) {
        const original = ymd(2026, m, dag)
        expect(nextBusinessDay(original).getTime(), `${dateStr(original)}`).toBeGreaterThanOrEqual(original.getTime())
      }
    }
  })

  test('resultatet är ALLTID en vardag', () => {
    // Den enda invarianten som verkligen räknas.
    for (let m = 1; m <= 12; m++) {
      for (let dag = 1; dag <= 28; dag++) {
        const flyttad = nextBusinessDay(ymd(2026, m, dag))
        expect(isNonBusinessDay(flyttad), `${dateStr(ymd(2026, m, dag))} → ${dateStr(flyttad)}`).toBe(false)
      }
    }
  })

  test('påskhelgen hoppas över i sin helhet', () => {
    // 2026: långfredag 3 april (fre) → påskdagen → annandag 6 april (mån)
    // → nästa vardag är tisdag 7 april.
    expect(dateStr(nextBusinessDay(ymd(2026, 4, 3)))).toBe('2026-04-07')
  })

  test('nyårshelgen hoppas över', () => {
    // 31 dec 2026 (tors, stängd) → 1 jan (fre, nyårsdagen) → helg → mån 4 jan.
    expect(dateStr(nextBusinessDay(ymd(2026, 12, 31)))).toBe('2027-01-04')
  })

  test('förskjutning över årsskiftet använder rätt års helgdagar', () => {
    // Lätt att få fel: helgdagslistan slås upp per år, och en förskjutning
    // från december in i januari byter år mitt i loopen.
    const ut = nextBusinessDay(ymd(2026, 12, 25))
    expect(ut.getFullYear()).toBe(2026)
    expect(isNonBusinessDay(ut)).toBe(false)
  })
})

test.describe('räkenskapsårets slut', () => {
  test('sista dagen i månaden', () => {
    expect(dateStr(lastDayOfMonth(2026, 12))).toBe('2026-12-31')
    expect(dateStr(lastDayOfMonth(2026, 4))).toBe('2026-04-30')
    expect(dateStr(lastDayOfMonth(2026, 2))).toBe('2026-02-28')
  })

  test('skottår', () => {
    expect(dateStr(lastDayOfMonth(2028, 2))).toBe('2028-02-29')
  })
})

test.describe('dagar mellan', () => {
  test('räknar hela dagar oavsett klockslag', () => {
    expect(daysBetween(ymd(2026, 8, 7), ymd(2026, 8, 12))).toBe(5)
    expect(daysBetween(ymd(2026, 8, 12), ymd(2026, 8, 7))).toBe(-5)
    expect(daysBetween(ymd(2026, 8, 7), ymd(2026, 8, 7))).toBe(0)
  })

  test('över månads- och årsskifte', () => {
    expect(daysBetween(ymd(2026, 12, 28), ymd(2027, 1, 4))).toBe(7)
  })
})
