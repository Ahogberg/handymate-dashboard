/**
 * Facit — Fortnox historik-widening, route-/UI-lagret (2026-08-15).
 * Källskanning, browserlöst. De rena beräkningsdelarna täcks separat av
 * tests/fortnox-invoice-merge.spec.ts, tests/facit-fortnox-invoice-map.spec.ts
 * och tests/facit-instant-value.spec.ts.
 *
 *   npx playwright test tests/fortnox-history-widening.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const integrationsPage = read('app/dashboard/settings/integrations/page.tsx')
const instantValueRoute = read('app/api/onboarding/instant-value/route.ts')
const step6 = read('app/onboarding/components/Step6LiveTour.tsx')
const fortnoxLib = read('lib/fortnox.ts')

test.describe('Settings → Integrationer: "Hämta historik"-knappen', () => {
  test('anropar samma två import-rutter som onboardingen, i rätt ordning (kunder före fakturor)', () => {
    const fnStart = integrationsPage.indexOf('async function handleFortnoxImportHistory')
    const fnBody = integrationsPage.slice(fnStart, integrationsPage.indexOf('async function handleFortnoxDisconnect'))
    const customersCall = fnBody.indexOf('/api/integrations/fortnox/import/customers')
    const invoicesCall = fnBody.indexOf('/api/integrations/fortnox/import/invoices')
    expect(customersCall).toBeGreaterThan(-1)
    expect(invoicesCall).toBeGreaterThan(customersCall)
  })

  test('knappen är kopplad till handleFortnoxImportHistory och delar disabled-state med övriga Fortnox-knappar', () => {
    expect(integrationsPage).toContain('onClick={handleFortnoxImportHistory}')
    const btnStart = integrationsPage.indexOf('onClick={handleFortnoxImportHistory}')
    const btnBlock = integrationsPage.slice(btnStart, btnStart + 300)
    expect(btnBlock).toContain('disabled={fortnoxAction !== null}')
  })

  test("fortnoxAction-typen inkluderar 'importing'", () => {
    expect(integrationsPage).toContain("useState<'syncing' | 'disconnecting' | 'importing' | null>")
  })
})

test.describe('instant-value/route.ts: betald-historik-queryn', () => {
  test('frågar status=paid, tenant-filtrerad, matas in som paidInvoices', () => {
    const queryStart = instantValueRoute.indexOf("eq('status', 'paid')")
    expect(queryStart, 'paid-frågan saknas').toBeGreaterThan(-1)
    const blockBefore = instantValueRoute.slice(Math.max(0, queryStart - 200), queryStart)
    expect(blockBefore).toContain("eq('business_id', businessId)")
    expect(instantValueRoute).toContain('paidInvoices: paidInvoicesRes.data')
  })
})

test.describe('Step6LiveTour.tsx: historisk-omsättning-raden', () => {
  test('renderas bara när historical_revenue finns, aldrig som en påhittad nolla', () => {
    expect(step6).toContain('{instant.historical_revenue && (')
  })

  test('konkurrerar aldrig om headline-platsen — separat block, inte en del av h.text/pickHeadline-logiken', () => {
    const revenueBlock = step6.indexOf('{instant.historical_revenue && (')
    const headlineTextUsage = step6.lastIndexOf('{h.text}')
    // Historik-blocket kommer EFTER huvudrubriken i JSX:et — en stödjande
    // rad under, aldrig en ersättning för den.
    expect(revenueBlock).toBeGreaterThan(headlineTextUsage)
  })

  test('formatSedan hanterar tomt/ogiltigt datum utan att krascha', () => {
    expect(step6).toContain('function formatSedan(sinceDateIso: string): string {')
    expect(step6).toContain("if (!sinceDateIso) return ''")
    expect(step6).toContain('Number.isNaN(d.getTime())')
  })
})

test.describe('lib/fortnox.ts: dokumentationen matchar den nya tvåpuls-designen', () => {
  test('gamla kommentaren om att FullyPaid filtreras bort är borta (den semantiken är nu tvärtom)', () => {
    expect(fortnoxLib).not.toContain('Filtrerar bort makulerade och fullbetalda')
  })

  test('fromdate-baserad historik-pull finns och är dokumenterad', () => {
    expect(fortnoxLib).toContain('fromdate=${fromDate}')
    expect(fortnoxLib).toContain('12 månader')
  })
})
