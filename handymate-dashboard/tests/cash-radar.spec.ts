/**
 * Pengar in-radarn — enhetstester för den rena projektionsmotorn.
 * Körs: npx playwright test tests/cash-radar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  medianDelayDays, bucketWeekStart, projectInflows, weeklyNormal, detectDips,
  STAGE_WEIGHTS, DIP_THRESHOLD, MIN_HISTORY_WEEKS,
} from '../lib/cash-radar'

const NOW = new Date('2026-07-06T09:00:00Z').getTime() // måndag

test.describe('medianDelayDays', () => {
  test('median av förseningar (udda antal)', () => {
    expect(medianDelayDays([
      { due_date: '2026-06-01', paid_at: '2026-06-04' }, // +3
      { due_date: '2026-06-01', paid_at: '2026-06-11' }, // +10
      { due_date: '2026-06-01', paid_at: '2026-06-01' }, // 0
    ])).toBe(3)
  })
  test('<3 datapunkter → 0 (ingen gissning)', () => {
    expect(medianDelayDays([{ due_date: '2026-06-01', paid_at: '2026-06-09' }])).toBe(0)
    expect(medianDelayDays([])).toBe(0)
  })
  test('negativ försening (betald i förtid) sänker medianen men golvas ej', () => {
    expect(medianDelayDays([
      { due_date: '2026-06-10', paid_at: '2026-06-05' }, // -5
      { due_date: '2026-06-10', paid_at: '2026-06-10' }, // 0
      { due_date: '2026-06-10', paid_at: '2026-06-15' }, // +5
    ])).toBe(0)
  })
})

test.describe('bucketWeekStart', () => {
  test('måndag är veckans start (sv-SE)', () => {
    expect(bucketWeekStart(new Date('2026-07-08'))).toBe('2026-07-06') // ons → mån
    expect(bucketWeekStart(new Date('2026-07-06'))).toBe('2026-07-06') // mån → samma
    expect(bucketWeekStart(new Date('2026-07-12'))).toBe('2026-07-06') // sön → föreg. mån
  })
})

test.describe('projectInflows', () => {
  test('faktura hamnar i vecka = due_date + medianförsening; potential viktas', () => {
    const weeks = projectInflows({
      unpaidInvoices: [{ invoice_id: 'i1', total: 10000, due_date: '2026-07-08' }],
      openDeals: [{ id: 'd1', value: 20000, stageSlug: 'quote_sent', expected_close_date: '2026-07-15' }],
      medianDelay: 7,
      nowMs: NOW,
    })
    const w2 = weeks.find(w => w.week_start === '2026-07-13') // 8/7 + 7d = 15/7 → v. 13/7
    expect(w2?.invoiced_kr).toBe(10000)
    const w2pot = weeks.find(w => w.week_start === '2026-07-13')
    expect(w2pot?.potential_kr).toBe(20000 * STAGE_WEIGHTS.quote_sent)
  })
  test('förfallen faktura (due+delay i dåtid) läggs i innevarande vecka', () => {
    const weeks = projectInflows({
      unpaidInvoices: [{ invoice_id: 'i1', total: 5000, due_date: '2026-06-01' }],
      openDeals: [], medianDelay: 0, nowMs: NOW,
    })
    expect(weeks[0].week_start).toBe('2026-07-06')
    expect(weeks[0].invoiced_kr).toBe(5000)
  })
  test('deal utanför 5-veckorsfönstret ignoreras; won/lost skickas aldrig in', () => {
    const weeks = projectInflows({
      unpaidInvoices: [],
      openDeals: [{ id: 'd1', value: 9999, stageSlug: 'quote_sent', expected_close_date: '2026-12-01' }],
      medianDelay: 0, nowMs: NOW,
    })
    expect(weeks.every(w => w.potential_kr === 0)).toBe(true)
    expect(weeks).toHaveLength(5)
  })
  test('deal utan expected_close_date → stage-schablon (quote_accepted +1v)', () => {
    const weeks = projectInflows({
      unpaidInvoices: [],
      openDeals: [{ id: 'd1', value: 10000, stageSlug: 'quote_accepted', expected_close_date: null }],
      medianDelay: 0, nowMs: NOW,
    })
    expect(weeks[1].potential_kr).toBe(10000 * STAGE_WEIGHTS.quote_accepted)
  })
})

test.describe('weeklyNormal + detectDips + cold start', () => {
  const paid = (week: string, kr: number) => ({ paid_at: week, total: kr })
  test('normal = median av veckosummor', () => {
    const n = weeklyNormal([
      paid('2026-06-01', 40000), paid('2026-06-08', 50000),
      paid('2026-06-15', 45000), paid('2026-06-22', 60000),
    ], NOW)
    expect(n.ready).toBe(true)
    expect(n.normal_kr).toBe(47500)
  })
  test('cold start: <MIN_HISTORY_WEEKS veckor med inbetalning → ready:false', () => {
    const n = weeklyNormal([paid('2026-06-22', 60000)], NOW)
    expect(n.ready).toBe(false)
    expect(MIN_HISTORY_WEEKS).toBe(4)
  })
  test('dipp när vecka < 60% av normal; ej dipp annars', () => {
    const weeks = [
      { week_start: '2026-07-06', invoiced_kr: 10000, potential_kr: 5000 },  // 15k < 27k → dipp
      { week_start: '2026-07-13', invoiced_kr: 40000, potential_kr: 0 },     // 40k ≥ 27k → ok
    ]
    const dips = detectDips(weeks, 45000)
    expect(DIP_THRESHOLD).toBe(0.6)
    expect(dips.map(d => d.week_start)).toEqual(['2026-07-06'])
  })
})
