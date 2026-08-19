/**
 * Browserlöst facit för Business Twin Scenario Engine V1.
 *
 *   npx playwright test tests/business-twin-scenario.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import type { ProjectEconomics } from '../lib/projects/compute-economics'
import {
  simulateCashDelay,
  simulateProjectMargin,
  simulateRevenuePace,
} from '../lib/business-twin/scenario-engine'
import { isBusinessScenarioPresentation } from '../lib/business-twin/scenario-contract'
import { pageContextFromPathname } from '../lib/matte/page-context'

const ROOT = path.resolve(__dirname, '..')

function economics(overrides: Partial<ProjectEconomics> = {}): ProjectEconomics {
  const base: ProjectEconomics = {
    project_id: 'proj_demo_123',
    business_id: 'biz_demo_123',
    intakter: {
      budget_amount: 100_000,
      ata_signerat_kr: 0,
      ata_pending_kr: 0,
      fakturerat_kr: 0,
      fakturerat_ex_moms_kr: 0,
      betalt_kr: 0,
      forvantad_intakt_kr: 100_000,
    },
    kostnader: {
      arbete_kr: 20_000,
      arbete_timmar: 100,
      material_inkop_kr: 30_000,
      material_billable_kr: 0,
      extra_kr: 0,
      extra_per_kategori: {},
      total_kr: 50_000,
    },
    marginal: {
      arbetskostnad_konfigurerad: true,
      timrader_utan_kostnad: 0,
      marginal_kr: 50_000,
      marginal_pct: 50,
      är_tomt: false,
      kostnad_sannolikt_komplett: true,
      kostnad_completeness_pct: 50,
    },
    meta: {
      computed_at: '2026-08-16T10:00:00.000Z',
      invoice_count: 0,
      ata_count: 0,
      time_entry_count: 10,
      supplier_invoice_count: 3,
      project_material_count: 0,
      realized_invoice_count: 0,
      invoice_net_amount_complete: true,
      extra_cost_count: 0,
      unlinked_supplier_invoice_count: 3,
      unlinked_project_material_count: 0,
    },
    quote_rot_rut: null,
  }
  return {
    ...base,
    ...overrides,
    intakter: { ...base.intakter, ...(overrides.intakter || {}) },
    kostnader: { ...base.kostnader, ...(overrides.kostnader || {}) },
    marginal: { ...base.marginal, ...(overrides.marginal || {}) },
    meta: { ...base.meta, ...(overrides.meta || {}) },
  }
}

test.describe('projektmarginal — deterministisk och fail-closed', () => {
  test('20 extra timmar och 10 % dyrare material räknas från kända kostnader', () => {
    const result = simulateProjectMargin({
      projectId: 'proj_demo_123',
      projectName: 'Storgatan',
      economics: economics(),
      extraHours: 20,
      materialCostChangePct: 10,
      additionalRevenueKr: 0,
      explicitMarginTargetPct: 40,
      nowIso: '2026-08-16T12:00:00.000Z',
    })
    expect(result.status).toBe('ready')
    expect(result.metrics.find(m => m.key === 'cost_kr')).toMatchObject({ baseline: 50_000, scenario: 57_000 })
    expect(result.metrics.find(m => m.key === 'margin_kr')).toMatchObject({ baseline: 50_000, scenario: 43_000 })
    expect(result.metrics.find(m => m.key === 'margin_pct')).toMatchObject({ baseline: 50, scenario: 43, delta: -7 })
    expect(result.confidence).toBe('estimated')
  })

  test('saknad intern timkostnad blockerar — visar inte falsk marginal', () => {
    const result = simulateProjectMargin({
      projectId: 'p1', projectName: 'Osäkert',
      economics: economics({ kostnader: { ...economics().kostnader, arbete_kr: null, total_kr: null }, marginal: { ...economics().marginal, arbetskostnad_konfigurerad: false } }),
      extraHours: 10, materialCostChangePct: 0, additionalRevenueKr: 0,
      explicitMarginTargetPct: null, nowIso: '2026-08-16T12:00:00.000Z',
    })
    expect(result.status).toBe('blocked')
    expect(result.metrics).toEqual([])
    expect(result.summary).toContain('timkostnad')
  })

  test('möjligt materialöverlapp blockerar dubbelräkning', () => {
    const result = simulateProjectMargin({
      projectId: 'p1', projectName: 'Överlapp',
      economics: economics({ meta: { ...economics().meta, project_material_count: 2 } }),
      extraHours: 0, materialCostChangePct: 10, additionalRevenueKr: 0,
      explicitMarginTargetPct: null, nowIso: '2026-08-16T12:00:00.000Z',
    })
    expect(result.status).toBe('blocked')
    expect(result.summary).toContain('dubbelräknat')
  })
})

test('kassascenariot flyttar bara känt fakturaflöde — potential räknas inte in', () => {
  const result = simulateCashDelay({
    weeks: [
      { week_start: '2026-08-17', invoiced_kr: 10_000, potential_kr: 9_000_000 },
      { week_start: '2026-08-24', invoiced_kr: 20_000, potential_kr: 8_000_000 },
      { week_start: '2026-08-31', invoiced_kr: 30_000, potential_kr: 7_000_000 },
      { week_start: '2026-09-07', invoiced_kr: 40_000, potential_kr: 6_000_000 },
      { week_start: '2026-09-14', invoiced_kr: 50_000, potential_kr: 5_000_000 },
    ],
    normalKr: 25_000,
    normalReady: true,
    delayDays: 14,
    nowIso: '2026-08-16T12:00:00.000Z',
  })
  expect(result.status).toBe('ready')
  expect(result.metrics.find(m => m.key === 'known_5w_kr')).toMatchObject({ baseline: 150_000, scenario: 60_000 })
  expect(result.metrics.every(m => m.baseline < 1_000_000)).toBe(true)
  expect(result.assumptions.join(' ')).toContain('summeras aldrig ihop')
})

test.describe('omsättningstakt', () => {
  test('visar effekten av ytterligare fakturering mot uttryckligt årsmål', () => {
    const result = simulateRevenuePace({
      revenueTargetAnnualSek: 1_200_000,
      invoicedYtdSek: 700_000,
      additionalInvoiceKr: 100_000,
      todayIso: '2026-08-15',
      nowIso: '2026-08-16T12:00:00.000Z',
    })
    expect(result.status).toBe('ready')
    expect(result.metrics.find(m => m.key === 'invoiced_ytd_kr')).toMatchObject({ baseline: 700_000, scenario: 800_000 })
    expect(result.metrics.find(m => m.key === 'pace_pct')).toMatchObject({ baseline: 94, scenario: 107 })
  })

  test('osatt mål blockerar i stället för att anta ett mål', () => {
    expect(simulateRevenuePace({
      revenueTargetAnnualSek: null,
      invoicedYtdSek: 700_000,
      additionalInvoiceKr: 100_000,
      todayIso: '2026-08-15',
      nowIso: '2026-08-16T12:00:00.000Z',
    }).status).toBe('blocked')
  })
})

test('presentationen har ett litet runtime-kontrakt', () => {
  const scenario = simulateRevenuePace({
    revenueTargetAnnualSek: 1_000_000, invoicedYtdSek: 500_000, additionalInvoiceKr: 10_000,
    todayIso: '2026-08-15', nowIso: '2026-08-16T12:00:00.000Z',
  })
  expect(isBusinessScenarioPresentation({ kind: 'business_scenario', scenario })).toBe(true)
  expect(isBusinessScenarioPresentation({ kind: 'business_scenario', scenario: { version: 2 } })).toBe(false)
})

test.describe('arkitekturfacit', () => {
  test('I/O-gränsen är tenantfiltrerad och läsande', () => {
    const source = fs.readFileSync(path.join(ROOT, 'lib/business-twin/run-scenario.ts'), 'utf8')
  expect(source).toContain(".eq('business_id', businessId)")
  expect(source).toContain(".not('status', 'in', '(\"draft\",\"cancelled\",\"credited\")')")
  expect(source).toContain(".lte('invoice_date', today)")
    expect(source).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/)
  })

  test('verktyget finns i definition, router och Mattes kurerade lista', () => {
    for (const file of [
      'app/api/agent/trigger/tool-definitions.ts',
      'app/api/agent/trigger/tool-router.ts',
      'app/api/matte/chat/route.ts',
    ]) {
      expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).toContain('simulate_business_scenario')
    }
  })

  test('strukturerat scenario persisteras och renderas i den delade meddelandekomponenten', () => {
    const route = fs.readFileSync(path.join(ROOT, 'app/api/matte/chat/route.ts'), 'utf8')
    const thread = fs.readFileSync(path.join(ROOT, 'app/api/matte/threads/[id]/route.ts'), 'utf8')
    const message = fs.readFileSync(path.join(ROOT, 'components/agents/AgentMessage.tsx'), 'utf8')
    expect(route).toContain('metadata: { presentation: turn.presentation }')
    expect(thread).toContain("?.presentation")
    expect(message).toContain('<BusinessScenarioCard')
  })

  test('projektsidan erbjuder demo-wow-frågan utan att utföra något', () => {
    const context = pageContextFromPathname('/dashboard/projects/proj_demo_123')
    expect(context.quickActions).toContain('Vad händer med marginalen om jobbet tar 20 timmar extra och materialet blir 10 % dyrare?')
    expect(context.quickActions).toHaveLength(3)
    const route = fs.readFileSync(path.join(ROOT, 'app/api/matte/chat/route.ts'), 'utf8')
    expect(route).toContain('AKTUELL PRODUKTVY')
    expect(route).toContain('project_id: ${projectId}')
  })
})
