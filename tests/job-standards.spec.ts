import { test, expect } from '@playwright/test'
import { standardDatabase } from './helpers/job-standard-db'
import { ensureOnboardingJobTypes } from '../lib/job-types'
import { JOB_TYPES_BY_TRADE } from '../lib/job-type-catalog'
import { writeJobStandard, validateStandardRows } from '../lib/quotes/job-standard-server'
import { hydrateStandardProducts } from '../lib/quotes/hydrate-standard-products'
import { loadQuoteSetup } from '../lib/quotes/job-type-setup-server'
import { loadJobTypeStart } from '../lib/quotes/job-type-start'
import { resolveTemplateItemPrices } from '../lib/quotes/resolve-template-item-prices'
import { buildJobTypeQuotePreview } from '../lib/quotes/job-type-preview'

// One PostgreSQL instance, reset data between tests; no production access.
test.describe.configure({ mode: 'serial' })
let f: Awaited<ReturnType<typeof standardDatabase>>
test.beforeAll(async () => { f = await standardDatabase() })
test.afterAll(async () => { await f?.close() })
test.beforeEach(async () => {
  f.fail(''); f.calls.length = 0
  await f.pg.exec('TRUNCATE quote_templates, product_components, products, job_types CASCADE;')
})
async function setup() {
  await ensureOnboardingJobTypes(f.db, 'a', ['Installera laddbox'])
  await ensureOnboardingJobTypes(f.db, 'b', ['Annat jobb'])
  await f.pg.exec(`INSERT INTO products(id,business_id,name,unit,sales_price,rot_eligible,default_labor_share) VALUES
    ('p','a','Arbete och material','st',1000,true,0.4), ('foreign','b','Främmande','st',999,false,NULL), ('missing','a','Ej prissatt','tim',0,false,NULL);`)
  return writeJobStandard(f.db, 'a', { operation: 'create', jobTypeSlug: 'installera_laddbox' })
}
const append = (t: any, rows = [{ productId: 'p', quantity: 2 }]) => writeJobStandard(f.db, 'a', {
  operation: 'append', jobTypeSlug: 'installera_laddbox', templateId: t.id, updatedAt: t.updatedAt, rows,
})

test('alla branscher har konkreta startval; egna och gamla namn bevaras utan dubbletter', async () => {
  for (const names of Object.values(JOB_TYPES_BY_TRADE)) expect(names.length).toBeGreaterThanOrEqual(10)
  const names = ['Installation', 'Installera laddbox', 'Specialjobb hos kund']
  expect(await ensureOnboardingJobTypes(f.db, 'a', names)).toEqual(['installation', 'installera_laddbox', 'specialjobb_hos_kund'])
  await Promise.all([ensureOnboardingJobTypes(f.db, 'a', names), ensureOnboardingJobTypes(f.db, 'a', names)])
  const result = await f.pg.query('SELECT name FROM job_types ORDER BY name')
  expect(result.rows).toHaveLength(3)
  expect(result.rows.map((r: any) => r.name)).toContain('Installation')
})

test('arkiverade jobb återaktiveras aldrig och slugkrockar skrivs inte över', async () => {
  await ensureOnboardingJobTypes(f.db, 'a', ['Måleri'])
  await expect(ensureOnboardingJobTypes(f.db, 'a', ['Maleri'])).rejects.toThrow('befintliga jobbtypen')
  await f.pg.exec('UPDATE job_types SET is_active = false')
  await expect(ensureOnboardingJobTypes(f.db, 'a', ['Måleri'])).rejects.toThrow('arkiverad')
})

test('dubbel skapa ger en standard; två redigeringar med samma version kan inte båda lyckas', async () => {
  await ensureOnboardingJobTypes(f.db, 'a', ['Installera laddbox'])
  const [a,b] = await Promise.all([writeJobStandard(f.db, 'a', { operation: 'create', jobTypeSlug: 'installera_laddbox' }), writeJobStandard(f.db, 'a', { operation: 'create', jobTypeSlug: 'installera_laddbox' })])
  expect(a.id).toBe(b.id)
  await f.pg.exec(`INSERT INTO products(id,business_id,name,unit,sales_price) VALUES ('p','a','Arbete','tim',950)`)
  const originalNow = Date.now
  Date.now = () => new Date(a.updatedAt!).getTime()
  let results: PromiseSettledResult<unknown>[]
  try { results = await Promise.allSettled([append(a), append(b)]) }
  finally { Date.now = originalNow }
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect((await f.pg.query('SELECT * FROM quote_templates')).rows).toHaveLength(1)
})

