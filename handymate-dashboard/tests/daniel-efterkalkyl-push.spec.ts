/**
 * Våg 2e (tasks/value-chain-plan.md) — facit-tester för Daniels nya
 * per-jobbtyp-aggregat i den nattliga observations-pipelinen:
 *   - aggregateOutcomesByJobType (lib/efterkalkyl/get-insight.ts)
 *   - computeAtaFrequency by_job_type-breakdown (lib/patterns/
 *     calculators/ata-frequency.ts)
 *
 * Båda är rena funktioner (ingen I/O) — testas direkt utan Supabase-mock.
 * Kärnregeln som testas hårdast: ärlighetströskeln. En jobbtyp med färre
 * än 3 utfall/projekt ska ALDRIG synas i output — Daniel får inte kunna
 * påstå en procentsats han bara sett 1-2 exempel av.
 *
 * Körs: npx playwright test tests/daniel-efterkalkyl-push.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  aggregateOutcomesByJobType,
  type JobTypeEfterkalkylInsight,
} from '../lib/efterkalkyl/get-insight'
import {
  computeAtaFrequency,
  type AtaFrequencySample,
} from '../lib/patterns/calculators/ata-frequency'

// ─────────────────────────────────────────────────────────────────
// aggregateOutcomesByJobType
// ─────────────────────────────────────────────────────────────────

function outcomeRow(
  jobType: string | null,
  hoursDiffPct: number | null,
  amountDiffPct: number | null = null,
  quality: {
    calculationVersion?: number | null
    timeEligible?: boolean
    financialEligible?: boolean
  } = {},
) {
  return {
    job_type: jobType,
    calculation_version: quality.calculationVersion ?? 2,
    time_learning_eligible: quality.timeEligible ?? true,
    financial_learning_eligible: quality.financialEligible ?? true,
    hours_diff_pct: hoursDiffPct,
    amount_diff_pct: amountDiffPct,
  }
}

test.describe('aggregateOutcomesByJobType — ärlighetströskel (MIN_SAMPLE_SIZE=3)', () => {
  test('jobbtyp med 2 utfall → utesluten helt', () => {
    const rows = [outcomeRow('badrum', 10), outcomeRow('badrum', 20)]
    const result = aggregateOutcomesByJobType(rows)
    expect(result).toEqual([])
  })

  test('jobbtyp med exakt 3 utfall → medtagen', () => {
    const rows = [outcomeRow('badrum', 10), outcomeRow('badrum', 20), outcomeRow('badrum', 30)]
    const result = aggregateOutcomesByJobType(rows)
    expect(result.length).toBe(1)
    expect(result[0].job_type).toBe('badrum')
    expect(result[0].count).toBe(3)
    expect(result[0].avg_hours_diff_pct).toBe(20.0) // (10+20+30)/3
  })

  test('4 utfall → medtagen, snitt korrekt avrundat till 1 decimal', () => {
    const rows = [
      outcomeRow('kök', 22.3),
      outcomeRow('kök', 18.7),
      outcomeRow('kök', 25.1),
      outcomeRow('kök', 19.9),
    ]
    const result = aggregateOutcomesByJobType(rows)
    expect(result[0].count).toBe(4)
    // (22.3+18.7+25.1+19.9)/4 = 21.5
    expect(result[0].avg_hours_diff_pct).toBe(21.5)
  })

  test('null job_type ignoreras helt (räknas inte in i någon grupp)', () => {
    const rows = [
      outcomeRow(null, 10),
      outcomeRow(null, 20),
      outcomeRow(null, 30),
      outcomeRow('badrum', 15),
      outcomeRow('badrum', 25),
    ]
    const result = aggregateOutcomesByJobType(rows)
    expect(result).toEqual([]) // badrum har bara 2 giltiga, null-typerna räknas aldrig
  })

  test('rader med hours_diff_pct=null exkluderas ur sample-räkningen (samma princip som aggregatet)', () => {
    const rows = [
      outcomeRow('badrum', 10),
      outcomeRow('badrum', 20),
      outcomeRow('badrum', null), // saknar offererad tid — räknas inte
      outcomeRow('badrum', 30),
    ]
    const result = aggregateOutcomesByJobType(rows)
    expect(result[0].count).toBe(3) // bara de 3 med faktiskt hours_diff_pct
  })

  test('amount_diff_pct null för alla rader i gruppen → avg_amount_diff_pct null (aldrig gissa)', () => {
    const rows = [
      outcomeRow('badrum', 10, null),
      outcomeRow('badrum', 20, null),
      outcomeRow('badrum', 30, null),
    ]
    const result = aggregateOutcomesByJobType(rows)
    expect(result[0].avg_amount_diff_pct).toBeNull()
  })

  test('amount_diff_pct kräver tre finansiellt kvalificerade rader', () => {
    const rows = [
      outcomeRow('badrum', 10, 5),
      outcomeRow('badrum', 20, 15),
      outcomeRow('badrum', 30, null), // saknar belopp — utelämnas ur belopps-snittet
    ]
    const result = aggregateOutcomesByJobType(rows)
    expect(result[0].avg_amount_diff_pct).toBeNull()
  })

  test('legacy och kvalitetsblockerade rader blir aldrig lärdata', () => {
    const rows = [
      outcomeRow('badrum', 10, 5),
      outcomeRow('badrum', 20, 15),
      outcomeRow('badrum', 30, 25),
      outcomeRow('badrum', 999, 999, { calculationVersion: 1 }),
      outcomeRow('badrum', 999, 999, { timeEligible: false }),
    ]
    const result = aggregateOutcomesByJobType(rows)
    expect(result[0].count).toBe(3)
    expect(result[0].financial_count).toBe(3)
    expect(result[0].avg_hours_diff_pct).toBe(20)
    expect(result[0].avg_amount_diff_pct).toBe(15)
  })

  test('flera jobbtyper: sorteras efter störst absolut avvikelse först', () => {
    const rows = [
      outcomeRow('badrum', 5),
      outcomeRow('badrum', 6),
      outcomeRow('badrum', 7), // snitt ~6
      outcomeRow('kök', -25),
      outcomeRow('kök', -22),
      outcomeRow('kök', -24), // snitt ~-23.7 (störst absolutbelopp)
    ]
    const result = aggregateOutcomesByJobType(rows)
    expect(result.map((r: JobTypeEfterkalkylInsight) => r.job_type)).toEqual(['kök', 'badrum'])
  })

  test('tom input → tom array', () => {
    expect(aggregateOutcomesByJobType([])).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────
// computeAtaFrequency — by_job_type-breakdown (Våg 2e)
// ─────────────────────────────────────────────────────────────────

const WINDOW_START = '2025-08-03T00:00:00Z'
const WINDOW_END = '2026-08-03T00:00:00Z'

function ataSample(id: string, ataCount: number, jobType: string | null): AtaFrequencySample {
  return {
    id,
    project_type: null,
    job_type: jobType,
    created_at: '2026-01-01T10:00:00Z',
    ata_count: ataCount,
  }
}

test.describe('computeAtaFrequency — by_job_type-breakdown', () => {
  test('breakdown byggs per jobbtyp, oberoende av project_type', () => {
    const samples: AtaFrequencySample[] = [
      ataSample('p1', 0, 'kök'),
      ataSample('p2', 1, 'kök'),
      ataSample('p3', 1, 'kök'),
      ataSample('p4', 2, 'kök'),
      ataSample('p5', 0, 'kök'),
      ataSample('p6', 0, 'kök'),
      ataSample('p7', 0, 'kök'),
      ataSample('p8', 0, 'kök'),
      ataSample('p9', 0, 'kök'),
      ataSample('p10', 0, 'kök'),
    ]
    const result = computeAtaFrequency(samples, WINDOW_START, WINDOW_END)
    const meta = result.metadata as {
      by_job_type?: Record<string, { total: number; with_ata: number; pct: number }>
    }
    expect(meta.by_job_type).toBeDefined()
    expect(meta.by_job_type!.kök.total).toBe(10)
    expect(meta.by_job_type!.kök.with_ata).toBe(3)
    expect(meta.by_job_type!.kök.pct).toBeCloseTo(0.3, 5)
  })

  test('projekt utan job_type utelämnas ur breakdown men räknas i totalen', () => {
    const samples: AtaFrequencySample[] = [
      ataSample('p1', 1, 'badrum'),
      ataSample('p2', 0, null),
    ]
    const result = computeAtaFrequency(samples, WINDOW_START, WINDOW_END)
    const val = result.value as { total_projects: number }
    expect(val.total_projects).toBe(2)
    const meta = result.metadata as { by_job_type?: Record<string, { total: number }> }
    expect(meta.by_job_type!.badrum.total).toBe(1)
    expect(Object.keys(meta.by_job_type!)).toEqual(['badrum'])
  })

  test('ingen sample har job_type satt → by_job_type utelämnas helt (ej tomt objekt)', () => {
    const samples: AtaFrequencySample[] = [ataSample('p1', 0, null), ataSample('p2', 1, null)]
    const result = computeAtaFrequency(samples, WINDOW_START, WINDOW_END)
    const meta = result.metadata as { by_job_type?: unknown }
    expect(meta.by_job_type).toBeUndefined()
  })

  test('by_project_type och by_job_type samexisterar oberoende av varandra', () => {
    const samples: AtaFrequencySample[] = [
      { id: 'p1', project_type: 'fixed', job_type: 'badrum', created_at: '2026-01-01', ata_count: 1 },
      { id: 'p2', project_type: 'hourly', job_type: 'badrum', created_at: '2026-01-01', ata_count: 0 },
    ]
    const result = computeAtaFrequency(samples, WINDOW_START, WINDOW_END)
    const meta = result.metadata as {
      by_project_type?: Record<string, { total: number }>
      by_job_type?: Record<string, { total: number }>
    }
    expect(meta.by_project_type!.fixed.total).toBe(1)
    expect(meta.by_project_type!.hourly.total).toBe(1)
    expect(meta.by_job_type!.badrum.total).toBe(2)
  })
})
