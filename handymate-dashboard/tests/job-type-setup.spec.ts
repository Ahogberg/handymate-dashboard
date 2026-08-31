import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { inspectTemplate, relevantProducts, resolveFirstQuoteSelection, sameUnit, setupSummary, templatesForJobType, toSetupTemplate,
  type SetupTemplate, type SetupProduct, type QuoteSetupData } from '../lib/quotes/job-type-setup'
import { linkTemplateItem, linkTemplateToJobType, loadQuoteSetup } from '../lib/quotes/job-type-setup-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { firstQuoteHref, readFirstQuoteIntent, resolveQuoteStart } from '../lib/onboarding/first-quote-handoff'

const product: SetupProduct = { id: 'p1', name: 'Arbete', unit: 'tim', salesPrice: 950 }
const template: SetupTemplate = { id: 't1', name: 'Service', category: 'Service', jobTypeSlug: 'service', updatedAt: null,
  items: [{ index: 0, description: 'Servicearbete', unit: 'tim', linkedProductId: 'p1' }] }
const data: QuoteSetupData = { linkingAvailable: true, jobTypes: [{ id: 'j1', name: 'Service', slug: 'service' }], templates: [template], products: [product] }

test('bara explicit jobbtypskoppling — liknande kategorier är inga bevis', () => {
  expect(templatesForJobType([{ ...template, jobTypeSlug: null }], 'service')).toEqual([])
  expect(templatesForJobType([template], 'servicebesok')).toEqual([])
  expect(templatesForJobType([template], 'service')).toEqual([template])
})

test('mallens seedbelopp följer aldrig med till uppsättningsvyn', () => {
  const dto = toSetupTemplate({ id: 't', name: 'Mall', default_items: [
    { description: 'Arbete', unit: 'tim', unit_price: 650, total: 6500, quantity: 10 },
    { item_type: 'heading', description: 'Rubrik' },
    null,
    { item_type: 'option', description: 'Tillval', unit: 'st' },
  ] })
  expect(dto.items.map(r => r.index)).toEqual([0, 3])
  expect(JSON.stringify(dto)).not.toMatch(/650|total|quantity|unit_price/)
})

for (const price of [0, null, NaN, Infinity, -1]) {
  test(`osatt eller ogiltigt pris blir inte grönt: ${price}`, () => {
    expect(inspectTemplate(template, [{ ...product, salesPrice: price }])[0].status).toBe('price_missing')
  })
}

test('saknad/inaktiv produkt ersätts inte av en namnlik produkt', () => {
  const row = inspectTemplate(template, [{ ...product, id: 'p2' }])[0]
  expect(row.status).toBe('product_missing')
  expect(row.product).toBeNull()
})

test('enhetsmismatch får aldrig ge pris eller mängdomräkning', () => {
  expect(sameUnit('', '')).toBe(false)
  expect(sameUnit(' TIM ', 'tim')).toBe(true)
  expect(inspectTemplate(template, [{ ...product, unit: 'st' }])[0].status).toBe('unit_mismatch')
  expect(relevantProducts(template, [{ ...product, unit: 'st' }])).toEqual([])
})

test('relevanta artiklar dedupliceras — ingen godtycklig alfabetisk topp tio', () => {
  const doubled = { ...template, items: [...template.items, { ...template.items[0], index: 1 }] }
  expect(relevantProducts(doubled, [product])).toEqual([product])
  expect(setupSummary(inspectTemplate(doubled, [product]))).toBe('2 av 2 rader har ett artikelpris')
})

test('ett pris någon annanstans i banken gör inte jobbet redo', () => {
  expect(setupSummary(inspectTemplate(template, [{ ...product, id: 'irrelevant' }]))).toContain('1 behöver artikelkoppling')
})

test('första offertvalet kontrolleras mot aktuell koppling, inte cachade etiketter', () => {
  const choice = { jobTypeSlug: 'service', templateId: 't1' }
  expect(resolveFirstQuoteSelection(data, choice)).toEqual(choice)
  for (const bad of [null, {}, { ...choice, templateId: 'foreign' }, { ...choice, jobTypeSlug: 'other' }]) {
    expect(resolveFirstQuoteSelection(data, bad)).toBeNull()
  }
  expect(resolveFirstQuoteSelection({ ...data, linkingAvailable: false }, choice)).toBeNull()
  expect(resolveFirstQuoteSelection({ ...data, jobTypes: [] }, choice)).toBeNull()
  expect(resolveFirstQuoteSelection({ ...data, templates: [{ ...template, items: [] }] }, choice)).toBeNull()
})

