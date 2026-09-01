/**
 * Facit: CI-grinden (2026-09-01).
 *
 * Låser tre beslut:
 *  1. .github/workflows/contracts.yml är push/PR-grinden: tsc + de
 *     browserlösa kontraktssviterna, inga hemligheter, inga browsers.
 *     Varje fil den listar måste finnas.
 *  2. .github/workflows/playwright.yml (fulla prod-sviten med service-role-
 *     nyckel) är NATTLIG + workflow_dispatch — aldrig på push/PR igen.
 *  3. Tvåtenant-RLS-beviset (tests/tenant-isolation.integration.spec.ts)
 *     körs i CI som eget jobb, och hoppar SYNLIGT när secrets saknas.
 *
 * Körs: npx playwright test tests/facit-ci-grind.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const APP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(APP_ROOT, '..')
const WORKFLOWS = path.join(REPO_ROOT, '.github', 'workflows')
const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

/** Texten i `on:`-blocket (till nästa toppnivånyckel). */
function onBlock(yaml: string): string {
  const m = yaml.match(/^on:\n([\s\S]*?)^(?=[a-z])/m)
  return m ? m[1] : ''
}

test.describe('Kontraktsgrinden (contracts.yml)', () => {
  const file = path.join(WORKFLOWS, 'contracts.yml')

  test('finns och gäller push + pull_request', () => {
    expect(fs.existsSync(file), 'contracts.yml saknas').toBe(true)
    const on = onBlock(read(file))
    expect(on).toMatch(/^\s+push:/m)
    expect(on).toMatch(/^\s+pull_request:/m)
  })

  test('kör tsc och kärnkontrakten', () => {
    const yaml = read(file)
    expect(yaml).toContain('npx tsc --noEmit')
    for (const svit of [
      'tests/cron-auth.spec.ts',
      'tests/permission-contract.spec.ts',
      'tests/schema-contract.spec.ts',
      'tests/column-contract.spec.ts',
      'tests/facit-ci-grind.spec.ts',
      'tests/facit-driftsynlighet.spec.ts',
      'tests/kortkvalitet.spec.ts',
    ]) {
      expect(yaml, `${svit} saknas i grinden`).toContain(svit)
    }
    expect(yaml).toContain('--no-deps')
  })

  test('varje listad testfil finns', () => {
    const yaml = read(file)
    const listade = Array.from(yaml.matchAll(/tests\/[a-z0-9-]+\.spec\.ts/g)).map(m => m[0])
    expect(listade.length).toBeGreaterThanOrEqual(7)
    for (const rel of listade) {
      expect(fs.existsSync(path.join(APP_ROOT, rel)), `${rel} listas i contracts.yml men finns inte`).toBe(true)
    }
  })

  test('kräver inga produktionshemligheter och ingen browser', () => {
    const yaml = read(file)
    expect(yaml).not.toContain('secrets.')
    expect(yaml).not.toContain('playwright install')
  })

  test('den gamla "att lägga in"-filen i repo-roten är borta', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'contracts-workflow-att-lagga-in.yml'))).toBe(false)
  })
})

test.describe('Nattliga prod-sviten (playwright.yml)', () => {
  const file = path.join(WORKFLOWS, 'playwright.yml')

  test('kör på schema + workflow_dispatch, aldrig på push/PR', () => {
    const yaml = read(file)
    const on = onBlock(yaml)
    expect(on).toMatch(/^\s+schedule:/m)
    expect(on).toMatch(/cron:/)
    expect(on).toMatch(/^\s+workflow_dispatch:/m)
    expect(on, 'prod-sviten får inte köras på push').not.toMatch(/^\s+push:/m)
    expect(on, 'prod-sviten får inte köras på pull_request').not.toMatch(/^\s+pull_request:/m)
  })

  test('tvåtenant-RLS-beviset är ett eget jobb med synlig hoppning', () => {
    const yaml = read(file)
    expect(yaml).toMatch(/^\s+tenant-isolation:/m)
    expect(yaml).toContain('npm run test:tenant-isolation')
    expect(yaml).toContain('TENANT_TEST_ALLOW_DESTRUCTIVE_RLS_PROBE')
    expect(yaml).toContain('::warning::')
    for (const v of ['TENANT_A_EMAIL', 'TENANT_A_PASSWORD', 'TENANT_A_BUSINESS_ID', 'TENANT_B_EMAIL', 'TENANT_B_PASSWORD', 'TENANT_B_BUSINESS_ID', 'TENANT_TEST_SUPABASE_URL', 'TENANT_TEST_SUPABASE_SERVICE_ROLE_KEY']) {
      expect(yaml, `${v} skickas inte till jobbet`).toContain(`${v}: \${{ secrets.${v} }}`)
    }
  })

  test('npm-scriptet test:tenant-isolation pekar på integrationskonfigen', () => {
    const pkg = JSON.parse(read(path.join(APP_ROOT, 'package.json')))
    expect(pkg.scripts['test:tenant-isolation']).toContain('playwright.integration.config.ts')
    expect(fs.existsSync(path.join(APP_ROOT, 'tests', 'tenant-isolation.integration.spec.ts'))).toBe(true)
  })
})
