/**
 * Facit — fakturors ekonomiska period ska läsas ur invoice_date, inte
 * created_at (2026-08-15).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Fortnox-importen (onboarding steg 5) sätter invoice_date korrekt till
 * fakturans RIKTIGA datum (lib/fortnox/map-invoice.ts), men rör aldrig
 * created_at — den kolumnen har DB-default now() och stämplas alltså med
 * IMPORT-ögonblicket (onboarding-dagen), inte fakturans verkliga datum.
 * Två ställen läste created_at för att avgöra "vilken månad"/"senaste 90
 * dagarna" en faktura hör till — vilket bokförde varje importerad,
 * historisk faktura som om den hände just nu. Karins egen aggregering
 * (lib/agents/karin/observation-prompt.ts) gjorde redan rätt — de två
 * ställena nedan gjorde det inte.
 *
 *   npx playwright test tests/invoice-date-vs-created-at.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const monthlyReview = read('lib/matte/monthly-review.ts')
const instantValueRoute = read('app/api/onboarding/instant-value/route.ts')

test.describe('lib/matte/monthly-review.ts — månadens fakturor räknas på invoice_date', () => {
  test('den här månadens fakturaquery filtrerar på invoice_date, inte created_at', () => {
    const faktBlock = monthlyReview.slice(monthlyReview.indexOf('── FAKTUROR'), monthlyReview.indexOf('── LÖNSAMHET'))
    expect(faktBlock, 'created_at används fortfarande för att avgöra fakturans period').not.toContain(".gte('created_at', startIso)")
    expect(faktBlock).toContain(".gte('invoice_date', startIso)")
    expect(faktBlock).toContain(".lt('invoice_date', endIso)")
  })

  test('föregående månads jämförelsequery filtrerar också på invoice_date', () => {
    const faktBlock = monthlyReview.slice(monthlyReview.indexOf('── FAKTUROR'), monthlyReview.indexOf('── LÖNSAMHET'))
    expect(faktBlock).toContain(".gte('invoice_date', prevStart.toISOString())")
    expect(faktBlock).toContain(".lt('invoice_date', prevEnd.toISOString())")
  })

  test('invoice_date är fortfarande med i select-listan (fältet fanns redan, bara filtret var fel)', () => {
    const faktBlock = monthlyReview.slice(monthlyReview.indexOf('── FAKTUROR'), monthlyReview.indexOf('── LÖNSAMHET'))
    expect(faktBlock).toContain('invoice_date')
  })
})

test.describe('instant-value/route.ts — "senaste 90 dagarna"-räkningen för fakturor', () => {
  test('invoicesAnalyzed-count filtrerar på invoice_date, inte created_at', () => {
    const countBlock = instantValueRoute.slice(
      instantValueRoute.lastIndexOf("from('invoice')"),
      instantValueRoute.indexOf('const result = computeInstantValue'),
    )
    expect(countBlock, 'created_at används fortfarande för fakturors 90-dagarsräkning').not.toContain("gte('created_at', nittioDagar)")
    expect(countBlock).toContain("gte('invoice_date', nittioDagar)")
  })

  test('quotes- och project-counts rörs INTE — de tabellerna importeras aldrig från Fortnox, created_at är korrekt där', () => {
    const quotesBlock = instantValueRoute.slice(instantValueRoute.indexOf("from('quotes')"), instantValueRoute.indexOf("from('project')"))
    const projectBlock = instantValueRoute.slice(instantValueRoute.indexOf("from('project')"), instantValueRoute.lastIndexOf("from('invoice')"))
    expect(quotesBlock).toContain("gte('created_at', nittioDagar)")
    expect(projectBlock).toContain("gte('created_at', nittioDagar)")
  })
})