/** Exekverar tjänstens frågekedjor — bevisar filter/felordning, INTE skarp RLS. */
function fakeDb(overrides: Record<string, any[]> = {}, opts: { failTable?: string; missingColumn?: boolean; race?: boolean } = {}) {
  const tables: Record<string, any[]> = {
    job_types: [{ id: 'j1', slug: 'service', name: 'Service', business_id: 'bizA', is_active: true }],
    products: [{ id: 'p1', name: 'Arbete', unit: 'tim', sku: 'A1', sales_price: 950, business_id: 'bizA', is_active: true }],
    quote_templates: [{ id: 't1', name: 'Mall', job_type_slug: null, business_id: 'bizA', updated_at: null,
      default_items: [{ item_type: 'item', description: 'Arbete', unit: 'tim', unit_price: 650, total: 1300, quantity: 2 }] }],
    ...overrides,
  }
  const calls: { table: string; action: string; filters: [string, unknown][] }[] = []
  const db = { from(table: string) {
    let filters: [string, unknown][] = [], update: any = null, columns = '*', limit: number | null = null, start = 0, end = Infinity
    const q: any = {
      select(s: string) { columns = s; return q },
      eq(k: string, v: unknown) { filters.push([k, v]); return q },
      is(k: string, v: unknown) { filters.push([k, v]); return q },
      order() { return q }, range(a: number, b: number) { start = a; end = b; return q },
      limit(n: number) { limit = n; return q },
      update(value: any) { update = value; return q },
      maybeSingle() { return execute(true) },
      then(resolve: any, reject: any) { return execute(false).then(resolve, reject) },
    }
    async function execute(single: boolean) {
      calls.push({ table, action: update ? 'update' : 'read', filters: [...filters] })
      if (opts.failTable === table) return { data: null, error: { code: 'XX', message: 'database unavailable' } }
      if (opts.missingColumn && columns === 'job_type_slug') return { data: null, error: { code: '42703', message: 'column job_type_slug does not exist' } }
      const rows = (tables[table] || []).filter(r => filters.every(([k, v]) => (r[k] ?? null) === v))
      if (update && opts.race) return { data: null, error: null }
      if (update) rows.forEach(r => Object.assign(r, update))
      const sliced = rows.slice(start, Math.min(end + 1, limit === null ? Infinity : start + limit))
      return { data: single ? sliced[0] ?? null : sliced, error: null }
    }
    return q
  } }
  return { db: db as unknown as SupabaseClient, tables, calls }
}

test('ny läsväg filtrerar samtliga tabeller på företag och gör inga skrivningar', async () => {
  const f = fakeDb()
  const result = await loadQuoteSetup(f.db, 'bizA')
  expect(result.products[0].salesPrice).toBe(950)
  expect(f.calls.every(c => c.action === 'read' && c.filters.some(([k, v]) => k === 'business_id' && v === 'bizA'))).toBe(true)
})

test('okörd migration känns igen — andra databasfel är inte tomt underlag', async () => {
  expect((await loadQuoteSetup(fakeDb({}, { missingColumn: true }).db, 'bizA')).linkingAvailable).toBe(false)
  for (const table of ['products', 'job_types', 'quote_templates']) {
    await expect(loadQuoteSetup(fakeDb({}, { failTable: table }).db, 'bizA')).rejects.toMatchObject({ status: 503 })
  }
})

test('läser förbi PostgREST:s sidgräns', async () => {
  const products = Array.from({ length: 1001 }, (_, i) => ({ id: `p${i}`, business_id: 'bizA', is_active: true, name: 'Artikel', unit: 'st', sales_price: 1 }))
  const f = fakeDb({ products })
  expect((await loadQuoteSetup(f.db, 'bizA')).products).toHaveLength(1001)
  expect(f.calls.filter(c => c.table === 'products')).toHaveLength(3)
})

test('kopplar rätt mall; ändrar inga rader, belopp eller tidigare offerter', async () => {
  const f = fakeDb()
  const before = JSON.stringify(f.tables.quote_templates[0].default_items)
  await linkTemplateToJobType(f.db, 'bizA', { templateId: 't1', jobTypeSlug: 'service', updatedAt: null })
  expect(f.tables.quote_templates[0].job_type_slug).toBe('service')
  expect(JSON.stringify(f.tables.quote_templates[0].default_items)).toBe(before)
  expect(f.calls.filter(c => c.action === 'update').every(c => c.table === 'quote_templates')).toBe(true)
})

for (const input of [
  { templateId: 'foreign', jobTypeSlug: 'service', updatedAt: null },
  { templateId: 't1', jobTypeSlug: 'foreign', updatedAt: null },
]) test(`främmande mall/jobbtyp nekas före skrivning ${JSON.stringify(input)}`, async () => {
  const f = fakeDb()
  await expect(linkTemplateToJobType(f.db, 'bizA', input)).rejects.toMatchObject({ status: 404 })
  expect(f.calls.some(c => c.action === 'update')).toBe(false)
})

