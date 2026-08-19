/**
 * Lanseringserbjudandet "Grundarkunderna" (Andreas-beslut 2026-08-19): de
 * första 20 RIKTIGA betalande företagen låser sitt pris för alltid, får 90
 * dagars pengarna-tillbaka-garanti i stället för 30, och direktlinje till
 * grundaren första året.
 *
 * Facit-idiomet är källskanning (samma mönster som tests/yearly-plan.spec.ts
 * och tests/anvandartaket.spec.ts) — ingen körande DB krävs:
 *   - flaggan härleds ur RIKTIGA prenumerationsfält, inte en gissning
 *   - demo-/testkonton exkluderas explicit
 *   - klienten får ALDRIG ett antal — bara en boolean, ingen räknare
 *   - bannertexten är exakt den beslutade
 *   - bannern är alltid villkorad på flaggan, aldrig ovillkorlig
 *
 * Körs utan browser/session:
 *   npx playwright test tests/founders-offer.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const HELPER = 'lib/billing/founders-offer.ts'
const BANNER_TITLE = 'Lanseringserbjudande — Grundarkunderna'
const BANNER_BODY =
  'Du blir en av de första 20: priset låses för alltid — det höjs aldrig för dig — och du får en direktlinje till grundaren under hela första året.'

test.describe('isFoundersOfferAvailable — frågan mot riktiga prenumerationsfält', () => {
  test('räknar på stripe_subscription_id + subscription_status = active', () => {
    const s = read(HELPER)
    expect(s).toContain(".from('business_config')")
    expect(s).toContain(".not('stripe_subscription_id', 'is', null)")
    expect(s).toContain(".eq('subscription_status', 'active')")
  })

  test('demo-/testkonton exkluderas explicit (is_demo_tenant)', () => {
    const s = read(HELPER)
    expect(s).toContain(".eq('is_demo_tenant', false)")
  })

  test('20 platser — inte hårdkodat på flera ställen, en enda konstant', () => {
    const s = read(HELPER)
    expect(s).toContain('FOUNDERS_SEATS = 20')
    expect(s).toContain('count ?? FOUNDERS_SEATS) < FOUNDERS_SEATS')
  })

  test('returnerar boolean, aldrig ett antal', () => {
    const s = read(HELPER)
    expect(s).toContain('Promise<boolean>')
    // head:true + count:'exact' — vi hämtar en räkning för JÄMFÖRELSEN,
    // men funktionens retur är alltid < 20, aldrig count självt.
    expect(s).toContain("count: 'exact'")
    expect(s).toContain('head: true')
  })

  test('fail-closed: ett DB-fel ger false, aldrig true genom en tyst gissning', () => {
    const s = read(HELPER)
    expect(s).toContain('if (error)')
    expect(s).toContain('return false')
    expect(s).toContain('catch (err)')
  })
})

test.describe('servern skickar ALDRIG ett antal till klienten', () => {
  const routes = ['app/api/onboarding/route.ts', 'app/api/billing/route.ts']

  for (const routePath of routes) {
    test(`${routePath} exponerar founders_available (boolean) men inget count-fält`, () => {
      const s = read(routePath)
      expect(s).toContain('isFoundersOfferAvailable')
      expect(s).toContain('founders_available:')
      // Ingen räknare får läcka ut — varken ett kvar-antal eller platser-slut.
      for (const forbidden of ['founders_remaining', 'founders_count', 'seats_left', 'FOUNDERS_SEATS']) {
        expect(s, `${routePath} läcker en räknare via "${forbidden}"`).not.toContain(forbidden)
      }
    })
  }
})

test.describe('Step5Activate — bannern', () => {
  const FILE = 'app/onboarding/components/Step5Activate.tsx'

  test('exakt rubrik och text', () => {
    const s = read(FILE)
    expect(s).toContain(BANNER_TITLE)
    expect(s).toContain(BANNER_BODY)
  })

  test('bannern är villkorad på data.foundersAvailable — aldrig ovillkorlig', () => {
    const s = read(FILE)
    const gateIdx = s.indexOf('data.foundersAvailable && (')
    const titleIdx = s.indexOf(BANNER_TITLE)
    expect(gateIdx, 'ingen {data.foundersAvailable && (...)}-grind hittad').toBeGreaterThan(-1)
    expect(titleIdx).toBeGreaterThan(gateIdx)
    // Bara EN förekomst av rubriken — ingen dold andra kopia utanför grinden.
    expect(s.indexOf(BANNER_TITLE, titleIdx + 1)).toBe(-1)
  })

  test('befintliga 30-dagars-garantiraden står kvar oförändrad', () => {
    const s = read(FILE)
    expect(s).toContain('30 dagars resultatgaranti')
    expect(s).toContain('pengarna tillbaka')
  })
})

test.describe('Billing-sidan — bannern', () => {
  const FILE = 'app/dashboard/settings/billing/page.tsx'

  test('exakt rubrik och text', () => {
    const s = read(FILE)
    expect(s).toContain(BANNER_TITLE)
    expect(s).toContain(BANNER_BODY)
  })

  test('bannern är villkorad på billing?.founders_available — aldrig ovillkorlig', () => {
    const s = read(FILE)
    const gateIdx = s.indexOf('billing?.founders_available && (')
    const titleIdx = s.indexOf(BANNER_TITLE)
    expect(gateIdx, 'ingen {billing?.founders_available && (...)}-grind hittad').toBeGreaterThan(-1)
    expect(titleIdx).toBeGreaterThan(gateIdx)
    expect(s.indexOf(BANNER_TITLE, titleIdx + 1)).toBe(-1)
  })
})

test.describe('OnboardingFormData — foundersAvailable är server-härlett', () => {
  test('typad i types-redesign.ts', () => {
    const s = read('app/onboarding/types-redesign.ts')
    expect(s).toContain('foundersAvailable?: boolean')
  })

  test('page.tsx mappar d.founders_available (GET-svaret) — inte ett klientpåhitt', () => {
    const s = read('app/onboarding/page.tsx')
    expect(s).toContain('foundersAvailable: Boolean(d.founders_available)')
  })
})
