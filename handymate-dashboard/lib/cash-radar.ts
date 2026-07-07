/**
 * Pengar in-radarn — ren, deterministisk projektionsmotor (spec:
 * tasks/cash-radar-spec.md). INFLÖDEN endast. Tre siffror hålls isär:
 * fakturerat (åtagande) / viktad potential / normal (historisk median).
 */
export const STAGE_WEIGHTS: Record<string, number> = {
  quote_accepted: 0.9,
  quote_sent: 0.35,
  contacted: 0.15,
  new_inquiry: 0.15,
}
/** Stage-schablon när expected_close_date saknas (veckor framåt). */
const STAGE_HORIZON_WEEKS: Record<string, number> = {
  quote_accepted: 1, quote_sent: 2, contacted: 3, new_inquiry: 3,
}
export const DIP_THRESHOLD = 0.6
export const MIN_HISTORY_WEEKS = 4
export const RADAR_WEEKS = 5

export function medianDelayDays(rows: { due_date: string; paid_at: string }[]): number {
  const delays = rows
    .map(r => Math.round((new Date(r.paid_at).getTime() - new Date(r.due_date).getTime()) / 86_400_000))
    .filter(d => isFinite(d))
    .sort((a, b) => a - b)
  if (delays.length < 3) return 0 // för lite data → gissa inte
  const mid = Math.floor(delays.length / 2)
  return delays.length % 2 ? delays[mid] : Math.round((delays[mid - 1] + delays[mid]) / 2)
}

/** Måndag som veckostart, ISO-datum (sv-SE-vecka). */
export function bucketWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (x.getUTCDay() + 6) % 7 // mån=0 ... sön=6
  x.setUTCDate(x.getUTCDate() - dow)
  return x.toISOString().slice(0, 10)
}

export interface RadarWeek { week_start: string; invoiced_kr: number; potential_kr: number }

export function projectInflows(input: {
  unpaidInvoices: { invoice_id: string; total: number; due_date: string | null }[]
  openDeals: { id: string; value: number; stageSlug: string; expected_close_date: string | null }[]
  medianDelay: number
  nowMs: number
}): RadarWeek[] {
  const start = bucketWeekStart(new Date(input.nowMs))
  const weeks: RadarWeek[] = Array.from({ length: RADAR_WEEKS }, (_, i) => {
    const d = new Date(start + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i * 7)
    return { week_start: d.toISOString().slice(0, 10), invoiced_kr: 0, potential_kr: 0 }
  })
  const index = new Map(weeks.map((w, i) => [w.week_start, i]))
  const clampWeek = (iso: string): string => {
    // Före fönstret (förfallet) → innevarande vecka; efter fönstret → utanför (ignoreras)
    if (iso < weeks[0].week_start) return weeks[0].week_start
    return iso
  }
  for (const inv of input.unpaidInvoices) {
    if (!inv.due_date || !(Number(inv.total) > 0)) continue
    const expected = new Date(inv.due_date + 'T00:00:00Z')
    expected.setUTCDate(expected.getUTCDate() + input.medianDelay)
    const w = clampWeek(bucketWeekStart(expected))
    const i = index.get(w)
    if (i !== undefined) weeks[i].invoiced_kr += Math.round(Number(inv.total))
  }
  for (const deal of input.openDeals) {
    const weight = STAGE_WEIGHTS[deal.stageSlug]
    if (!weight || !(Number(deal.value) > 0)) continue
    let expected: Date
    if (deal.expected_close_date) {
      expected = new Date(deal.expected_close_date + 'T00:00:00Z')
    } else {
      expected = new Date(input.nowMs)
      expected.setUTCDate(expected.getUTCDate() + (STAGE_HORIZON_WEEKS[deal.stageSlug] ?? 3) * 7)
    }
    const w = clampWeek(bucketWeekStart(expected))
    const i = index.get(w)
    if (i !== undefined) weeks[i].potential_kr += Math.round(Number(deal.value) * weight)
  }
  return weeks
}

export function weeklyNormal(
  paidRows: { paid_at: string; total: number }[],
  nowMs: number
): { ready: boolean; normal_kr: number } {
  const sums = new Map<string, number>()
  const cutoff = nowMs - 12 * 7 * 86_400_000
  for (const r of paidRows) {
    const t = new Date(r.paid_at).getTime()
    if (!isFinite(t) || t < cutoff || t > nowMs) continue
    const w = bucketWeekStart(new Date(t))
    sums.set(w, (sums.get(w) || 0) + Math.round(Number(r.total) || 0))
  }
  const values = Array.from(sums.values()).sort((a, b) => a - b)
  if (values.length < MIN_HISTORY_WEEKS) return { ready: false, normal_kr: 0 }
  const mid = Math.floor(values.length / 2)
  const normal = values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2)
  return { ready: true, normal_kr: normal }
}

export interface RadarDip { week_start: string; expected_kr: number }

export function detectDips(weeks: RadarWeek[], normalKr: number): RadarDip[] {
  if (!(normalKr > 0)) return []
  return weeks
    .filter(w => w.invoiced_kr + w.potential_kr < normalKr * DIP_THRESHOLD)
    .map(w => ({ week_start: w.week_start, expected_kr: w.invoiced_kr + w.potential_kr }))
}
