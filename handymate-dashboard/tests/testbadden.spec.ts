/**
 * Facit för testbädden (2026-08-09).
 *
 * sql/testbed_tenant_isolation.sql är en självförsörjande miniatyr av
 * prod-schemat, byggd för att cross-tenant-provet äntligen ska kunna köras —
 * business_config har ingen CREATE TABLE någon annanstans i sql/.
 *
 * Risken med en miniatyr är drift: testet lägger till en fixture-kolumn,
 * testbädden saknar den, och provet failar på schema i stället för på RLS.
 * Det här facitet läser BÅDA filerna och kräver att varje kolumn som
 * integrationstestets fixtures och update-prober rör finns i testbädden.
 *
 *   npx playwright test tests/testbadden.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const TESTBED = 'sql/testbed_tenant_isolation.sql'
const SPEC = 'tests/tenant-isolation.integration.spec.ts'

/** Tabellblocket i testbädden — från CREATE TABLE till dess stängande parentes. */
function tabellBlock(sql: string, tabell: string): string {
  const i = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${tabell} (`)
  expect(i, `testbädden saknar CREATE TABLE för ${tabell}`).toBeGreaterThan(-1)
  return sql.slice(i, sql.indexOf(');', i))
}

/** Kolumnnycklarna i ett objektliteral i specen (fixtureRows/UPDATE_PATCH). */
function nycklarI(block: string): string[] {
  return (block.match(/^\s{6}([a-z_]+):/gm) || []).map(k => k.trim().replace(':', ''))
}

test('varje fixturekolumn i integrationstestet finns i testbädden', () => {
  const spec = read(SPEC)
  const sql = read(TESTBED)

  // fixtureRows() — ett block per tabell.
  const start = spec.indexOf('function fixtureRows')
  const slut = spec.indexOf('async function authenticatedClient')
  const fixtures = spec.slice(start, slut)

  const tabeller = ['project', 'project_change', 'project_material', 'time_entry', 'supplier_invoices']
  for (const tabell of tabeller) {
    const blockStart = fixtures.indexOf(`${tabell}: {`)
    expect(blockStart, `fixture för ${tabell} hittas inte i specen`).toBeGreaterThan(-1)
    const block = fixtures.slice(blockStart, fixtures.indexOf('},', blockStart))
    const sqlBlock = tabellBlock(sql, tabell)
    for (const kolumn of nycklarI(block)) {
      expect(sqlBlock, `${tabell}.${kolumn} saknas i testbädden`).toContain(kolumn)
    }
  }
})

test('varje update-prob-kolumn finns i testbädden', () => {
  const spec = read(SPEC)
  const sql = read(TESTBED)
  const i = spec.indexOf('const UPDATE_PATCH')
  const block = spec.slice(i, spec.indexOf('}', spec.indexOf('business_config', i)))
  // Ex: project: { description: ... } → description ska finnas på project.
  const rader = block.match(/([a-z_]+): \{ ([a-z_]+):/g) || []
  expect(rader.length).toBeGreaterThan(4)
  for (const rad of rader) {
    const [, tabell, kolumn] = rad.match(/([a-z_]+): \{ ([a-z_]+):/)!
    expect(tabellBlock(sql, tabell), `${tabell}.${kolumn} (update-proben) saknas i testbädden`).toContain(kolumn)
  }
})

test('testbädden härdar samma sex tabeller som v96, med samma funktion', () => {
  const sql = read(TESTBED)
  const v96 = read('sql/v96_tenant_rls_and_credentials.sql')

  // Samma tabellista …
  const lista = (s: string) => {
    const i = s.indexOf('FOREACH target_table IN ARRAY ARRAY[')
    return (s.slice(i, s.indexOf(']', i)).match(/'([a-z_]+)'/g) || []).sort()
  }
  expect(lista(sql)).toEqual(lista(v96))

  // … och samma medlemsdefinition: båda fallbackar till business_config.user_id
  // och kräver aktiv business_users-rad. Jämför funktionskroppen normaliserat.
  const kropp = (s: string) => {
    const i = s.indexOf('CREATE OR REPLACE FUNCTION public.is_business_member')
    return s.slice(i, s.indexOf('$function$;', i)).replace(/\s+/g, ' ')
  }
  expect(kropp(sql)).toBe(kropp(v96))
})

test('testbädden är märkt för disponibel miljö, inte produktion', () => {
  const sql = read(TESTBED)
  expect(sql).toContain('ALDRIG I PRODUKTION')
  // Seedens företags-id ska skrika test — ingen ska kunna råka tro att de
  // är riktiga bolag.
  expect(sql).toContain('rls_test_biz_a')
  expect(sql).toContain('rls_test_biz_b')
})

test('RLS-provet kräver inte att databaslösenord delas för katalogkontrollerna', () => {
  const spec = read(SPEC)
  expect(spec).toContain("process.env.TENANT_TEST_DATABASE_URL?.trim() || null")
  expect(spec).toContain("test.skip(!pool, 'TENANT_TEST_DATABASE_URL saknas")
  expect(spec).not.toContain("databaseUrl: required('TENANT_TEST_DATABASE_URL')")
})
