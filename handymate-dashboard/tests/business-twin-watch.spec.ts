/** Browserlöst facit för Business Twin Watch & Verify V1. */

import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import type { ProjectOutcomeRow } from '../lib/efterkalkyl/freeze-outcome'
import {
  buildForecastVerification,
  isProjectMarginWatchRequest,
} from '../lib/business-twin/watch-forecast'

const ROOT = path.resolve(__dirname, '..')

function outcome(overrides: Partial<ProjectOutcomeRow> = {}): ProjectOutcomeRow {
  return {
    id: 'outcome_1',
    business_id: 'biz_a',
    project_id: 'project_a',
    quote_id: 'quote_a',
    job_type: 'badrum',
    template_id: null,
    quoted_amount: 100_000,
    quoted_hours: 100,
    quoted_labor_kr: 60_000,
    quoted_material_kr: 40_000,
    actual_hours: 120,
    actual_labor_kr: 40_000,
    actual_material_purchase_kr: 20_000,
    actual_material_billable_kr: 30_000,
    ata_signed_kr: 5_000,
    invoiced_kr: 105_000,
    margin_kr: 45_000,
    margin_pct: 42.9,
    expected_revenue_kr: 105_000,
    realized_revenue_kr: 100_000,
    realized_margin_kr: 45_000,
    realized_margin_pct: 45,
    labor_cost_configured: true,
    hours_diff_pct: 20,
    amount_diff_pct: -40,
    calculation_version: 2,
    quote_source_type: 'quote_items_table',
    source_counts: {
      ata: 1,
      invoice: 1,
      realized_invoice: 1,
      time_entry: 4,
      supplier_invoice: 1,
      project_material: 0,
      project_cost: 0,
    },
    completeness_flags: {
      project_completed: true,
      quote_linked: true,
      quote_budget_present: true,
      quote_hours_present: true,
      time_entries_present: true,
      cost_rows_present: true,
      material_source_overlap_free: true,
      labor_cost_complete: true,
      invoice_present: true,
      invoice_net_amount_complete: true,
      realized_revenue_present: true,
      source_reads_complete: true,
    },
    time_learning_eligible: true,
    financial_learning_eligible: true,
    learning_blockers: [],
    computed_at: '2026-08-11T12:00:00.000Z',
    frozen_at: '2026-08-11T12:00:00.000Z',
    reconciled_at: null,
    closed_at: '2026-08-11T10:00:00.000Z',
    ...overrides,
  }
}

test.describe('ren prognos → utfall-jämförelse', () => {
  test('räknar signerad avvikelse och hur tidigt signalen fanns', () => {
    const result = buildForecastVerification(
      {
        predicted_margin_kr: 40_000,
        predicted_margin_pct: 42.5,
        created_at: '2026-08-01T10:00:00.000Z',
      },
      outcome(),
      '2026-08-11T12:00:00.000Z',
    )

    expect(result.status).toBe('verified')
    expect(result.values).toMatchObject({
      actual_margin_kr: 45_000,
      actual_margin_pct: 45,
      margin_error_kr: 5_000,
      margin_error_pp: 2.5,
      lead_time_days: 10,
    })
  })

  test('otillräckligt kvalitetsunderlag blir unverifiable — aldrig en träff', () => {
    const result = buildForecastVerification(
      {
        predicted_margin_kr: 40_000,
        predicted_margin_pct: 42.5,
        created_at: '2026-08-01T10:00:00.000Z',
      },
      outcome({
        financial_learning_eligible: false,
        learning_blockers: ['material_source_overlap'],
      }),
      '2026-08-11T12:00:00.000Z',
    )

    expect(result.status).toBe('unverifiable')
    expect(result.values).not.toHaveProperty('actual_margin_pct')
    expect(result.values.verification_blocker).toContain('material_source_overlap')
  })

  test('en prognos efter avslutsdatum får inget påhittat ledtidsfacit', () => {
    const result = buildForecastVerification(
      {
        predicted_margin_kr: 40_000,
        predicted_margin_pct: 42.5,
        created_at: '2026-08-12T10:00:00.000Z',
      },
      outcome(),
      '2026-08-12T12:00:00.000Z',
    )

    expect(result.status).toBe('unverifiable')
    expect(result.values).not.toHaveProperty('lead_time_days')
  })
})

