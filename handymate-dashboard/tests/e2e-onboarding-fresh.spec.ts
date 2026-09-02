/**
 * Vakten för ett färskt konto — källskanning av
 * app/api/debug/e2e-onboarding-fresh/route.ts (Etapp B6, 2026-09-02).
 *
 * Samma stil som tests/e2e-lifecycle-endpoint.spec.ts: läser källfilen som
 * text och låser att husets mönster (produktionsgrind, testdata-prefix,
 * städning barn-före-förälder) återanvänds, plus att den här endpointens
 * egen poäng — att grinden BLOCKERAR före betalning och SLÄPPER efter —
 * faktiskt kontrolleras i rätt ordning.
 *
 *   npx playwright test tests/e2e-onboarding-fresh.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { arTestId, arTestNamn } from '../lib/testdata'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('app/api/debug/e2e-onboarding-fresh/route.ts')

test.describe('produktionsgrind — samma mönster som e2e-lifecycle', () => {
  test('NODE_ENV=production kräver isAdmin innan getAuthenticatedBusiness', () => {
    expect(src).toContain("process.env.NODE_ENV === 'production'")
    expect(src).toContain("from '@/lib/admin-auth'")
    expect(src).toContain('adminCheck.isAdmin')
    expect(src).toContain('status: 403')
    expect(src.indexOf("process.env.NODE_ENV === 'production'")).toBeLessThan(
      src.indexOf('getAuthenticatedBusiness(request)'),
    )
  })

  test('getAuthenticatedBusiness anropas och 401:as om den saknas', () => {
    expect(src).toContain('getAuthenticatedBusiness(request)')
    expect(src).toContain('status: 401')
  })

  test('maxDuration 30, som de andra e2e-endpointerna', () => {
    expect(src).toContain('export const maxDuration = 30')
  })
})

test.describe('testdata-prefix — raderna göms om ett steg failar före städningen', () => {
  test("kontot bär 'test_' + Date.now() och namnet 'E2E Ny Firma'", () => {
    expect(src).toContain("const testBusinessId = 'test_' + Date.now()")
    expect(src).toContain('E2E Ny Firma')
    expect(arTestId('test_' + 1756800000000)).toBe(true)
    expect(arTestNamn('E2E Ny Firma')).toBe(true)
  })
})

test.describe('kedjan — det som faktiskt bevisas', () => {
  test('kontot skapas med samma status som register-rutten sätter', () => {
    expect(src).toContain("subscription_status: 'trial'")
    expect(src).toContain('is_pilot: false')
  })

  test('grinden kontrolleras i BÅDA riktningarna, blockering före betalning', () => {
    const blockerar = src.indexOf("ok('betalgrind_blockerar'")
    const betalning = src.indexOf("ok('simulera_betalning'")
    const slapper = src.indexOf("ok('betalgrind_slapper'")
    expect(blockerar).toBeGreaterThan(-1)
    expect(betalning).toBeGreaterThan(blockerar)
    expect(slapper).toBeGreaterThan(betalning)
    // Ett obetalt konto som slipper igenom är ett underkänt prov
    expect(src).toContain('ingen-provperiod-beslutet läcker')
    // Och ett betalt konto som blockeras likaså
    expect(src).toContain('kunden låses ute efter betalning')
  })

  test('finalize-effekterna körs med produktionens egna funktioner', () => {
    expect(src).toContain("from '@/lib/onboarding/payment-gate'")
    expect(src).toContain("from '@/lib/seed-defaults'")
    expect(src).toContain("from '@/lib/email/provision-inbound-route'")
    expect(src).toContain("from '@/lib/admin/adoption'")
  })

  test('adoptionen måste vara 0 av 8 — seedningen får inte räknas som användning', () => {
    expect(src).toContain('adoption.antal !== 0')
    expect(src).toContain('seedningen läcker in i måttet')
    expect(src).toContain('adoption.dag !== 1')
  })

  test('en okörd v106 fäller inte provet — men ett riktigt fel gör det', () => {
    expect(src).toContain("!route.ok && route.reason !== 'table_missing'")
  })
})

test.describe('städningen — endpointen lämnar inga spår', () => {
  test('städar barn före förälder och business_config sist', () => {
    const tabellerStart = src.indexOf('const SEEDADE_TABELLER')
    const tabellerSlut = src.indexOf('] as const', tabellerStart)
    const lista = src.slice(tabellerStart, tabellerSlut)
    for (const t of ['products', 'pending_approvals', 'email_inbound_route', 'quote_templates']) {
      expect(lista, `${t} ska städas`).toContain(`'${t}'`)
    }
    expect(lista).not.toContain("'business_config'")
    // business_config raderas efter loopen över barnen
    expect(src.indexOf("from('business_config').delete()")).toBeGreaterThan(tabellerSlut)
  })

  test('städningen körs även vid avbrott, och en misslyckad DELETE stoppar inte resten', () => {
    expect(src).toContain('const leftover = await cleanup().catch(')
    expect(src).toContain('leftover.push(')
    // Ingen städning innan något skapats
    expect(src).toContain('if (!skapad) return leftover')
  })
})
