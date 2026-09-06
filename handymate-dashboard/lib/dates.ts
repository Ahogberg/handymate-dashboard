/**
 * Tidszon-medveten datumhantering — Europe/Stockholm.
 *
 * TD-3 (tasks/tech-debt.md): `new Date().toISOString().split('T')[0]` ger
 * UTC-datumet, INTE svensk lokaltid. Sverige ligger på UTC+1 (vintertid,
 * CET) / UTC+2 (sommartid, CEST). Mellan kl 22:00/23:00 och midnatt svensk
 * lokaltid har UTC-klockan ännu inte passerat midnatt — koden ger då
 * GÅRDAGENS datum i en ruta som ser ut att visa "idag". Bug-magnet för
 * "dagens bokningar", cron-cutoffs och rapporter.
 *
 * `lib/datetime-defaults.ts` har samma bugg i `todayDateStr()` — den filen
 * är deprecated, migrera till denna modul istället.
 *
 * Ingen extern dependency (inget date-fns/luxon) — `Intl.DateTimeFormat`
 * med explicit `timeZone: 'Europe/Stockholm'` räcker och är inbyggt i
 * Node/V8, vilket fungerar identiskt oavsett om koden körs på Vercel
 * (UTC) eller en lokal dev-maskin (CET/CEST).
 */

const TZ = 'Europe/Stockholm'

// hourCycle: 'h23' är avsiktligt — 'hour12: false' ensamt kan i vissa
// ICU-versioner formattera midnatt som "24" istället för "00", vilket
// skulle ge en trasig HH:MM-sträng.
const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface SvParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Bryter ut Y/M/D/H/M/S (som siffror) för ett Date i svensk lokaltid. */
function svParts(d: Date): SvParts {
  const parts = DATE_PARTS_FORMATTER.formatToParts(d)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  }
}

/** YYYY-MM-DD i svensk lokaltid (Europe/Stockholm) för ett givet Date (default nu). */
export function svDateStr(d: Date = new Date()): string {
  const { year, month, day } = svParts(d)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Start på svensk lokaldag (00:00 Europe/Stockholm) som Date (UTC-instans).
 *
 * Kan INTE bara göra `new Date(svDateStr(d) + 'T00:00:00')` — den strängen
 * tolkas som lokal tid på SERVERN (UTC på Vercel), inte svensk tid, vilket
 * återintroducerar exakt samma bugg en nivå ner.
 *
 * Metod: Stockholms UTC-offset (+1h eller +2h) beror bara på VILKEN DAG
 * det är, inte på tid-på-dygnet (DST-bytet sker kl 02–03 lokal tid, aldrig
 * vid midnatt) — så vi kan slå upp offsetet genom att formattera en
 * gissning (UTC-midnatt för samma kalenderdag) i svensk tid och läsa ut
 * timdifferensen, och sedan applicera det offsetet exakt. Robust över
 * DST-gränser eftersom offsetet läses av verklig Intl-formattering,
 * aldrig antas som ett fast tal.
 */
export function svStartOfDay(d: Date = new Date()): Date {
  const { year, month, day } = svParts(d)
  const guessUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
  // Formattera gissningen i svensk tid — timmen AVSLÖJAR offsetet direkt
  // (UTC-midnatt visas som 01:00 vid CET, 02:00 vid CEST).
  const { hour: guessHourInSv, day: guessDaySv } = svParts(new Date(guessUtcMs))
  // guessDaySv ska alltid vara samma dag (offset < 24h), men beräkna ändå
  // via faktisk dag-diff för att vara robust mot exotiska edge-cases.
  const dayDiff = guessDaySv - day
  const offsetHours = guessHourInSv + dayDiff * 24
  return new Date(guessUtcMs - offsetHours * 3600_000)
}

/** YYYY-MM-DD för svensk lokaldag N dagar från d (kalenderdag-aritmetik, DST-säker). */
export function svDateStrPlusDays(days: number, from: Date = new Date()): string {
  const { year, month, day } = svParts(from)
  // Räkna på kalenderdatumet direkt (Y-M-D ankrat till UTC internt) — inga
  // klock-/DST-frågor uppstår eftersom vi aldrig rör tid-på-dygnet, bara
  // kalenderdagen. JS Date normaliserar månads-/årsgränser automatiskt.
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86400_000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Klockslag HH:MM i svensk lokaltid. */
export function svTimeStr(d: Date = new Date()): string {
  const { hour, minute } = svParts(d)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * UTC-offset för Europe/Stockholm på ett kalenderdatum, som "+02:00"/"+01:00".
 * DST-säker: läses av svStartOfDay (verklig Intl-formattering), aldrig antagen.
 * Offsetet beror bara på dagen — bytet sker kl 02–03 lokal tid, aldrig vid midnatt.
 */
export function svOffsetForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcMidnight = Date.UTC(y, m - 1, d)
  // Middag UTC ligger säkert inom samma svenska kalenderdag.
  const localMidnight = svStartOfDay(new Date(utcMidnight + 12 * 3600_000)).getTime()
  const offsetMin = Math.round((utcMidnight - localMidnight) / 60_000)
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

const NAIV_LOKALTID = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?(\.\d+)?$/

/**
 * Naiv "YYYY-MM-DDTHH:MM[:SS]" från ett formulär betyder svensk lokaltid.
 * Utan offset tolkar Postgres (timestamptz, session UTC) strängen som UTC och
 * 08:00 blir 10:00 (driftfynd F08, PR #16). Här stämplas Stockholm-offsetet på.
 * Strängar som redan bär Z eller offset returneras orörda; annat skräp också
 * (valideringen längre ned avgör).
 */
export function svNaiveToIso(value: string): string {
  const m = NAIV_LOKALTID.exec((value || '').trim())
  if (!m) return value
  return `${m[1]}T${m[2]}${m[3] ?? ':00'}${svOffsetForDate(m[1])}`
}

/** YYYY-MM-DD + N kalenderdagar, ren strängaritmetik utan klocka. */
export function svDatePlusDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86400_000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

/**
 * Halvöppet intervall [from, toExclusive) i svensk tid för ett kalenderspann.
 * "2026-08-31".."2026-09-06" ⇒ från måndag 00:00 till OCH MED söndag 23:59:59
 * — jämfört mot datumsträngen "2026-09-06" (= midnatt) föll söndagens poster
 * bort (driftfynd F09, PR #16).
 */
export function svDayRange(startDate: string, endDate: string): { from: string; toExclusive: string } {
  return {
    from: svNaiveToIso(`${startDate}T00:00:00`),
    toExclusive: svNaiveToIso(`${svDatePlusDays(endDate, 1)}T00:00:00`),
  }
}
