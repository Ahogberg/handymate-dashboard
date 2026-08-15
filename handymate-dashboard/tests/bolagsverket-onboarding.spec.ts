/**
 * Facit för Bolagsverket-uppslaget som start av onboarding (2026-08-15).
 * Källskanning, browserlöst, samma stil som tests/onboarding-goals.spec.ts.
 *
 *   npx playwright test tests/bolagsverket-onboarding.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const route = read('app/api/onboarding/bolagsverket-lookup/route.ts')
const step2 = read('app/onboarding/components/Step2Business.tsx')
const authRoute = read('app/api/auth/route.ts')
const onboardingRoute = read('app/api/onboarding/route.ts')
const client = read('lib/bolagsverket/client.ts')
const migration = read('sql/v135_business_registered_address.sql')

test.describe('bolagsverket-lookup/route.ts — samma "aldrig fastna"-disciplin som scrape-website', () => {
  test('ingen hård auth-spärr — sessionen är valfri', () => {
    expect(route).toContain('getAuthenticatedBusiness(request).catch(() => null)')
  })

  test('rate-limitad per business/IP, egen nyckel-namnrymd (kolliderar inte med scrape:-buckets)', () => {
    expect(route).toContain("checkRateLimitDb(rateLimitKey")
    expect(route).toContain('bolagsverket:business:')
    expect(route).toContain('`bolagsverket:${ip}`')
  })

  test('org.nr valideras med den delade Luhn-checkaren innan uppslag görs', () => {
    expect(route).toContain("import { checkOrgNumber } from '@/lib/karin/org-number'")
    const lookupCall = route.indexOf('lookupCompany(')
    const checkCall = route.indexOf('checkOrgNumber(')
    expect(checkCall).toBeGreaterThan(-1)
    expect(checkCall).toBeLessThan(lookupCall)
  })

  test('svarar alltid 200 med {ok,...} — aldrig ett okontrollerat 500, utom 429', () => {
    // Samma teknik som verifierar scrape-website-mönstret: räkna NextResponse.json-
    // anrop och kontrollera att INGET av dem sätter en annan status än 429.
    const statusCalls = Array.from(route.matchAll(/NextResponse\.json\([^)]*\{[\s\S]*?\},\s*\{\s*status:\s*(\d+)/g))
    const statuses = statusCalls.map(m => m[1])
    expect(statuses.every(s => s === '429')).toBe(true)
  })

  test('catch-blocket returnerar ok:false, kastar aldrig vidare', () => {
    const catchStart = route.lastIndexOf('} catch')
    const catchBlock = route.slice(catchStart)
    expect(catchBlock).toContain('ok: false')
    expect(catchBlock).not.toMatch(/throw /)
  })
})

test.describe('lib/bolagsverket/client.ts — fail-soft, aldrig ett kastat fel ut ur lookupCompany', () => {
  test('saknade credentials ger not_configured direkt, ingen nätverksrundtur', () => {
    const fnStart = client.indexOf('export async function lookupCompany')
    const configCheck = client.indexOf("reason: 'not_configured'", fnStart)
    const tokenFetch = client.indexOf('fetchAccessToken(', fnStart)
    expect(configCheck).toBeGreaterThan(fnStart)
    expect(configCheck).toBeLessThan(tokenFetch)
  })

  test('try/catch omsluter det faktiska HTTP-anropet — inget kastas ut', () => {
    const fnStart = client.indexOf('export async function lookupCompany')
    const fnBody = client.slice(fnStart)
    expect(fnBody).toContain('try {')
    expect(fnBody).toContain("reason: 'request_failed'")
  })
})

test.describe('Step2Business.tsx — org.nr flyttat till start, före hemsides-frågan', () => {
  test("'orgnr' är startfasen, inte 'question'", () => {
    expect(step2).toContain("() => (data.hasWebsite !== undefined ? 'form' : 'orgnr')")
  })

  test('orgnr-fasen renderas FÖRE question-fasen i JSX:et', () => {
    const orgnrRender = step2.indexOf("webPhase === 'orgnr' &&")
    const questionRender = step2.indexOf("webPhase === 'question' &&")
    expect(orgnrRender).toBeGreaterThan(-1)
    expect(orgnrRender).toBeLessThan(questionRender)
  })

  test('lyckat uppslag fyller BARA tomma fält — samma disciplin som applyExtraction', () => {
    const fnStart = step2.indexOf('function applyBolagsverketData')
    const fnBody = step2.slice(fnStart, step2.indexOf('function runOrgLookup'))
    expect(fnBody).toContain('!data.companyName?.trim()')
    expect(fnBody).toContain('!data.companyForm?.trim()')
    expect(fnBody).toContain('!data.addressStreet?.trim()')
  })

  test('misslyckat uppslag blockerar aldrig — går vidare till question-fasen ändå', () => {
    const fnStart = step2.indexOf('async function runOrgLookup')
    const fnBody = step2.slice(fnStart, step2.indexOf('function submitOrgNumber'))
    // Sista raden i try/catch/finally-kedjan sätter alltid nästa fas, oavsett utfall.
    expect(fnBody).toContain("setWebPhase('question')")
  })

  test('org.nr sparas i data INNAN uppslaget startar — inte bara vid framgång', () => {
    const fnStart = step2.indexOf('async function runOrgLookup')
    const fnBody = step2.slice(fnStart, fnStart + 300)
    const updateCall = fnBody.indexOf('update({ orgNumber:')
    const phaseCall = fnBody.indexOf("setWebPhase('orgnrLookup')")
    expect(updateCall).toBeGreaterThan(-1)
    expect(updateCall).toBeLessThan(phaseCall)
  })

  test('company_profile_source skickas bara som bolagsverket när uppslaget FAKTISKT lyckades', () => {
    expect(step2).toContain('setOrgLookupSucceeded(true)')
    expect(step2).toContain("companyProfileSource: orgLookupSucceeded ? 'bolagsverket' : undefined")
  })
})

test.describe('app/api/auth/route.ts — Bolagsverket-fälten skrivs villkorat, inte tomma strängar', () => {
  test('nya fälten läses ur body', () => {
    expect(authRoute).toContain('companyForm')
    expect(authRoute).toContain('addressStreet')
    expect(authRoute).toContain('companyProfileSource')
  })

  test('company_profile_source skrivs BARA vid exakt värdet bolagsverket', () => {
    expect(authRoute).toContain("companyProfileSource === 'bolagsverket'")
  })

  test('migrationsfönstret (saknadKolumn-loopen) täcker även de nya fälten', () => {
    // Fälten läggs till i samma businessInsert-objekt som redan skyddas av
    // den befintliga saknadKolumn-loopen — inget nytt skydd behövs, bara att
    // de faktiskt ligger i objektet innan loopen (verifierat via ordning).
    const insertStart = authRoute.indexOf('const businessInsert')
    const companyFormLine = authRoute.indexOf('company_form: companyForm', insertStart)
    const loopStart = authRoute.indexOf('saknadKolumn(businessError)')
    expect(companyFormLine).toBeGreaterThan(insertStart)
    expect(companyFormLine).toBeLessThan(loopStart)
  })
})

test.describe('ALLOWED_COLUMNS — de nya adressfälten är vitlistade (samma tysta fälla som tidigare flaggats)', () => {
  test('address_street/postal_code/city är vitlistade', () => {
    expect(onboardingRoute).toContain("'address_street'")
    expect(onboardingRoute).toContain("'address_postal_code'")
    expect(onboardingRoute).toContain("'address_city'")
  })
})

test.describe('migrationen — nullable, ingen default, rör inte det gamla dödda address-fältet', () => {
  test('tre nya kolumner, alla nullable utan DEFAULT', () => {
    expect(migration).toContain('address_street text')
    expect(migration).toContain('address_postal_code text')
    expect(migration).toContain('address_city text')
    expect(migration).not.toContain('DEFAULT')
  })

  test('rör inte det gamla ostrukturerade address-fältet', () => {
    expect(migration).not.toMatch(/ADD COLUMN[^,]*\baddress\b(?!_)/)
  })
})