test('manipulerad business_id och saknad version nekas', async () => {
  const f = fakeDb()
  await expect(linkTemplateToJobType(f.db, 'bizA', { templateId: 't1', jobTypeSlug: 'service', updatedAt: null, business_id: 'bizB' })).rejects.toMatchObject({ status: 400 })
  await expect(linkTemplateToJobType(f.db, 'bizA', { templateId: 't1', jobTypeSlug: 'service' })).rejects.toMatchObject({ status: 400 })
  expect(f.calls).toEqual([])
})

test('samtidig ändring ger konflikt, inte falskt sparad', async () => {
  const f = fakeDb({}, { race: true })
  await expect(linkTemplateToJobType(f.db, 'bizA', { templateId: 't1', jobTypeSlug: 'service', updatedAt: null })).rejects.toMatchObject({ status: 409 })
})

test('existerande annan tenants poster är osynliga och kan inte länkas', async () => {
  const f = fakeDb()
  f.tables.quote_templates.push({ ...f.tables.quote_templates[0], id: 't-b', business_id: 'bizB' })
  f.tables.products.push({ ...f.tables.products[0], id: 'p-b', business_id: 'bizB' })
  f.tables.job_types.push({ ...f.tables.job_types[0], id: 'j-b', slug: 'other-business', business_id: 'bizB' })
  const own = await loadQuoteSetup(f.db, 'bizA')
  expect(own.templates.map(t => t.id)).toEqual(['t1'])
  expect(own.products.map(p => p.id)).toEqual(['p1'])
  expect(own.jobTypes.map(j => j.id)).toEqual(['j1'])
  await expect(linkTemplateToJobType(f.db, 'bizA', { templateId: 't-b', jobTypeSlug: 'service', updatedAt: null })).rejects.toMatchObject({ status: 404 })
  await expect(linkTemplateToJobType(f.db, 'bizA', { templateId: 't1', jobTypeSlug: 'other-business', updatedAt: null })).rejects.toMatchObject({ status: 404 })
  await expect(linkTemplateItem(f.db, 'bizA', { templateId: 't1', itemIndex: 0, productId: 'p-b', updatedAt: null })).rejects.toMatchObject({ status: 404 })
  expect(f.calls.some(c => c.action === 'update')).toBe(false)
})

test('inaktiv jobbtyp och artikel kan inte bli nytt underlag', async () => {
  const f = fakeDb()
  f.tables.products[0].is_active = false
  f.tables.job_types[0].is_active = false
  const own = await loadQuoteSetup(f.db, 'bizA')
  expect(own.products).toEqual([])
  expect(own.jobTypes).toEqual([])
  await expect(linkTemplateToJobType(f.db, 'bizA', { templateId: 't1', jobTypeSlug: 'service', updatedAt: null })).rejects.toMatchObject({ status: 404 })
  await expect(linkTemplateItem(f.db, 'bizA', { templateId: 't1', itemIndex: 0, productId: 'p1', updatedAt: null })).rejects.toMatchObject({ status: 404 })
})

test('legacyartikel utan enhet visas som okänd, inte krasch eller prissatt rad', async () => {
  const f = fakeDb()
  f.tables.products[0].unit = null
  const own = await loadQuoteSetup(f.db, 'bizA')
  expect(inspectTemplate(template, own.products)[0].status).toBe('unit_mismatch')
  await expect(linkTemplateItem(f.db, 'bizA', { templateId: 't1', itemIndex: 0, productId: 'p1', updatedAt: null })).rejects.toMatchObject({ status: 400 })
})

test('gammalt radval och misslyckad läsning får aldrig skriva', async () => {
  const f = fakeDb()
  f.tables.quote_templates[0].updated_at = '2026-08-31T12:00:00Z'
  await expect(linkTemplateItem(f.db, 'bizA', { templateId: 't1', itemIndex: 0, productId: 'p1', updatedAt: null })).rejects.toMatchObject({ status: 409 })
  expect(f.calls.some(c => c.action === 'update')).toBe(false)
  const failed = fakeDb({}, { failTable: 'products' })
  await expect(linkTemplateItem(failed.db, 'bizA', { templateId: 't1', itemIndex: 0, productId: 'p1', updatedAt: null })).rejects.toMatchObject({ status: 503 })
  expect(failed.calls.some(c => c.action === 'update')).toBe(false)
})

test('artikelkoppling verifierar produktens tenant och enhet före skrivning', async () => {
  for (const productId of ['foreign', 'p1']) {
    const f = fakeDb({ products: [{ id: 'p1', business_id: 'bizA', is_active: true, unit: 'st' }] })
    await expect(linkTemplateItem(f.db, 'bizA', { templateId: 't1', itemIndex: 0, productId, updatedAt: null })).rejects.toMatchObject({ status: productId === 'foreign' ? 404 : 400 })
    expect(f.calls.some(c => c.action === 'update')).toBe(false)
  }
})

