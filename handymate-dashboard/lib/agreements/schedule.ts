/**
 * Serviceavtal — rena, testbara kärnfunktioner för seriedriften.
 * Facit-tester: tests/serviceavtal.spec.ts. Mönster: lib/capacity/week-capacity.ts
 * (ren beräkning separerad från Supabase-fetchen som anropar den).
 */

// ─────────────────────────────────────────────────────────────────
// Nästa-besöks-beräkning — interval_months över månads-/årsskiften
// ─────────────────────────────────────────────────────────────────

/**
 * Lägger till N kalendermånader på ett YYYY-MM-DD-datum. Hanterar
 * "kortare målmånad"-overflow (31 jan + 1 månad ska bli 28/29 feb — INTE
 * naivt 3 mars som ett dumt dag-tillägg skulle ge) genom att klamma dagen
 * till målmånadens faktiska längd. Ren kalenderdag-aritmetik (UTC-ankrad
 * Date används bara som räknemaskin, aldrig som en verklig tidpunkt) —
 * samma teknik som svDateStrPlusDays i lib/dates.ts.
 */
export function addIntervalMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const targetMonthIndex = m - 1 + months // 0-baserat; Date.UTC normaliserar årsöverskridningar
  const daysInTargetMonth = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate()
  const clampedDay = Math.min(d, daysInTargetMonth)
  const result = new Date(Date.UTC(y, targetMonthIndex, clampedDay))
  const ry = result.getUTCFullYear()
  const rm = String(result.getUTCMonth() + 1).padStart(2, '0')
  const rd = String(result.getUTCDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`
}

// ─────────────────────────────────────────────────────────────────
// Veckoval — Lars-cronens kapacitetsmedvetna placering
// ─────────────────────────────────────────────────────────────────

export interface WeekCapacityCandidate {
  week_start: string
  /** null = okonfigurerad kapacitet för den veckan — kandidaten ignoreras. */
  open_hours: number | null
}

function parseYmd(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number)
  return [y, m - 1, d]
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parseYmd(a)
  const [by, bm, bd] = parseYmd(b)
  return (Date.UTC(ay, am, ad) - Date.UTC(by, bm, bd)) / 86_400_000
}

/**
 * Väljer bästa veckan bland kandidaterna (normalt målvecka ±1 vecka) för
 * att boka ett serviceavtalsbesök — föredrar den TUNNASTE veckan (mest
 * `open_hours`), enligt spec-regeln "föredra tunn vecka". Ren data in,
 * rent val ut — inga sidoeffekter, inget nätverk.
 *
 * Regler:
 *  - Kandidater med open_hours=null (okonfigurerad kapacitet) ignoreras —
 *    vi gissar aldrig en placering på en okänd siffra.
 *  - Om ALLA kandidater saknar känd kapacitet: falla tillbaka på
 *    targetWeekStart oavsett (cronens fallback-mekanism tar över därifrån)
 *    — aldrig fastna helt utan svar.
 *  - Vid lika open_hours: närmast targetWeekStart vinner.
 */
export function pickBestWeek(candidates: WeekCapacityCandidate[], targetWeekStart: string): string {
  const known = candidates.filter((c): c is { week_start: string; open_hours: number } => c.open_hours != null)
  if (known.length === 0) return targetWeekStart

  let best = known[0]
  let bestDist = Math.abs(daysBetween(best.week_start, targetWeekStart))
  for (const c of known.slice(1)) {
    const dist = Math.abs(daysBetween(c.week_start, targetWeekStart))
    if (c.open_hours > best.open_hours || (c.open_hours === best.open_hours && dist < bestDist)) {
      best = c
      bestDist = dist
    }
  }
  return best.week_start
}
