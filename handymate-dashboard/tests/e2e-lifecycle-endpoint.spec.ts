/**
 * Källskanning för app/api/debug/e2e-lifecycle/route.ts — rökprovar
 * livscykelns ANDRA halva (fortsättning på e2e-quote som täcker
 * kund→offert→signering→projekt→deal).
 *
 * Samma stil som tests/testdata-filter.spec.ts: läser källfilen som text
 * och låser att mönstren e2e-quote redan etablerat (produktionsgrind,
 * testdata-prefix) återanvänds ordagrant, plus att den här endpointens
 * egna avvikelse (städning barn-före-förälder) faktiskt finns i rätt
 * ordning i koden.
 *
 *   npx playwright test tests/e2e-lifecycle-endpoint.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { arTestId, arTestNamn } from '../lib/testdata'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const src = read('app/api/debug/e2e-lifecycle/route.ts')

test.describe('produktionsgrind — samma mönster som e2e-quote', () => {
  test('NODE_ENV=production kräver isAdmin innan getAuthenticatedBusiness', () => {
    expect(src).toContain("process.env.NODE_ENV === 'production'")
    expect(src).toContain("from '@/lib/admin-auth'")
    expect(src).toContain('adminCheck.isAdmin')
    expect(src).toContain("status: 403")

    const nodeEnvCheck = src.indexOf("process.env.NODE_ENV === 'production'")
    const authCheck = src.indexOf('getAuthenticatedBusiness(request)')
    expect(nodeEnvCheck).toBeGreaterThan(-1)
    expect(authCheck).toBeGreaterThan(-1)
    expect(nodeEnvCheck).toBeLessThan(authCheck)
  })

  test('getAuthenticatedBusiness anropas och 401:as om den saknas', () => {
    expect(src).toContain("from '@/lib/auth'")
    expect(src).toContain('getAuthenticatedBusiness(request)')
    expect(src).toContain('status: 401')
  })

  test('maxDuration 30, precis som spec:en kräver', () => {
    expect(src).toContain('export const maxDuration = 30')
  })
})

test.describe('testdata-prefix — samma producentmönster som e2e-quote', () => {
  test("kunden bär 'test_' + Date.now()", () => {
    expect(src).toContain("'test_' + Date.now()")
    expect(arTestId('test_' + 1723190000000)).toBe(true)
  })

  test("namnen 'E2E Testkund' och 'E2E Livscykel' finns — arTestNamn fångar dem", () => {
    expect(src).toContain('E2E Testkund')
    expect(src).toContain('E2E Livscykel')
    expect(arTestNamn('E2E Testkund')).toBe(true)
    expect(arTestNamn('E2E Livscykel')).toBe(true)
  })

  test('project_id har inget testprefix (DB-default gen_random_uuid) — namnet bär filtreringen istället', () => {
    // Dokumenterar en medveten avvikelse: till skillnad från e2e-quotes
    // quote_id ('e2e_' + Date.now()) genereras project.project_id av en
    // DB-default utan prefix. Skulle någon av misstag börja sätta ett eget
    // 'test_'-id här utan att uppdatera den här kommentaren, är det ändå
    // ofarligt — men om NAMNET 'E2E Livscykel' försvinner ur källan har
    // täckningen tappats, så den låses explicit ovan.
    expect(src).not.toMatch(/project_id:\s*'test_'/)
  })
})

test.describe('städsektionen — barn före förälder', () => {
  test('cleanup() raderar i rätt ordning: lärdom → godkännande → utfall → ÄTA → tid → projekt → kund', () => {
    const order = [
      "from('project_lesson').delete()",
      "from('pending_approvals').delete()",
      "from('project_outcome').delete()",
      "from('project_change').delete()",
      "from('time_entry').delete()",
      "from('project').delete()",
      "from('customer').delete()",
    ]
    const positions = order.map((needle) => {
      const idx = src.indexOf(needle)
      expect(idx, `${needle} saknas i cleanup()`).toBeGreaterThan(-1)
      return idx
    })
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i], `${order[i]} ska stå efter ${order[i - 1]}`).toBeGreaterThan(positions[i - 1])
    }
  })

  test('städningen körs även vid tidigt avbrott (catch-blocket), inte bara på lyckad väg', () => {
    const tryCleanupCall = src.indexOf('await cleanup()')
    const catchBlock = src.indexOf('catch (err)')
    expect(tryCleanupCall).toBeGreaterThan(-1)
    expect(catchBlock).toBeGreaterThan(-1)
    const catchCleanupCall = src.indexOf('await cleanup()', catchBlock)
    expect(catchCleanupCall).toBeGreaterThan(catchBlock)
  })

  test('slutsteget "Städat — inga spår kvar" finns i steps-listan', () => {
    expect(src).toContain('Städat — inga spår kvar')
  })
})

test.describe('debrief-svaret speglar approvals-caset exakt', () => {
  test('project_lesson-raden bär job_type, lesson_text, impact_hint och source=debrief', () => {
    expect(src).toContain("job_type: 'badrum'")
    expect(src).toContain("lesson_text: 'E2E-testlärdom: rivningen tog längre tid'")
    expect(src).toContain("impact_hint: 'Vad tog längre tid än planerat?'")
    expect(src).toContain("source: 'debrief'")
  })

  test('kortet flippas till approved med samma fält som approvals/[id]/route.ts case project_debrief', () => {
    expect(src).toContain("status: 'approved'")
    expect(src).toContain('resolved_at:')
  })

  test('cirkel-verifieringen (steg 7) använder EXAKT samma filter som fetchRecentLessons', () => {
    const lessonGen = read('lib/ai-quote-generator.ts')
    expect(lessonGen).toContain("eq('business_id', businessId)")
    expect(lessonGen).toContain("eq('job_type', jobType)")
    expect(src).toContain("eq('business_id', business.business_id)")
    expect(src).toContain("eq('job_type', 'badrum')")
  })
})

test.describe('stängningen återanvänder de kanoniska byggstenarna, inte HTTP-PUT:en', () => {
  test('freezeProjectOutcome, getProjectOutcome och skapaDebriefKort importeras direkt (dynamic import, samma som PUT-routen)', () => {
    expect(src).toContain("import('@/lib/efterkalkyl/freeze-outcome')")
    expect(src).toContain('freezeProjectOutcome(supabase, business.business_id, projectId)')
    expect(src).toContain("import('@/lib/efterkalkyl/get-project-outcome')")
    expect(src).toContain('getProjectOutcome(supabase, business.business_id, projectId)')
    expect(src).toContain("import('@/lib/debrief/create-debrief-card')")
    expect(src).toContain('skapaDebriefKort(supabase, business.business_id')
  })

  test('anropar INTE PUT /api/projects (ingen fetch mot den egna routen)', () => {
    expect(src).not.toContain("/api/projects'")
    expect(src).not.toMatch(/fetch\(.*api\/projects/)
  })
})