test('bara explicit projektmarginalinput kan bevakas', () => {
  expect(isProjectMarginWatchRequest({
    scenario_type: 'project_margin',
    project_id: 'project_a',
    extra_hours: 20,
    material_cost_change_pct: 10,
    additional_revenue_kr: 0,
  })).toBe(true)
  expect(isProjectMarginWatchRequest({
    scenario_type: 'cash_delay',
    project_id: 'project_a',
    extra_hours: 20,
    material_cost_change_pct: 10,
    additional_revenue_kr: 0,
  })).toBe(false)
  expect(isProjectMarginWatchRequest({
    scenario_type: 'project_margin',
    project_id: 'project_a',
    extra_hours: '20',
    material_cost_change_pct: 10,
    additional_revenue_kr: 0,
  })).toBe(false)
  expect(isProjectMarginWatchRequest({
    scenario_type: 'project_margin',
    project_id: '../annan-tenant',
    extra_hours: 20,
    material_cost_change_pct: 10,
    additional_revenue_kr: 0,
  })).toBe(false)
})

test.describe('arkitekturfacit', () => {
  test('migrationen är smal, service-only och tillståndskonsistent', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'sql/v139_business_twin_forecast.sql'), 'utf8')
    expect(sql).toContain('CREATE TABLE public.business_twin_forecast')
    expect(sql).toContain('v139 kräver att v138_outcome_quality_gate.sql är körd först')
    expect(sql).toContain("CHECK (scenario_kind = 'project_margin')")
    expect(sql).toContain("status IN ('watching', 'verified', 'unverifiable')")
    expect(sql).toMatch(/status = 'unverifiable'[\s\S]*?project_outcome_id IS NOT NULL/)
    expect(sql).toContain('UNIQUE (business_id, fingerprint)')
    expect(sql).toContain('REFERENCES public.project(project_id) ON DELETE CASCADE')
    expect(sql).toContain('REVOKE ALL ON TABLE public.business_twin_forecast FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO service_role')
    expect(sql).not.toContain('GRANT SELECT ON TABLE public.business_twin_forecast TO authenticated')
  })

  test('servern återkör scenariot före första insert och tenantfiltrerar varje väg', () => {
    const source = fs.readFileSync(path.join(ROOT, 'lib/business-twin/watch-forecast.ts'), 'utf8')
    const rerun = source.indexOf('await runBusinessScenario')
    const insert = source.indexOf(".from('business_twin_forecast')\n    .insert")
    expect(rerun).toBeGreaterThan(0)
    expect(insert).toBeGreaterThan(rerun)
    expect(source).toContain(".eq('business_id', businessId)")
    expect(source).toContain(".eq('project_id', projectId)")
    expect(source).toContain(".eq('status', 'watching')")
    expect(source).toContain(".select('id')\n      .maybeSingle()")
    expect(source).toContain('if (!updated) continue')
    expect(source.indexOf('isMissingForecastTable(error)')).toBeLessThan(source.indexOf("if (error) return { ok: false, available: true, verified"))
  })

  test('API:t är owner/admin-grindat och tar aldrig business_id från body', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/api/business-twin/forecasts/route.ts'), 'utf8')
    expect(source).toContain('getAuthenticatedBusiness(request)')
    expect(source).toContain('getCurrentUser(request, business.business_id)')
    expect(source).toContain('isOwnerOrAdmin(currentUser)')
    expect(source).toContain('businessId: auth.business.business_id')
    expect(source).not.toContain('body.business_id')
  })

  test('prognosen verifieras först efter kanoniskt outcome', () => {
    const source = fs.readFileSync(path.join(ROOT, 'lib/projects/complete-project.ts'), 'utf8')
    const freeze = source.indexOf('await freezeProjectOutcome')
    const verify = source.indexOf('await verifyProjectMarginForecasts')
    expect(freeze).toBeGreaterThan(0)
    expect(verify).toBeGreaterThan(freeze)
    expect(source).toContain("effect: 'business_twin_forecasts'")
  })

  test('kortet visar bevakning bara för owner/admin och återanvänder samma scenario', () => {
    const source = fs.readFileSync(path.join(ROOT, 'components/agents/BusinessScenarioCard.tsx'), 'utf8')
    const receipt = fs.readFileSync(path.join(ROOT, 'components/business-twin/ForecastReceipt.tsx'), 'utf8')
    const closeout = fs.readFileSync(path.join(ROOT, 'components/projects/economy/EfterkalkylCard.tsx'), 'utf8')
    expect(source).toContain('useCurrentUser()')
    expect(source).toContain('scenario.watch && isOwnerOrAdmin')
    expect(source).toContain('Bevaka detta')
    expect(source).toContain('/api/business-twin/forecasts')
    expect(receipt).toContain('Prognosen har fått ett verifierat utfall')
    expect(closeout).toContain('Business Twin · prognoskvittot')
    expect(closeout).toContain('<ForecastReceipt forecast={forecast} />')
  })
})
