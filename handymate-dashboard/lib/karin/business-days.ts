/**
 * Svenska helgdagar och förskjutning till nästa vardag (2026-08-07).
 *
 * ═══ VARFÖR DEN HÄR FILEN ÄR FÖRST ═══
 *
 * Hela bolagskalendern vilar på den. Skatteverkets regel är att om ett
 * förfallodatum infaller på en lördag, söndag eller helgdag flyttas det till
 * **nästa vardag**. Räknar vi fel här blir varje deadline fel — och en
 * felaktig deadline är värre än ingen deadline alls. Förseningsavgiften är
 * 625 kr första gången, men skadan är att hantverkaren slutar lita på Karin.
 *
 * ═══ VARFÖR RÖRLIGA HELGDAGAR RÄKNAS, INTE HÅRDKODAS ═══
 *
 * Påsk styr fyra helgdagar (långfredag, annandag påsk, Kristi himmelsfärd,
 * pingstdagen) och flyttar sig varje år. En hårdkodad lista hade tyst blivit
 * fel vid nästa årsskifte — och ingen hade märkt det förrän en kund missat
 * en inbetalning. Gauss påskformel är exakt och gäller alla år i gregoriansk
 * kalender.
 *
 * Midsommar-, alla helgons- och nationaldagsreglerna är också rörliga och
 * räknas fram, inte listas.
 *
 * Rena funktioner — tests/karin-business-days.spec.ts.
 */

/** Datum som `YYYY-MM-DD` i lokal tid — aldrig via toISOString (den är UTC). */
export function dateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Bygger ett datum utan tidzonsdrift. Månad är 1-baserad här, till skillnad från Date. */
export function ymd(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

/**
 * Påskdagen enligt Gauss/Meeus anonyma algoritm (gregoriansk kalender).
 *
 * Exakt för alla år vi bryr oss om. Fyra svenska helgdagar hänger på den, så
 * den är värd sin egen funktion och sina egna tester.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(year, month, day)
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Första veckodagen (0=sön … 6=lör) på eller efter ett datum. */
function onOrAfter(from: Date, weekday: number): Date {
  const out = new Date(from)
  while (out.getDay() !== weekday) out.setDate(out.getDate() + 1)
  return out
}

/**
 * Alla svenska helgdagar ett givet år, som `YYYY-MM-DD`.
 *
 * Röda dagar enligt lagen (1989:253) om allmänna helgdagar. Midsommarafton,
 * julafton och nyårsafton är formellt INTE helgdagar — men Skatteverket
 * behandlar dem som stängda dagar i sina inbetalningsregler, och en kalender
 * som säger "betala på julafton" är fel i praktiken även om den har rätt i
 * juridiken. De räknas därför med.
 */
export function swedishHolidays(year: number): Set<string> {
  const easter = easterSunday(year)

  const dagar: Date[] = [
    ymd(year, 1, 1),                    // Nyårsdagen
    ymd(year, 1, 6),                    // Trettondedag jul
    addDays(easter, -2),                // Långfredagen
    easter,                             // Påskdagen
    addDays(easter, 1),                 // Annandag påsk
    ymd(year, 5, 1),                    // Första maj
    addDays(easter, 39),                // Kristi himmelsfärdsdag
    addDays(easter, 49),                // Pingstdagen
    ymd(year, 6, 6),                    // Sveriges nationaldag
    // Midsommardagen: lördagen mellan 20 och 26 juni.
    onOrAfter(ymd(year, 6, 20), 6),
    // Midsommarafton: fredagen före. Stängd dag i praktiken.
    addDays(onOrAfter(ymd(year, 6, 20), 6), -1),
    // Alla helgons dag: lördagen mellan 31 oktober och 6 november.
    onOrAfter(ymd(year, 10, 31), 6),
    ymd(year, 12, 24),                  // Julafton — stängd i praktiken
    ymd(year, 12, 25),                  // Juldagen
    ymd(year, 12, 26),                  // Annandag jul
    ymd(year, 12, 31),                  // Nyårsafton — stängd i praktiken
  ]

  return new Set(dagar.map(dateStr))
}

/** Lördag, söndag eller helgdag? */
export function isNonBusinessDay(d: Date): boolean {
  const wd = d.getDay()
  if (wd === 0 || wd === 6) return true
  return swedishHolidays(d.getFullYear()).has(dateStr(d))
}

/**
 * Förskjuter ett förfallodatum FRAMÅT till nästa vardag.
 *
 * Skatteverkets regel: infaller sista dagen på en helg eller helgdag gäller
 * nästa vardag. Framåt, aldrig bakåt — en deadline som flyttas bakåt hade
 * gjort kalendern strängare än lagen, vilket är ett eget slags osanning.
 *
 * Loopen är hårt bunden till 14 steg. Sveriges längsta sammanhängande
 * stängning är påsken (fyra dagar); fjorton är alltså gott om marginal och
 * skyddar mot en oändlig loop om helgdagslistan någon gång blir felaktig.
 */
export function nextBusinessDay(d: Date): Date {
  let out = new Date(d)
  for (let i = 0; i < 14 && isNonBusinessDay(out); i++) {
    out = addDays(out, 1)
  }
  return out
}

/**
 * Sista dagen i en månad. `month` är 1-baserad.
 *
 * Används för räkenskapsårets slut: profilen bär bara slutmånaden, eftersom
 * ett räkenskapsår alltid slutar den sista i månaden.
 */
export function lastDayOfMonth(year: number, month: number): Date {
  return ymd(year, month + 1, 0)
}

/** Antal hela dagar mellan två datum, positivt när `to` ligger senare. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}
