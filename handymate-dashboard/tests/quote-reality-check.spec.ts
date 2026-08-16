/** Browserlöst facit för Business Twin Quote Reality Check V1. */

import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { buildQuoteRealityCheck } from '../lib/daniel-intelligence'
import type { EfterkalkylInsight } from '../lib/efterkalkyl/get-insight'
import type { QuoteBudgetDerivation } from '../lib/quotes/get-quote-budget-derivation'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

function insight(overrides: Partial<EfterkalkylInsight> = {}): EfterkalkylInsight {
  return {
    count: 6,
    financial_count: 5,
    insufficient: false,
    avg_hours_diff_pct: 25,
    avg_amount_diff_pct: 12,
    avg_margin_pct: 31.5,
    sample_job_types: ['badrum'],
    ...overrides,
  }
}

function budget(hours: number | null): QuoteBudgetDerivation {
  return {
    budget_hours: hours,
    budget_amount: 100_000,
    project_type: 'mixed',
    labor_items: [],
    source: 'quote_items_table',
  }
}

test.describe('ren offert → verklighetskontroll', () => {
  test('historisk tidsavvikelse ger en halvtimmesavrundad kontrollnivå', () => {
    const result = buildQuoteRealityCheck({
      insight: insight(),
      budget: budget(40),
      matchedBy: 'job_type',
      matchLabel: 'badrum',
    })

    expect(result.status).toBe('ready')
    expect(result.show_warning).toBe(true)
    expect(result.analysis).toMatchObject({
      similar_jobs: 6,
      quoted_hours: 40,
      avg_hours_diff_pct: 25,
      recommended_hours: 50,
      suggested_buffer_hours: 10,
      avg_realized_margin_pct: 31.5,
      confidence: 'gott',
    })
  })

  test('kontrollnivån avrundas uppåt — aldrig ned så bufferten krymper', () => {
    const result = buildQuoteRealityCheck({
      insight: insight({ avg_hours_diff_pct: 11 }),
      budget: budget(37),
      matchedBy: 'template',
      matchLabel: 'tmpl_badrum',
    })
    expect(result.analysis?.recommended_hours).toBe(41.5)
    expect(result.analysis?.suggested_buffer_hours).toBe(4.5)
  })

  test('snabbare historik sänker aldrig automatiskt offertens timmar', () => {
    const result = buildQuoteRealityCheck({
      insight: insight({ avg_hours_diff_pct: -15 }),
      budget: budget(40),
      matchedBy: 'job_type',
      matchLabel: 'badrum',
    })
    expect(result.status).toBe('ready')
    expect(result.show_warning).toBe(false)
    expect(result.analysis?.recommended_hours).toBe(40)
    expect(result.analysis?.suggested_buffer_hours).toBe(0)
  })

  test('två utfall eller saknade offerttimmar blir insufficient — inget omdöme', () => {
    const tooFew = buildQuoteRealityCheck({
      insight: insight({ count: 2, insufficient: true }),
      budget: budget(40),
      matchedBy: 'job_type',
      matchLabel: 'badrum',
    })
    const noHours = buildQuoteRealityCheck({
      insight: insight(),
      budget: budget(null),
      matchedBy: 'job_type',
      matchLabel: 'badrum',
    })
    expect(tooFew).toMatchObject({ status: 'insufficient', show_warning: false, analysis: null })
    expect(noHours).toMatchObject({ status: 'insufficient', show_warning: false, analysis: null })
  })

  test('källfel hålls skilt från ett äkta litet urval', () => {
    const result = buildQuoteRealityCheck({
      insight: insight({ count: 0, insufficient: true, unavailable: true }),
      budget: budget(40),
      matchedBy: 'job_type',
      matchLabel: 'badrum',
    })
    expect(result).toMatchObject({ status: 'unavailable', show_warning: false, analysis: null })
  })

  test('null tidsavvikelse blir insufficient — Number(null) får inte bli falsk nolla', () => {
    const result = buildQuoteRealityCheck({
      insight: insight({ avg_hours_diff_pct: null }),
      budget: budget(40),
      matchedBy: 'job_type',
      matchLabel: 'badrum',
    })
    expect(result).toMatchObject({ status: 'insufficient', show_warning: false, analysis: null })
  })
})

test.describe('arkitekturfacit', () => {
  test('offert och budget läses tenantfiltrerat före all jämförelse', () => {
    const source = read('lib/daniel-intelligence.ts')
    expect(source).toMatch(/\.from\('quotes'\)[\s\S]*?\.eq\('business_id', businessId\)[\s\S]*?\.eq\('quote_id', quoteId\)/)
    expect(source).toContain('getQuoteBudgetDerivation(supabase, quoteId, businessId)')
    expect(source).toContain('getEfterkalkylInsight(supabase, businessId')
  })

  test('matchningen är explicit mall → jobbtyp, aldrig fritext eller prisintervall', () => {
    const source = read('lib/daniel-intelligence.ts')
    expect(source).toContain("matchedBy: templateId ? 'template' : 'job_type'")
    expect(source).toContain('jobType: templateId ? null : jobType')
    expect(source).not.toContain('extractJobType')
    expect(source).not.toContain('priceRange')
    expect(source).not.toContain(".in('status', ['accepted', 'completed'])")
    expect(source).not.toContain(".select('project_id, quote_id, budget_hours, actual_hours')")
  })

  test('API:t härleder tenant från auth och validerar offert-id', () => {
    const source = read('app/api/quotes/intelligence/route.ts')
    expect(source).toContain('getAuthenticatedBusiness(request)')
    expect(source).toContain('getCurrentUser(request, business.business_id)')
    expect(source).toContain("hasPermission(currentUser, 'see_financials')")
    expect(source).toContain('avg_realized_margin_pct: null')
    expect(source).toContain('business.business_id')
    expect(source).toContain('/^[a-zA-Z0-9_-]{1,160}$/')
    expect(source).not.toContain('body.business_id')
  })

  test('utskicksmodalen har riktig redigerings-CTA och ingen falsk prisändring', () => {
    const modal = read('app/dashboard/quotes/[id]/components/QuoteSendModal.tsx')
    expect(modal).toContain('Business Twin · verklighetskontroll')
    expect(modal).toContain('Realiserad marginal')
    expect(modal).toContain('Granska timmarna')
    expect(modal).toContain('href={`/dashboard/quotes/${quote.quote_id}/edit`}')
    expect(modal).toContain('inga belopp eller rader ändras automatiskt')
    expect(modal).not.toContain('suggested_price')
    expect(modal).not.toContain('TODO: Justera pris-logik')
    expect(modal).not.toContain('Justera till')
  })

  test('dealens explicita jobbtyp överlever offertskapandet till utskickskontrollen', () => {
    const page = read('app/dashboard/quotes/new/page.tsx')
    const route = read('app/api/quotes/route.ts')
    expect(page).toContain('setQuoteJobType(deal.job_type)')
    expect(page).toContain('job_type: quoteJobType')
    expect(route).toContain("job_type: typeof body.job_type === 'string'")
    expect(route).toContain('body.job_type.trim().slice(0, 120)')
    expect(route).toContain('template_id: source.template_id')
    expect(route).toContain('job_type: source.job_type')
  })
})
