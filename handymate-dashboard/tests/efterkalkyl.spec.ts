/**
 * Motor 1 (Lärande prissättning) — facit-tester för efterkalkylens rena
 * beräkningskärna. Körs: npx playwright test tests/efterkalkyl.spec.ts --no-deps
 *
 * Testar computeOutcomeDiffs + buildProjectOutcomeRow (lib/efterkalkyl/
 * freeze-outcome.ts) — ingen DB. Kärnregler (ärlighetsprincipen):
 *   - quotedHours saknas/0 → hours_diff_pct null (aldrig "0 %").
 *   - actualTotalKr null (arbetskostnad ej konfigurerad) → amount_diff_pct null.
 *   - Diffar avrundas till 1 decimal.
 *   - Utan kopplad offert (budget null) → alla quoted_*-fält och diffar null.
 */
import { test, expect } from '@playwright/test'
import {
  computeOutcomeDiffs,
  buildProjectOutcomeRow,
  type BuildOutcomeRowInput,
} from '../lib/efterkalkyl/freeze-outcome'

test.describe('computeOutcomeDiffs — tidsdiff', () => {
  test('övertid: 46h mot offererade 40h → +15,0 %', () => {
    const r = computeOutcomeDiffs({ quotedHours: 40, actualHours: 46, quotedAmount: null, actualTotalKr: null })
    expect(r.hours_diff_pct).toBe(15.0)
  })

  test('undertid: 36h mot 40h → −10,0 %', () => {
    const r = computeOutcomeDiffs({ quotedHours: 40, actualHours: 36, quotedAmount: null, actualTotalKr: null })
    expect(r.hours_diff_pct).toBe(-10.0)
  })

  test('avrundning till 1 decimal: 42,5h mot 40h → 6,3 %', () => {
    const r = computeOutcomeDiffs({ quotedHours: 40, actualHours: 42.5, quotedAmount: null, actualTotalKr: null })
    expect(r.hours_diff_pct).toBe(6.3)
  })

  test('offererade timmar saknas → null, aldrig 0 %', () => {
    const r = computeOutcomeDiffs({ quotedHours: null, actualHours: 20, quotedAmount: null, actualTotalKr: null })
    expect(r.hours_diff_pct).toBeNull()
  })

  test('offererade timmar 0 → null (ingen division med noll)', () => {
    const r = computeOutcomeDiffs({ quotedHours: 0, actualHours: 20, quotedAmount: null, actualTotalKr: null })
    expect(r.hours_diff_pct).toBeNull()
  })
})

test.describe('computeOutcomeDiffs — beloppsdiff', () => {
  test('överkostnad: 92 000 kr mot offererade 80 000 → +15,0 %', () => {
    const r = computeOutcomeDiffs({ quotedHours: null, actualHours: 0, quotedAmount: 80000, actualTotalKr: 92000 })
    expect(r.amount_diff_pct).toBe(15.0)
  })

  test('faktisk kostnad null (arbetskostnad ej konfigurerad) → null', () => {
    const r = computeOutcomeDiffs({ quotedHours: null, actualHours: 0, quotedAmount: 80000, actualTotalKr: null })
    expect(r.amount_diff_pct).toBeNull()
  })

  test('offererat belopp saknas → null', () => {
    const r = computeOutcomeDiffs({ quotedHours: null, actualHours: 0, quotedAmount: null, actualTotalKr: 50000 })
    expect(r.amount_diff_pct).toBeNull()
  })
})

// ── buildProjectOutcomeRow ────────────────────────────────────────

function baseInput(overrides: Partial<BuildOutcomeRowInput> = {}): BuildOutcomeRowInput {
  return {
    projectId: 'proj_test1',
    businessId: 'biz_test',
    quoteId: 'q_1',
    jobType: 'badrum',
    templateId: null,
    closedAt: '2026-07-20T10:00:00.000Z',
    economics: {
      kostnader: {
        arbete_kr: 26000,
        arbete_timmar: 44,
        material_inkop_kr: 18000,
        material_billable_kr: 21600,
        extra_kr: 0,
        extra_per_kategori: {},
        total_kr: 44000,
      },
      marginal: {
        marginal_kr: 42000,
        marginal_pct: 48.8,
        arbetskostnad_konfigurerad: true,
        timrader_utan_kostnad: 0,
        kostnad_sannolikt_komplett: true,
        kostnad_completeness_pct: 100,
        är_tomt: false,
      },
      intakter: {
        budget_amount: 86000,
        ata_signerat_kr: 4000,
        ata_pending_kr: 0,
        fakturerat_kr: 90000,
        betalt_kr: 90000,
        forvantad_intakt_kr: 90000,
      },
    } as BuildOutcomeRowInput['economics'],
    budget: {
      budget_hours: 40,
      budget_amount: 86000,
      labor_items: [
        { total: 26000 },
        { total: 6000 },
      ] as any,
    } as BuildOutcomeRowInput['budget'],
    ...overrides,
  }
}

test.describe('buildProjectOutcomeRow', () => {
  test('full rad: offererat arbete = summan av labor_items, material = resten', () => {
    const row = buildProjectOutcomeRow(baseInput())
    expect(row.quoted_labor_kr).toBe(32000)
    expect(row.quoted_material_kr).toBe(54000)
    expect(row.quoted_hours).toBe(40)
    expect(row.hours_diff_pct).toBe(10.0) // 44 mot 40
    expect(row.amount_diff_pct).toBe(-48.8) // 44 000 kostnad mot 86 000 offererat
    expect(row.margin_pct).toBe(48.8)
    expect(row.labor_cost_configured).toBe(true)
  })

  test('utan kopplad offert (budget null) → alla quoted-fält och diffar null', () => {
    const row = buildProjectOutcomeRow(baseInput({ quoteId: null, budget: null }))
    expect(row.quoted_amount).toBeNull()
    expect(row.quoted_hours).toBeNull()
    expect(row.quoted_labor_kr).toBeNull()
    expect(row.quoted_material_kr).toBeNull()
    expect(row.hours_diff_pct).toBeNull()
    expect(row.amount_diff_pct).toBeNull()
    // Utfallet fryses ändå — faktisk tid/kostnad har eget värde.
    expect(row.actual_hours).toBe(44)
  })

  test('arbetskostnad ej konfigurerad → marginal och beloppsdiff null, timdiff kvar', () => {
    const input = baseInput()
    input.economics = {
      ...input.economics,
      kostnader: { ...input.economics.kostnader, arbete_kr: null, total_kr: null } as any,
      marginal: {
        marginal_kr: null,
        marginal_pct: null,
        arbetskostnad_konfigurerad: false,
        timrader_utan_kostnad: 44,
        kostnad_sannolikt_komplett: false,
        kostnad_completeness_pct: null,
        är_tomt: false,
      } as any,
    }
    const row = buildProjectOutcomeRow(input)
    expect(row.margin_kr).toBeNull()
    expect(row.margin_pct).toBeNull()
    expect(row.labor_cost_configured).toBe(false)
    expect(row.amount_diff_pct).toBeNull()
    expect(row.hours_diff_pct).toBe(10.0) // timjämförelsen kräver ingen kostnadsdata
  })

  test('deterministiskt id gör upsert idempotent: outc_<project_id>', () => {
    const row = buildProjectOutcomeRow(baseInput())
    expect(row.id).toBe('outc_proj_test1')
    expect(buildProjectOutcomeRow(baseInput()).id).toBe(row.id)
  })
})
