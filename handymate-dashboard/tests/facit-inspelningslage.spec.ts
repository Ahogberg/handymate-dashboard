/**
 * Facit: inspelningsläget (tests/filming) kan aldrig köra mot ett riktigt
 * kundkonto, filmar aldrig testdata-filtrerade namn, och rör aldrig cronar.
 * (Video Creative Bible, 2026-08-28.)
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const root = path.join(__dirname, '..')
const las = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n')
const specs = fs
  .readdirSync(path.join(root, 'tests/filming'))
  .filter((f) => /^f\d\d-.*\.spec\.ts$/.test(f))
  .map((f) => `tests/filming/${f}`)

test('playwright.config har ett isolerat filming-projekt som standardsviten ignorerar', () => {
  const cfg = las('playwright.config.ts')
  expect(cfg).toMatch(/testIgnore: \[.*filming\[\\\\\/\]\/\],/)
  const block = cfg.slice(cfg.indexOf("name: 'filming'"))
  expect(block).toContain("testDir: './tests/filming'")
  expect(block).toContain('testIgnore: []')
  expect(block).toContain('storageState: { cookies: [], origins: [] }')
})

test('fixtures: spärren läser is_demo_tenant ur databasen och filmnamn vaktas mot testdata-filtret', () => {
  const fx = las('tests/filming/fixtures/filming.ts')
  expect(fx).toContain("select('business_id, business_name, is_demo_tenant')")
  expect(fx).toContain('data.is_demo_tenant !== true')
  expect(fx).toContain('/E2E|Testkund/.test(name)')
  expect(fx).toContain("localStorage.setItem('handymate_welcome_dismissed', '1')")
  expect(fx).toContain('recordVideo: { dir, size: FILM_VIDEO_SIZE }')
})

test('varje filmspec kör spärren först, städar rester, och rör aldrig cronar eller riktiga utskick utan flagga', () => {
  expect(specs.length).toBeGreaterThanOrEqual(3)
  for (const spec of specs) {
    const s = las(spec)
    const tenantGate = s.indexOf('await assertFilmingTenant()')
    expect(tenantGate, `${spec} saknar assertFilmingTenant()`).toBeGreaterThan(-1)
    const firstWrite = Math.min(...['apiOk(', 'api(', '.update(', '.insert('].map((k) => (s.indexOf(k) < 0 ? Infinity : s.indexOf(k))))
    expect(tenantGate, `${spec}: spärren måste komma före första skrivningen`).toBeLessThan(firstWrite)
    expect(s.indexOf('await sweepFilmResidue()')).toBeLessThan(firstWrite)
    expect(s).not.toContain('/api/cron/')
    expect(s).not.toContain('/api/debug/')
    expect(s).toContain('finishFilm(')
    expect(s).toContain('writeTruth(')
    for (const m of Array.from(s.matchAll(/assertFilmName\('([^']+)'\)/g))) {
      expect(m[1]).not.toMatch(/E2E|Testkund/)
    }
  }
})

test('F06: Daniels kort kommer från produktens egen byggare, och godkännandet är flaggat', () => {
  const s = las('tests/filming/f06-offert.spec.ts')
  expect(s).toContain("from '@/lib/agents/daniel/quote-follow-up-card'")
  expect(s).toContain("from '@/lib/agents/daniel/unopened-quotes'")
  expect(s).toContain("process.env.FILMING_APPROVE === '1'")
  // Kortet får aldrig skrivas direkt av harnesset — bara av produktens byggare.
  expect(s).not.toContain("from('pending_approvals')")
})

test('F07: readiness läses med produktens egen funktion, ÄTA blockerar, verdict är aldrig antagen', () => {
  const s = las('tests/filming/f07-klart.spec.ts')
  expect(s).toContain("from '@/lib/projects/commercial-readiness'")
  expect(s).toContain("expect(readiness.verdict, sammanfattning).not.toBe('ready')")
  expect(s).toContain("toContain('väntar på kundgodkännande')")
  expect(s).toContain("status: 'sent'")
})

test('F08: lead OCH affär läses ur databasen innan pipelinen filmas', () => {
  const s = las('tests/filming/f08-ny-kund.spec.ts')
  const lead = s.indexOf("pollRow<")
  const pipeline = s.indexOf("page.goto('/dashboard/pipeline')")
  expect(lead).toBeGreaterThan(-1)
  expect(lead).toBeLessThan(pipeline)
  expect(s).toContain("toBe('new_inquiry')")
})