test('artikelkoppling bevarar mängd och mallpris — den gemensamma prisresolvern äger nya offerter', async () => {
  const f = fakeDb()
  await linkTemplateItem(f.db, 'bizA', { templateId: 't1', itemIndex: 0, productId: 'p1', updatedAt: null })
  expect(f.tables.quote_templates[0].default_items[0]).toMatchObject({ linked_product_id: 'p1', article_number: 'A1', quantity: 2, unit_price: 650, total: 1300 })
})

test('första offertens URL bär bara validerade referenser, inga belopp eller redirect', () => {
  const selection = { jobTypeSlug: 'service', templateId: 't1' }
  const href = firstQuoteHref(data, selection)!
  expect(href).toBe('/dashboard/quotes/new?first_quote=1&job_type=service&template_id=t1')
  expect(readFirstQuoteIntent(new URL(href, 'http://local').searchParams)).toEqual(selection)
  expect(firstQuoteHref(data, { ...selection, templateId: 'foreign' })).toBeNull()
  expect(readFirstQuoteIntent(new URLSearchParams('job_type=service&template_id=t1'))).toBeNull()
  expect(readFirstQuoteIntent(new URLSearchParams({ first_quote: '1', job_type: 'x'.repeat(101), template_id: 't1' }))).toBeNull()
})

test('redigering, egna rader och affärens jobbtyp går före onboardingvalet', () => {
  const selection = { jobTypeSlug: 'service', templateId: 't1' }
  expect(resolveQuoteStart(data, selection, { mode: 'edit', hasItems: false })).toEqual({ kind: 'preserve', reason: 'editing' })
  expect(resolveQuoteStart(data, selection, { mode: 'create', hasItems: true })).toEqual({ kind: 'preserve', reason: 'existing_content' })
  expect(resolveQuoteStart(data, selection, { mode: 'create', hasItems: false, inheritedJobType: 'badrum' })).toEqual({ kind: 'preserve', reason: 'context_conflict' })
  expect(resolveQuoteStart(data, selection, { mode: 'create', hasItems: false, inheritedJobType: 'service' })).toEqual({ kind: 'apply', selection })
})

test('arkiverad jobbtyp eller ändrad mall gör en gammal startreferens oanvändbar', () => {
  const selection = { jobTypeSlug: 'service', templateId: 't1' }
  for (const changed of [{ ...data, jobTypes: [] }, { ...data, templates: [{ ...template, jobTypeSlug: null }] }]) {
    expect(resolveQuoteStart(changed, selection, { mode: 'create', hasItems: false })).toEqual({ kind: 'unavailable' })
  }
})

test('övergångskortet saknar egen offertskrivare och artificiell väntan', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/onboarding/FirstQuoteLaunch.tsx'), 'utf8')
  expect(src).not.toMatch(/\b(?:fetch|setTimeout|setInterval)\s*\(/)
  expect(src).toContain('await action()')
  expect(src).toContain('open(onContinue)')
  expect(src).toContain('if (lock.current) return')
  expect(src).toContain('role="alert"')
  const css = fs.readFileSync(path.resolve(__dirname, '../components/onboarding/first-quote-launch.css'), 'utf8')
  expect(css).toContain('prefers-reduced-motion: reduce')
})

test('route har auth, behörighet före dataåtkomst, ingen cache eller klientvald tenant', () => {
  const s = fs.readFileSync(path.resolve(__dirname, '../app/api/job-types/quote-setup/route.ts'), 'utf8')
  expect(s).toContain("export const dynamic = 'force-dynamic'")
  for (const name of ['GET', 'PUT', 'PATCH']) {
    const section = s.split(`export async function ${name}`)[1].split('export async function')[0]
    expect(section.indexOf('getAuthenticatedBusiness')).toBeLessThan(section.indexOf('getServerSupabase()'))
    expect(section).toContain('getCurrentUser(request, business.business_id)')
    expect(section).toContain(name === 'GET' ? "hasPermission(user, 'see_financials')" : 'isOwnerOrAdmin(user)')
  }
})

test('migration har tenantbunden FK, ingen backfill, inga pris- eller offertskrivningar', () => {
  const s = fs.readFileSync(path.resolve(__dirname, '../sql/v187_quote_template_job_type.sql'), 'utf8')
  expect(s).toContain('FOREIGN KEY (business_id, job_type_slug)')
  expect(s).toContain('REFERENCES public.job_types (business_id, slug)')
  expect(s).not.toMatch(/\b(?:DELETE FROM|UPDATE public|INSERT INTO|DROP TABLE)\b/i)
})
