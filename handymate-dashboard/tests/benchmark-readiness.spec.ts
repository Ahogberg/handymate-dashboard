/** Browserlöst facit för Business Twin Benchmark Readiness V1. */

import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import {
  BENCHMARK_POLICY,
  buildBenchmarkOwnReadiness,
  type BenchmarkOutcomeSignal,
} from '../lib/benchmark/readiness'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

function outcome(
  jobType: string | null,
  overrides: Partial<BenchmarkOutcomeSignal> = {},
): BenchmarkOutcomeSignal {
  return {
    job_type: jobType,
    calculation_version: 2,
    time_learning_eligible: true,
    financial_learning_eligible: false,
    ...overrides,
  }
}

test.describe('ren readiness — bara det egna kvalitetsunderlaget', () => {
  test('tre V2-utfall i samma jobbtyp gör den jobbtypen redo', () => {
    const result = buildBenchmarkOwnReadiness([
      outcome('badrum'),
      outcome('badrum', { financial_learning_eligible: true }),
      outcome('badrum'),
    ])
    expect(result).toEqual({
      status: 'ready',
      qualified_outcomes: 3,
      time_outcomes: 3,
      financial_outcomes: 1,
      ready_job_types: 1,
      next_outcomes_needed: 0,
    })
  })

  test('tre utfall utspridda över jobbtyper blir inte falskt redo', () => {
    const result = buildBenchmarkOwnReadiness([
      outcome('badrum'),
      outcome('el'),
      outcome('tak'),
    ])
    expect(result).toMatchObject({
      status: 'building',
      qualified_outcomes: 3,
      ready_job_types: 0,
      next_outcomes_needed: 2,
    })
  })

  test('legacy och blockerade utfall räknas aldrig', () => {
    const result = buildBenchmarkOwnReadiness([
      outcome('badrum', { calculation_version: 1 }),
      outcome('badrum', {
        time_learning_eligible: false,
        financial_learning_eligible: false,
      }),
    ])
    expect(result).toMatchObject({
      status: 'empty',
      qualified_outcomes: 0,
      ready_job_types: 0,
      next_outcomes_needed: 3,
    })
  })

  test('kohortgränserna är fasta policyvärden, inte UI-gissningar', () => {
    expect(BENCHMARK_POLICY).toEqual({
      consent_version: 'benchmark-readiness-v1',
      min_outcomes_per_business_job_type: 3,
      min_businesses_per_cohort: 5,
      min_outcomes_per_cohort: 30,
    })
  })
})

test.describe('samtycke och databasgräns', () => {
  test('opt-in är false som default och varje ändring auditeras atomiskt', () => {
    const sql = read('sql/v140_benchmark_readiness.sql')
    expect(sql).toContain('benchmark_consent_enabled BOOLEAN NOT NULL DEFAULT FALSE')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.benchmark_consent_audit')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_benchmark_consent')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public, pg_temp')

    const functionBody = sql.split('CREATE OR REPLACE FUNCTION public.set_benchmark_consent')[1]
    const demoGuard = functionBody.indexOf('IF v_is_demo IS TRUE')
    const firstUpdate = functionBody.indexOf('UPDATE public.business_config')
    const firstInsert = functionBody.indexOf('INSERT INTO public.benchmark_consent_audit')
    expect(demoGuard).toBeGreaterThan(0)
    expect(demoGuard).toBeLessThan(firstUpdate)
    expect(firstUpdate).toBeLessThan(firstInsert)
  })

  test('RPC:n verifierar aktör i samma tenant och är service-only', () => {
    const sql = read('sql/v140_benchmark_readiness.sql')
    expect(sql).toMatch(/bu\.id = p_actor_business_user_id[\s\S]*?bu\.business_id = p_business_id[\s\S]*?bu\.is_active IS TRUE/)
    expect(sql).toContain("v_actor_role NOT IN ('owner', 'admin')")
    expect(sql).toContain("p_consent_version <> 'benchmark-readiness-v1'")
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO service_role')
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION public.set_benchmark_consent(TEXT, TEXT, BOOLEAN, TEXT)\n  TO authenticated')
  })

  test('migrationen skapar ingen benchmarkkopia eller tvärtenantmotor', () => {
    const sql = read('sql/v140_benchmark_readiness.sql')
    expect(sql).not.toMatch(/CREATE TABLE[^;]+benchmark_(?:outcome|aggregate|cohort|metric)/i)
    expect(sql).not.toContain('FROM public.project_outcome')
  })
})

test.describe('API, tenant och sanningsspråk', () => {
  test('API:t är owner/admin-grindat och härleder tenant från sessionen', () => {
    const route = read('app/api/benchmark/readiness/route.ts')
    expect(route).toContain('getAuthenticatedBusiness(request)')
    expect(route).toContain('getCurrentUser(request, business.business_id)')
    expect(route).toContain('isOwnerOrAdmin(currentUser)')
    expect(route).toContain('p_business_id: auth.business.business_id')
    expect(route).toContain('p_actor_business_user_id: auth.currentUser.id')
    expect(route).not.toContain('body.business_id')
  })

  test('readiness läser endast egen tenant och inga kund-/projektfält', () => {
    const source = read('lib/benchmark/readiness.ts')
    expect(source).toMatch(/\.from\('business_config'\)[\s\S]*?\.eq\('business_id', businessId\)/)
    expect(source).toMatch(/\.from\('project_outcome'\)[\s\S]*?\.eq\('business_id', businessId\)/)
    expect(source).toContain(".select('job_type, calculation_version, time_learning_eligible, financial_learning_eligible')")
    expect(source).not.toContain(".select('project_id")
    expect(source).not.toContain('customer_id')
    expect(source).not.toContain('hours_diff_pct')
    expect(source).not.toContain('realized_margin_pct')
  })

  test('UI:t säger uttryckligen att ingen branschinsikt finns ännu', () => {
    const page = read('app/dashboard/settings/business-twin/page.tsx')
    expect(page).toContain('Branschunderlaget är inte öppet ännu')
    expect(page).toContain('ingen dold ranking eller påhittad branschrekommendation')
    expect(page).toContain('Kundnamn, adresser, texter, dokument, fakturor och personuppgifter ingår aldrig')
    expect(page).toContain('Demo-data är alltid utesluten')
    expect(page).toContain('Återkalla samtycke')
    expect(page).toContain('Att tacka nej eller återkalla påverkar inte Handymates vanliga funktioner')
    expect(page).not.toMatch(/bransch(?:snitt|underlag)[^\n]{0,40}\d+\s*%/i)
  })

  test('integritetspolicyn beskriver det separata frivilliga ändamålet', () => {
    const privacy = read('app/privacy/page.tsx')
    expect(privacy).toContain('Frivillig branschstatistik')
    expect(privacy).toContain('Det är valfritt, påverkar inte tjänstens vanliga funktioner')
    expect(privacy).toContain('kan återkallas när som helst under Inställningar')
  })

  test('inställningen ligger i befintligt område och är owner-only', () => {
    const areas = read('lib/settings/areas.ts')
    expect(areas).toContain("href: '/dashboard/settings/business-twin'")
    expect(areas).toMatch(/_link_business_twin_data[^\n]+ownerOnly: true[^\n]+advanced: true/)
  })
})
