/**
 * Delad omsättningstakt-matematik (2026-08-15), extraherad ur
 * lib/jarvis/next-best-action-goals.ts. Två konsumenter behöver EXAKT
 * samma beräkning: NBA:s LLM-bakgrundskontext (en formaterad mening) och
 * MalBlock.tsx (en siffra i UI) — en delad, ren funktion förhindrar att
 * de tysta glider isär till två olika "sanningar" om samma takt.
 *
 * "En summa är inte en åsikt": procenten räknas här i egen kod, aldrig
 * av en modell eller duplicerad fritt i en komponent.
 */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function dayOfYear(todayIso: string): { year: number; day: number; daysInYear: number } {
  const [y, m, d] = todayIso.split('-').map(Number)
  const startOfYearMs = Date.UTC(y, 0, 1)
  const todayMs = Date.UTC(y, m - 1, d)
  const day = Math.floor((todayMs - startOfYearMs) / 86_400_000) + 1
  return { year: y, day, daysInYear: isLeapYear(y) ? 366 : 365 }
}

export interface RevenuePace {
  year: number
  day: number
  daysInYear: number
  /** Vad som "borde" vara fakturerat vid dagens datum, linjärt över året. */
  paceTargetSek: number
  /** Fakturerat hittills / paceTargetSek, avrundat till närmaste heltal. */
  pacePct: number
}

/**
 * Ren. Ingen I/O. `null` om inget mål är satt eller om målet inte är ett
 * positivt tal — ett osatt/ogiltigt mål ska ALDRIG visas som "mål: 0 kr"
 * (samma ärlighetsprincip som MalBlock.tsx redan följer för andra fält).
 */
export function computeRevenuePace(input: {
  revenueTargetAnnualSek: number | null
  invoicedYtdSek: number
  todayIso: string
}): RevenuePace | null {
  const { revenueTargetAnnualSek, invoicedYtdSek, todayIso } = input
  if (revenueTargetAnnualSek == null || !(revenueTargetAnnualSek > 0)) return null

  const { year, day, daysInYear } = dayOfYear(todayIso)
  const paceTargetSek = revenueTargetAnnualSek * (day / daysInYear)
  const pacePct = paceTargetSek > 0 ? Math.round((invoicedYtdSek / paceTargetSek) * 100) : 0

  return { year, day, daysInYear, paceTargetSek, pacePct }
}
