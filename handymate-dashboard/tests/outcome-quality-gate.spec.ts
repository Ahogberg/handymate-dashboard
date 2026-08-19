/**
 * Outcome Quality Gate V1 — browserlöst facit.
 *
 * Bevisar att legacy/partiella utfall inte kan nå lärande konsumenter och
 * att källfel inte längre omtolkas till nollor. Migrationen körs manuellt;
 * testet granskar därför både den rena kvalitetskärnan och SQL-kontraktet.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  OUTCOME_CALCULATION_VERSION,
  buildProjectOutcomeRow,
  type BuildOutcomeRowInput,
} from '../lib/efterkalkyl/freeze-outcome'

const ROOT = path.join(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

function input(overrides: Partial<BuildOutcomeRowInput> = {}): BuildOutcomeRowInput {
  return {
    projectId: 'proj_quality_1',
    businessId: 'biz_quality_1',
    quoteId: 'quote_quality_1',
    jobType: 'badrum',
    templateId: null,
    closedAt: '2026-08-15T12:00:00.000Z',
    frozenAt: '2026-08-16T09:00:00.000Z',
    reconciledAt: null,
    projectCompleted: true,
    budget: {
      source: 'quote_items_table',
      budget_hours: 40,
      budget_amount: 80000,
      labor_items: [{ description: 'Arbete', quantity: 40, unit: 'tim', total: 30000 }],
    },
    economics: {
      intakter: {
        budget_amount: 80000,
        ata_signerat_kr: 5000,
        ata_pending_kr: 0,
        fakturerat_kr: 100000,
        fakturerat_ex_moms_kr: 80000,
        betalt_kr: 100000,
        forvantad_intakt_kr: 85000,
      },
      kostnader: {
        arbete_kr: 25000,
        arbete_timmar: 42,
        material_inkop_kr: 25000,
        material_billable_kr: 30000,
        extra_kr: 0,
        extra_per_kategori: {},
        total_kr: 50000,
      },
      marginal: {
        arbetskostnad_konfigurerad: true,
        timrader_utan_kostnad: 0,
        marginal_kr: 35000,
        marginal_pct: 41,
        är_tomt: false,
        kostnad_sannolikt_komplett: true,
        kostnad_completeness_pct: 59,
      },
      meta: {
        computed_at: '2026-08-16T08:59:59.000Z',
        invoice_count: 1,
        realized_invoice_count: 1,
        invoice_net_amount_complete: true,
        ata_count: 1,
        time_entry_count: 3,
        supplier_invoice_count: 1,
        project_material_count: 0,
        extra_cost_count: 0,
      },
    },
    ...overrides,
  }
}

test.describe('Outcome V2 — ren kvalitetskärna', () => {
  test('realiserad marginal räknas exklusive moms, skild från förväntad marginal', () => {
    const row = buildProjectOutcomeRow(input())
    expect(row.calculation_version).toBe(OUTCOME_CALCULATION_VERSION)
    expect(row.expected_revenue_kr).toBe(85000)
    expect(row.realized_revenue_kr).toBe(80000)
    expect(row.realized_margin_kr).toBe(30000)
    expect(row.realized_margin_pct).toBe(37.5)
    expect(row.financial_learning_eligible).toBe(true)
  })

  test('saknad nettosumma blockerar finansiell lärdata', () => {
    const base = input()
    const row = buildProjectOutcomeRow(input({
      economics: {
        ...base.economics,
        intakter: { ...base.economics.intakter, fakturerat_ex_moms_kr: null },
        meta: { ...base.economics.meta, invoice_net_amount_complete: false },
      },
    }))
    expect(row.financial_learning_eligible).toBe(false)
    expect(row.realized_margin_pct).toBeNull()
    expect(row.learning_blockers).toContain('invoice_net_amount_incomplete')
  })

  test('överlappande materialkällor visas men får inte träna ekonomin före X2d', () => {
    const base = input()
    const row = buildProjectOutcomeRow(input({
      economics: {
        ...base.economics,
        meta: { ...base.economics.meta, project_material_count: 2 },
      },
    }))
    expect(row.completeness_flags.material_source_overlap_free).toBe(false)
    expect(row.financial_learning_eligible).toBe(false)
    expect(row.learning_blockers).toContain('material_source_overlap_unresolved')
  })
})

test.describe('Källor och konsumenter — källäsande facit', () => {
  test('alla ekonomiska uppslag är fail-closed och medlemskostnad tenantfiltreras', () => {
    const source = read('lib/projects/compute-economics.ts')
    for (const name of [
      'project', 'project_change', 'invoice', 'time_entry', 'business_users',
      'business_config', 'supplier_invoices', 'project_material', 'project_cost',
    ]) {
      expect(source).toContain(`assertSourceRead('${name}'`)
    }
    expect(source).toMatch(/\.from\('business_users'\)[\s\S]*?\.eq\('business_id', businessId\)[\s\S]*?\.in\('id', uniqueUserIds\)/)
    expect(source).toContain(".select('subtotal, total, status')")
  })

  test('offertbudgeten läser fel, tenantfiltrerar och räknar bara riktiga timenheter', () => {
    const source = read('lib/quotes/get-quote-budget-derivation.ts')
    expect(source).toMatch(/\.from\('quote_items'\)[\s\S]*?\.eq\('quote_id', quoteId\)[\s\S]*?\.eq\('business_id', businessId\)/)
    expect(source).toContain('if (tableError)')
    expect(source).toContain('if (quoteError)')
    expect(source.match(/if \(isTrueHourUnit\([^)]*\)\) laborHours \+= qty/g)?.length).toBe(2)
  })

  test('lärande konsumenter kräver V2, eligibility och minst tre utfall', () => {
    const insight = read('lib/efterkalkyl/get-insight.ts')
    const pricing = read('lib/agent/pricing-engine.ts')
    expect(insight).toContain(".eq('calculation_version', OUTCOME_CALCULATION_VERSION)")
    expect(insight).toContain('row.time_learning_eligible')
    expect(insight).toContain('row.financial_learning_eligible')
    expect(pricing).toContain(".eq('financial_learning_eligible', true)")
    expect(pricing).toContain(".select('job_type, realized_margin_pct')")
    expect(pricing).toContain('if (vals.length < 3) continue')
  })

  test('projektstängningen bedömer den aktuella frysningen, inte en gammal rad', () => {
    const source = read('lib/projects/complete-project.ts')
    expect(source).toContain('const frozen = await freezeProjectOutcome')
    expect(source).toContain('if (frozen.ok)')
    expect(source).not.toContain("import('@/lib/efterkalkyl/get-project-outcome')")
  })
})

test.describe('Reconciliation och manuell migration', () => {
  test('legacy-rader räknas om och märks aldrig V2 med UPDATE', () => {
    const reconciliation = read('lib/efterkalkyl/reconcile-outcomes.ts')
    const migration = read('sql/v138_outcome_quality_gate.sql')
    expect(reconciliation).toContain('outcome.calculation_version !== OUTCOME_CALCULATION_VERSION')
    expect(reconciliation).toContain('reconciliation: true')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS calculation_version')
    expect(migration).toContain('financial_learning_eligible BOOLEAN NOT NULL DEFAULT false')
    expect(migration).toContain('invoice_net_amount_complete')
    expect(migration.match(/calculation_version IS NOT NULL AND calculation_version >= 2/g)).toHaveLength(2)
    expect(migration).not.toMatch(/^\s*UPDATE\s+project_outcome\b/im)
  })

  // Läcka 2 (OperatingExperiment-fångstskydd, 2026-08-19): en V2-rad frusen
  // med labor_cost_configured=false läkte tidigare ALDRIG, ens efter att
  // business_config.default_internal_hourly_cost sattes i efterhand —
  // versionskriteriet ovan såg raden som redan "klar". Detta facit läser
  // KÄLLKODENS FORM (ingen DB här) och låser att det utökade kriteriet finns
  // kvar, pekar på rätt kolumn, och att refrysning fortfarande går genom
  // samma freezeProjectOutcome (aldrig en UPDATE som fuskar in V2).
  test('labor_cost-fallet: en V2-rad med labor_cost_configured=false refryses när timkostnaden nu är satt', () => {
    const reconciliation = read('lib/efterkalkyl/reconcile-outcomes.ts')
    // Läser flaggan från project_outcome...
    expect(reconciliation).toContain("select('project_id, calculation_version, labor_cost_configured')")
    // ...och den aktuella business-konfigurationen (inte en cachad/gammal
    // uppfattning om timkostnaden).
    expect(reconciliation).toContain(".from('business_config')")
    expect(reconciliation).toContain("select('default_internal_hourly_cost')")
    // Kandidat-kriteriet måste inkludera BÅDE version-avvikelsen (oförändrat)
    // OCH det nya labor-cost-fallet — aldrig bara det ena.
    expect(reconciliation).toContain('hourlyCostNowConfigured && outcome.labor_cost_configured === false')
    // Ingen genväg — en rad markeras aldrig V2/komplett genom en UPDATE, bara
    // genom att faktiskt köra freezeProjectOutcome om igen.
    expect(reconciliation).not.toMatch(/\.update\(\s*\{\s*calculation_version/i)
  })

  test('reconciliation-routen är tenantbunden och owner/admin-grindad', () => {
    const source = read('app/api/admin/project-outcomes/reconcile/route.ts')
    expect(source).toContain('getAuthenticatedBusiness(request)')
    expect(source).toContain('getCurrentUser(request, business.business_id)')
    expect(source).toContain('isOwnerOrAdmin(currentUser)')
    expect(source).toContain('business.business_id')
  })

  test('ett saknat completed_at ersätts aldrig av nu-tid', () => {
    const source = read('lib/efterkalkyl/freeze-outcome.ts')
    expect(source).toContain("'completion_timestamp_missing'")
    expect(source).toContain('if (!project.completed_at)')
    expect(source).toContain('closedAt: project.completed_at')
    expect(source).not.toContain('closedAt: project.completed_at || nowIso')
  })
})
