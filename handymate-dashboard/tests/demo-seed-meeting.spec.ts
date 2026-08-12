/**
 * Facit för demo-seed-meeting — dev-verktyget som skapar ett påhittat
 * mötestranskript på demokontot och kör det genom mötesanalysen, så
 * customer_fact-flödet kan testas utan ett riktigt fältbesök.
 *
 * Körs utan session/browser:
 *   npx playwright test tests/demo-seed-meeting.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const ROUTE_PATH = path.join(ROOT, 'app/api/admin/demo-seed-meeting/route.ts')
const RESET_ROUTE_PATH = path.join(ROOT, 'app/api/admin/demo-reset/route.ts')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/demo/page.tsx')

const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8')
const resetRouteSource = fs.readFileSync(RESET_ROUTE_PATH, 'utf8')
const pageSource = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('demo-seed-meeting route — samma grind som demo-reset', () => {
  test('kräver inloggning via getAuthenticatedBusiness', () => {
    expect(routeSource).toContain('getAuthenticatedBusiness(request)')
    expect(routeSource).toContain("{ error: 'Unauthorized' }")
  })

  test('saknad DEMO_BUSINESS_ID och annan tenant stoppas med 403 — samma villkor som demo-reset', () => {
    expect(routeSource).toMatch(/if\s*\(\s*!demoBusinessId\s*\|\|\s*business\.business_id\s*!==\s*demoBusinessId\s*\)/)
    const envGuard = routeSource.indexOf('!demoBusinessId || business.business_id !== demoBusinessId')
    const envResponse = routeSource.indexOf('{ status: 403 }', envGuard)
    expect(envGuard).toBeGreaterThan(-1)
    expect(envResponse).toBeGreaterThan(envGuard)

    // Samma villkor ska finnas ordagrant i demo-reset — grinden får inte glida isär.
    expect(resetRouteSource).toContain('!demoBusinessId || business.business_id !== demoBusinessId')
  })

  test('utan owner/admin blir svaret 403 — samma rollkontroll som demo-reset', () => {
    expect(routeSource).toContain('getCurrentUser(request, business.business_id)')
    const roleGuard = routeSource.indexOf('!currentUser || !isOwnerOrAdmin(currentUser)')
    const roleResponse = routeSource.indexOf('{ status: 403 }', roleGuard)
    expect(roleGuard).toBeGreaterThan(-1)
    expect(roleResponse).toBeGreaterThan(roleGuard)

    expect(resetRouteSource).toContain('!currentUser || !isOwnerOrAdmin(currentUser)')
  })

  test('rollkontrollen körs efter tenant-kontrollen, inte före', () => {
    const envGuard = routeSource.indexOf('!demoBusinessId || business.business_id !== demoBusinessId')
    const roleGuard = routeSource.indexOf('!currentUser || !isOwnerOrAdmin(currentUser)')
    expect(envGuard).toBeGreaterThan(-1)
    expect(roleGuard).toBeGreaterThan(envGuard)
  })
})

test.describe('demo-seed-meeting route — flödet', () => {
  test('slår upp kund och bokning när de inte anges, med svenskt fel om inget finns', () => {
    expect(routeSource).toContain("from('customer')")
    expect(routeSource).toContain("from('booking')")
    expect(routeSource).toContain("order('created_at'")
    expect(routeSource).toContain('Kör "Återställ demon" på /dashboard/demo först')
  })

  test('call_recording skapas i samma form som produktionsvägen (site_visit)', () => {
    expect(routeSource).toContain("from('call_recording')")
    expect(routeSource).toContain("source: 'site_visit'")
    expect(routeSource).toContain('transcript_summary: null')
    expect(routeSource).toContain('direction: null')
    expect(routeSource).toContain('phone_number: null')
    expect(routeSource).toContain('recording_url: null')
  })

  test('analysen AWAITAS (inte fire-and-forget) och recording-raden rullas aldrig tillbaka vid fel', () => {
    const insertIndex = routeSource.indexOf("from('call_recording')")
    const fetchIndex = routeSource.indexOf("fetch(`${appUrl}/api/voice/analyze`")
    expect(insertIndex).toBeGreaterThan(-1)
    expect(fetchIndex).toBeGreaterThan(insertIndex)
    expect(routeSource).toContain('await fetch(')
    expect(routeSource).not.toContain('.catch(err => console.error')
    expect(routeSource).toContain("'x-internal-secret': process.env.CRON_SECRET")
    // Vid analysfel: recording_id skickas ändå med i svaret — inget delete().
    expect(routeSource).not.toMatch(/\.from\('call_recording'\)\s*\.delete\(/)
  })
})

test.describe('default-transkriptet täcker alla fyra customer_fact-typer', () => {
  test('innehåller en tydlig materialpreferens', () => {
    expect(routeSource).toContain('Jag vill ha ekparkett, inte laminat')
  })

  test('innehåller en tydlig begränsning', () => {
    expect(routeSource).toContain('hund')
    expect(routeSource).toContain('halkigt')
  })

  test('innehåller ett tydligt löfte/åtagande', () => {
    expect(routeSource).toContain('Jag lovar att vi är klara innan midsommar')
  })

  test('innehåller en kontaktuppgift', () => {
    expect(routeSource).toMatch(/070-555 12 34/)
    expect(routeSource).toContain('Portkoden')
  })

  test('innehåller ett tydligt offertrelaterat uttalande (för create_quote_draft)', () => {
    expect(routeSource).toContain('skicka en skriftlig offert')
    expect(routeSource).toMatch(/145\s?000 kronor/)
  })

  test('tidsstämplarna matchar assembleTranscript-formatet ([mm:ss] på egen rad)', () => {
    expect(routeSource).toMatch(/`\[00:00\]\n/)
    expect(routeSource.match(/\[\d{2}:\d{2}\]/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

test.describe('UI-triggern på /dashboard/demo', () => {
  test('anropar demo-seed-meeting utan body och visar kort-antal', () => {
    expect(pageSource).toContain("fetch('/api/admin/demo-seed-meeting'")
    expect(pageSource).toContain('handleSeedMeeting')
    expect(pageSource).toContain('cards_created')
  })

  test('har egen svensk resultatruta, separat från reset-resultatet', () => {
    expect(pageSource).toContain('meetingResult')
    expect(pageSource).toContain('Skapa testmöte')
    expect(pageSource).toContain('Testmöte')
  })
})
