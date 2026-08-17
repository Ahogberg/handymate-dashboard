/**
 * Beläggnings-aggregatet för "Firman just nu" (Command Center C4, 2026-08-17).
 *
 * REN funktion över redan beräknade veckokapaciteter
 * (lib/capacity/week-capacity.ts) — ingen egen kapacitetsmatte, inga
 * queries. Facit: tests/belaggning.spec.ts.
 *
 * ═══ ÄRLIGHETSREGLERNA ═══
 *
 * - Ingen konfigurerad vecka (varken inställning eller gissningsbar
 *   teamstorlek) → pct null. Raden i UI:t döljs då — aldrig en gissad
 *   procent som ser exakt ut.
 * - Procenten viktas med veckans tillhandahållna timmar. Cap-procenten är
 *   samma inställning för alla veckor i samma business, så
 *   Σ(pct·provided)/Σprovided ≡ Σbokat/Σkapacitet (upp till per-veckans
 *   avrundning) — ett rakt medelvärde av procenttal hade gett fel svar när
 *   veckorna är olika stora.
 * - Överbokning bevaras: aggregat över 100 % klipps INTE här — bara
 *   stapeln i UI:t klipps visuellt.
 * - `configured: false` betyder att minst en vecka vilar på gissningen
 *   40 h × aktiva teammedlemmar (week-capacity:s fallback) — UI:t märker
 *   då siffran som uppskattad.
 */

import type { WeekCapacity } from './week-capacity'
import { isoWeekInfo } from '@/lib/jarvis/monday-brief'

/** Innevarande + två kommande veckor — samma horisont som mockupens rad. */
export const BELAGGNING_VECKOR = 3

export interface BelaggningsSvar {
  /** Viktad beläggning i procent över fönstret. Null = okonfigurerat. */
  pct: number | null
  /** Summan av veckornas öppna (bokningsbara) timmar. Null = okonfigurerat. */
  fria_timmar_nasta_veckor: number | null
  /** False när minst en vecka vilar på fallback-gissningen. */
  configured: boolean
  /** ISO-veckonummer för första/sista veckan i fönstret (för radetiketten). */
  vecka_start: number | null
  vecka_slut: number | null
}

const TOMT: BelaggningsSvar = {
  pct: null,
  fria_timmar_nasta_veckor: null,
  configured: false,
  vecka_start: null,
  vecka_slut: null,
}

export function aggregeraBelaggning(veckor: WeekCapacity[]): BelaggningsSvar {
  const raknbara = veckor.filter(
    v => v.provided_hours != null && v.utilization_pct != null,
  )
  if (raknbara.length === 0) return TOMT

  const viktSumma = raknbara.reduce((s, v) => s + (v.provided_hours as number), 0)
  if (!(viktSumma > 0)) return TOMT

  const pct = Math.round(
    raknbara.reduce(
      (s, v) => s + (v.utilization_pct as number) * (v.provided_hours as number),
      0,
    ) / viktSumma,
  )
  const fria =
    Math.round(raknbara.reduce((s, v) => s + (v.open_hours ?? 0), 0) * 10) / 10

  const sorterade = [...raknbara].sort((a, b) =>
    a.week_start.localeCompare(b.week_start),
  )

  return {
    pct,
    fria_timmar_nasta_veckor: fria,
    configured: raknbara.every(v => v.configured),
    vecka_start: isoWeekInfo(sorterade[0].week_start).isoWeek,
    vecka_slut: isoWeekInfo(sorterade[sorterade.length - 1].week_start).isoWeek,
  }
}