test('hela kedjan: val → standardrader → aktuell artikel → offertstart och reservationsreferens', async () => {
  let t = await setup()
  t = await append(t)
  await f.pg.exec(`INSERT INTO product_components(product_id,business_id,component_type,description,quantity_per_unit,unit,unit_cost) VALUES
    ('p','a','arbete','Montering',2,'tim',300), ('p','a','material','Material',1,'st',400);`)
  const before = (await f.pg.query<any>('SELECT * FROM quote_templates')).rows
  const hydrated = await hydrateStandardProducts(f.db, 'a', before)
  const setupData = await loadQuoteSetup(f.db, 'a')
  const fetcher = async (url: any) => new Response(JSON.stringify(String(url).includes('quote-setup') ? setupData : { templates: hydrated }))
  const start = await loadJobTypeStart({ jobTypeSlug: 'installera_laddbox', templateId: t.id }, undefined, fetcher as typeof fetch)
  const items = resolveTemplateItemPrices(start.template.default_items, start.products, null)
  expect(items[0]).toMatchObject({ linked_product_id: 'p', unit_price: 1000, quantity: 2, total: 2000, labor_amount: 1200, material_amount: 800, estimated_hours: 4, is_rot_eligible: true })
  const frozen = JSON.stringify(items)
  await f.pg.exec("UPDATE products SET sales_price = 1500, name = 'Nytt artikelnamn' WHERE id = 'p'")
  const next = await hydrateStandardProducts(f.db, 'a', before)
  expect(next[0].default_items[0].unit_price).toBe(1500)
  expect(next[0].default_items[0].description).toBe('Arbete och material')
  expect(JSON.stringify(items)).toBe(frozen)
  expect((await f.pg.query('SELECT default_items FROM quote_templates')).rows[0]).toEqual({ default_items: before[0].default_items })
  expect(buildJobTypeQuotePreview(setupData.templates[0], setupData.products, []).rows[0].unitPrice).toBe(1000)
})

test('mängd och borttagning bevarar rubriker, villkor och andra rader', async () => {
  let t = await setup(); t = await append(t)
  await f.pg.query('UPDATE quote_templates SET not_included = $1, default_items = $2 WHERE id = $3', ['Befintligt villkor', JSON.stringify([{ item_type:'heading', description:'Rubrik' }, { item_type:'item', description:'Fritext', quantity:1, unit:'st', unit_price:99, group_name:'Grupp' }, { item_type:'item', quantity:2, unit:'st', linked_product_id:'p' }]), t.id])
  t = await writeJobStandard(f.db, 'a', { operation:'quantity', jobTypeSlug:t.jobTypeSlug, templateId:t.id, updatedAt:t.updatedAt, itemIndex:2, quantity:3 })
  const row: any = (await f.pg.query('SELECT * FROM quote_templates')).rows[0]
  expect(row.default_items[0].item_type).toBe('heading'); expect(row.default_items[1].group_name).toBe('Grupp'); expect(row.not_included).toBe('Befintligt villkor')
  expect(t.items[1].quantity).toBe(3)
  t = await writeJobStandard(f.db, 'a', { operation:'remove', jobTypeSlug:t.jobTypeSlug, templateId:t.id, updatedAt:t.updatedAt, itemIndex:2 })
  expect(t.items).toHaveLength(1)
})

test('vald offertåteranvändning ersätter rader men aldrig offert eller mallvillkor', async () => {
  let t = await setup(); t = await append(t)
  t = await writeJobStandard(f.db, 'a', { operation:'replace', jobTypeSlug:t.jobTypeSlug, templateId:t.id, updatedAt:t.updatedAt, rows:[{productId:'missing',quantity:4}] })
  expect(t.items).toMatchObject([{ linkedProductId:'missing', quantity:4 }])
  const data = await loadQuoteSetup(f.db, 'a')
  expect(buildJobTypeQuotePreview(t, data.products, []).rows[0].status).toBe('price_missing')
  expect(f.calls.filter(c => c.action !== 'read').every(c => ['job_types','quote_templates'].includes(c.table))).toBe(true)
})

for (const rows of [[{productId:'foreign',quantity:1}], [{productId:'p',quantity:-1}], [{productId:'p',quantity:Infinity}], [{productId:'p',quantity:1,unit_price:10}]]) {
  test(`ogiltig/främmande artikel stoppas: ${JSON.stringify(rows)}`, async () => {
    const t = await setup()
    await expect(append(t, rows as any)).rejects.toMatchObject({status:400})
    expect((await loadQuoteSetup(f.db, 'a')).templates[0].items).toHaveLength(0)
  })
}
test('läsfel är inte tomma listor; även legacy-konton får skapa fler än fem mallar', async () => {
  const t = await setup()
  f.fail('products'); await expect(append(t)).rejects.toMatchObject({status:503}); f.fail('')
  for (let i=0;i<5;i++) await f.pg.query('INSERT INTO quote_templates(id,business_id,name) VALUES($1,$2,$3)', ['t'+i,'a','Egen '+i])
  await ensureOnboardingJobTypes(f.db,'a',['Nytt jobb'])
  const extra = await writeJobStandard(f.db,'a',{operation:'create',jobTypeSlug:'nytt_jobb'},'starter')
  expect(extra.jobTypeSlug).toBe('nytt_jobb')
  expect((await f.pg.query('SELECT id FROM quote_templates')).rows).toHaveLength(7)
})

test('främmande jobbtyp och mall kan inte ändras via manipulerade id:n', async () => {
  const own = await setup()
  const foreign = await writeJobStandard(f.db, 'b', {operation:'create',jobTypeSlug:'annat_jobb'})
  await expect(writeJobStandard(f.db,'a',{operation:'append',jobTypeSlug:'annat_jobb',templateId:foreign.id,updatedAt:foreign.updatedAt,rows:[{productId:'p',quantity:1}]})).rejects.toMatchObject({status:404})
  await expect(writeJobStandard(f.db,'a',{operation:'append',jobTypeSlug:'installera_laddbox',templateId:foreign.id,updatedAt:foreign.updatedAt,rows:[{productId:'p',quantity:1}]})).rejects.toMatchObject({status:404})
  expect((await loadQuoteSetup(f.db,'a')).templates.find(t=>t.id===own.id)?.items).toHaveLength(0)
})
