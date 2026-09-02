/**
 * Låsregeln för byggdagboken (Etapp D3, 2026-09-02).
 *
 * En rad bevisar sitt värde vid en tvist genom att INTE gå att skriva om i
 * efterhand — bara genom att en tilläggsanteckning (`addendum`) kan läggas
 * till, med tidsstämpel, ovanpå originalet. Låsningen är därför BERÄKNAD,
 * inte en enda kolumn: en rad är låst så fort NÅGOT av dessa är sant:
 *
 *   1. attested_at är satt   — ägaren/behörig har attesterat raden.
 *   2. locked_at är satt     — manuellt låst (utan attest).
 *   3. date är äldre än DIARY_LOCK_AFTER_DAYS dagar — "det är för sent att
 *      minnas fel", samma resonemang som bokföringens periodstängning.
 *
 * Ordningen attested > manual > age avgör bara VILKEN ANLEDNING som visas
 * i UI:t (en attesterad rad ska aldrig säga "8 dagar gammal" i badgen) —
 * den påverkar inte OM raden är låst.
 */

export const DIARY_LOCK_AFTER_DAYS = 7

export interface DiaryLockableRow {
  date: string
  locked_at?: string | null
  attested_at?: string | null
}

export type DiaryLockReason = 'attested' | 'manual' | 'age' | null

/** Dagar mellan två YYYY-MM-DD-datum, jämfört på DATUMNIVÅ (ingen tidszon,
 * ingen klockslagsdrift) — `today` trunkeras till sin lokala kalenderdag. */
function daysSince(dateStr: string, today: Date): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const rowUtc = Date.UTC(y, (m || 1) - 1, d || 1)

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())

  return Math.round((todayUtc - rowUtc) / (24 * 60 * 60 * 1000))
}

export function lockReason(row: DiaryLockableRow, today: Date = new Date()): DiaryLockReason {
  if (row.attested_at) return 'attested'
  if (row.locked_at) return 'manual'
  if (daysSince(row.date, today) > DIARY_LOCK_AFTER_DAYS) return 'age'
  return null
}

export function isDiaryRowLocked(row: DiaryLockableRow, today: Date = new Date()): boolean {
  return lockReason(row, today) !== null
}
