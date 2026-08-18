/**
 * Browserlöst facit för Demo-etapp D3 — omkörbar onboarding med simulerade
 * wow-ögonblick, ENBART för demokontot.
 *
 * Körs utan session/browser:
 *   npx playwright test tests/demo-onboarding-replay.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const REPLAY_ROUTE_PATH = path.join(ROOT, 'app/api/admin/demo-onboarding-replay/route.ts')
const SIM_ROUTE_PATH = path.join(ROOT, 'app/api/admin/demo-fortnox-sim/route.ts')
const IS_DEMO_CLIENT_PATH = path.join(ROOT, 'lib/demo/is-demo-client.ts')
const STEP4_PATH = path.join(ROOT, 'app/onboarding/components/Step4PhoneNumber.tsx')
const STEP5_PATH = path.join(ROOT, 'app/onboarding/components/Step5Activate.tsx')
const STEP_IMPORT_PATH = path.join(ROOT, 'app/onboarding/components/StepImportData.tsx')
const PRESENTER_BAR_PATH = path.join(ROOT, 'components/demo/PresenterBar.tsx')
const DEMO_PAGE_PATH = path.join(ROOT, 'app/dashboard/demo/page.tsx')

const replaySource = fs.readFileSync(REPLAY_ROUTE_PATH, 'utf8')
const simSource = fs.readFileSync(SIM_ROUTE_PATH, 'utf8')
const isDemoClientSource = fs.readFileSync(IS_DEMO_CLIENT_PATH, 'utf8')
const step4Source = fs.readFileSync(STEP4_PATH, 'utf8')
const step5Source = fs.readFileSync(STEP5_PATH, 'utf8')
const stepImportSource = fs.readFileSync(STEP_IMPORT_PATH, 'utf8')
const presenterBarSource = fs.readFileSync(PRESENTER_BAR_PATH, 'utf8')
const demoPageSource = fs.readFileSync(DEMO_PAGE_PATH, 'utf8')

test.describe('lib/demo/is-demo-client.ts — delad klient-grind', () => {
  test('läser NEXT_PUBLIC_DEMO_BUSINESS_ID, ingen hårdkodad businessId', () => {
    expect(isDemoClientSource).toContain('process.env.NEXT_PUBLIC_DEMO_BUSINESS_ID')
    expect(isDemoClientSource).toContain('export function isDemoBusinessId')
  })
})

test.describe('POST /api/admin/demo-onboarding-replay — samma grindordning som demo-reset', () => {
  test('saknad DEMO_BUSINESS_ID och annan tenant stoppas med 403', () => {
    expect(replaySource).toMatch(/if\s*\(\s*!demoBusinessId\s*\|\|\s*business\.business_id\s*!==\s*demoBusinessId\s*\)/)
    const envGuard = replaySource.indexOf('!demoBusinessId || business.business_id !== demoBusinessId')
    const envResponse = replaySource.indexOf('{ status: 403 }', envGuard)
    expect(envGuard).toBeGreaterThan(-1)
    expect(envResponse).toBeGreaterThan(envGuard)
  })

  test('utan owner/admin blir svaret 403, FÖRE någon skrivning', () => {
    expect(replaySource).toContain('getCurrentUser(request, business.business_id)')
    const roleGuard = replaySource.indexOf('!currentUser || !isOwnerOrAdmin(currentUser)')
    const roleResponse = replaySource.indexOf('{ status: 403 }', roleGuard)
    const firstWrite = replaySource.indexOf(".from('business_config')\n      .update(")
    expect(roleGuard).toBeGreaterThan(-1)
    expect(roleResponse).toBeGreaterThan(roleGuard)
    expect(firstWrite).toBeGreaterThan(roleResponse)
  })

  test('manipulerad body kan aldrig välja en annan tenant (ingen request.json)', () => {
    expect(replaySource).not.toMatch(/await\s+request\.json\s*\(/)
  })

  test('nollställer båda onboarding-fälten, lämnar onboarding_data orörd', () => {
    expect(replaySource).toContain('onboarding_completed_at: null')
    expect(replaySource).toContain('onboarding_step: 1')
    expect(replaySource).not.toMatch(/onboarding_data:\s*(null|\{\})/)
  })

  test('nollställer alla fem Fortnox-statuskolumner (samma fem status-routen läser)', () => {
    for (const column of [
      'fortnox_connected: false',
      'fortnox_company_name: null',
      'fortnox_connected_at: null',
      'fortnox_last_synced_at: null',
      'fortnox_token_expires_at: null',
    ]) {
      expect(replaySource).toContain(column)
    }
  })

  test('städar fortnox_api_log och fortnox_sync (sim-specifika spår), rör inte customer/invoice', () => {
    expect(replaySource).toContain("from('fortnox_api_log')")
    expect(replaySource).toContain("from('fortnox_sync')")
    expect(replaySource).toMatch(/from\('fortnox_api_log'\)\s*\n\s*\.delete\(\)/)
    expect(replaySource).toMatch(/from\('fortnox_sync'\)\s*\n\s*\.delete\(\)/)
    expect(replaySource).not.toContain("from('customer')")
    expect(replaySource).not.toContain("from('invoice')")
  })
})

test.describe('POST /api/admin/demo-fortnox-sim — samma grindordning', () => {
  test('saknad DEMO_BUSINESS_ID och annan tenant stoppas med 403', () => {
    expect(simSource).toMatch(/if\s*\(\s*!demoBusinessId\s*\|\|\s*business\.business_id\s*!==\s*demoBusinessId\s*\)/)
    const envGuard = simSource.indexOf('!demoBusinessId || business.business_id !== demoBusinessId')
    const envResponse = simSource.indexOf('{ status: 403 }', envGuard)
    expect(envGuard).toBeGreaterThan(-1)
    expect(envResponse).toBeGreaterThan(envGuard)
  })

  test('utan owner/admin blir svaret 403, FÖRE någon skrivning', () => {
    expect(simSource).toContain('getCurrentUser(request, business.business_id)')
    const roleGuard = simSource.indexOf('!currentUser || !isOwnerOrAdmin(currentUser)')
    const roleResponse = simSource.indexOf('{ status: 403 }', roleGuard)
    const firstCustomerInsert = simSource.indexOf("from('customer').insert(")
    const firstInvoiceInsert = simSource.indexOf(".from('invoice')\n        .insert(")
    expect(roleGuard).toBeGreaterThan(-1)
    expect(roleResponse).toBeGreaterThan(roleGuard)
    expect(firstCustomerInsert).toBeGreaterThan(roleResponse)
    expect(firstInvoiceInsert).toBeGreaterThan(roleResponse)
  })

  test('manipulerad body kan aldrig välja en annan tenant (ingen request.json)', () => {
    expect(simSource).not.toMatch(/await\s+request\.json\s*\(/)
  })

  test('fakturaraderna byggs via mapFortnoxInvoice — samma reminder-säkerhet som riktiga importen', () => {
    expect(simSource).toContain("import { mapFortnoxInvoice } from '@/lib/fortnox/map-invoice'")
    expect(simSource).toContain('mapFortnoxInvoice(fakeFortnoxInvoice, today)')
    // Simmen skriver ALDRIG next_reminder_at eller ett annat reminder_count
    // än det mapFortnoxInvoice redan garanterar (0) — ingen genväg runt den
    // delade, testade mappningsfunktionen. (Ordet får nämnas i kommentarer,
    // men aldrig som en faktisk nyckel-tilldelning i en insert-payload.)
    expect(simSource).not.toMatch(/next_reminder_at\s*:/)
    expect(simSource).not.toMatch(/reminder_count:\s*[1-9]/)
  })

  test('sätter alla fem Fortnox-statuskolumner till anslutet läge', () => {
    for (const column of [
      'fortnox_connected: true',
      'fortnox_company_name: businessName',
      'fortnox_connected_at: nowIso',
      'fortnox_last_synced_at: nowIso',
      'fortnox_token_expires_at:',
    ]) {
      expect(simSource).toContain(column)
    }
  })

  test('svarar med {imported, skipped, unlinked, total_outstanding_kr} per resurs (samma form som riktiga importen)', () => {
    expect(simSource).toMatch(/customers:\s*\{[^}]*imported:\s*customerResults\.imported/)
    expect(simSource).toMatch(/invoices:\s*\{[\s\S]*imported:\s*invoiceResults\.imported[\s\S]*unlinked:\s*invoiceResults\.unlinked[\s\S]*total_outstanding_kr/)
  })

  test('kräver ägarens mobilnummer innan simulering (samma mönster som seed-demo-account.ts)', () => {
    expect(simSource).toContain('personal_phone')
    expect(simSource).toMatch(/if\s*\(\s*!ownerPhone\s*\)/)
  })
})

test.describe('Klient-stegen grenar BARA på demo-flaggan — icke-demo-vägen är källskannat oförändrad', () => {
  test('Step4PhoneNumber: den riktiga 46elks-reservationen finns kvar exakt', () => {
    expect(step4Source).toContain('/api/onboarding/phone/reserve')
    expect(step4Source).toContain("import { isDemoBusinessId } from '@/lib/demo/is-demo-client'")
    expect(step4Source).toContain('isDemoBusinessId(data.businessId)')
  })

  test('Step5Activate: det riktiga Stripe-checkout-anropet finns kvar exakt', () => {
    expect(step5Source).toContain('/api/billing/onboarding-checkout')
    expect(step5Source).toContain("import { isDemoBusinessId } from '@/lib/demo/is-demo-client'")
    expect(step5Source).toContain('isDemoBusinessId(data.businessId)')
  })

  test('StepImportData: den riktiga Fortnox-OAuth-länken finns kvar exakt', () => {
    expect(stepImportSource).toContain('/api/integrations/fortnox/connect?return=onboarding')
    expect(stepImportSource).toContain("import { isDemoBusinessId } from '@/lib/demo/is-demo-client'")
    expect(stepImportSource).toContain('isDemoBusinessId(data.businessId)')
    expect(stepImportSource).toContain('/api/admin/demo-fortnox-sim')
  })
})

test.describe('"Visa onboardingen" — presentatörsverktygen', () => {
  test('PresenterBar anropar replay-rutten och navigerar till /onboarding', () => {
    expect(presenterBarSource).toContain('/api/admin/demo-onboarding-replay')
    expect(presenterBarSource).toContain("window.location.assign('/onboarding')")
  })

  test('dashboard/demo-sidan anropar replay-rutten och navigerar till /onboarding', () => {
    expect(demoPageSource).toContain('/api/admin/demo-onboarding-replay')
    expect(demoPageSource).toContain("window.location.assign('/onboarding')")
  })
})
