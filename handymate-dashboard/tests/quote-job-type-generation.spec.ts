import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildQuoteGenerationContext } from '../lib/quotes/quote-generation-context'
import { buildJobTypePrompt } from '../lib/quotes/job-type-generation'
import { applyGeneratedPriceTruth } from '../lib/quotes/generated-price-truth'
import { generatedQuoteToQuoteItems } from '../lib/quotes/generated-to-quote-items'
import { suggestSnapshotForItems } from '../lib/reservations/suggest-for-items'
import { buildPriceContext, type GeneratedQuoteItem } from '../lib/ai-quote-generator'
import fs from 'fs'
import path from 'path'
import { buildQuotePayload, type BuildQuotePayloadInput } from '../app/dashboard/quotes/_shared/buildQuotePayload'

// Exekverar verkliga service-funktioner mot ett in-memory frågefacit.
// INGA nätanrop/AI-anrop/skrivningar. Ersätter inte skarp RLS-verifiering.
function fixture(extra: Record<string, any[]> = {}, fail?: string) {
  const baseProducts = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, business_id: 'A',
    name: `Artikel ${String(i).padStart(3, '0')}`, unit: 'st', sales_price: 10, category: 'material', is_active: true }))
  const tables: Record<string, any[]> = {
    job_types: [{ id: 'ja', business_id: 'A', slug: 'service', name: 'Servicebesök', is_active: true }],
    quote_templates: [{ id: 'ta', business_id: 'A', name: 'Service', category: 'El', job_type_slug: 'service',
      default_items: [{ item_type: 'item', description: 'Servicearbete', linked_product_id: 'p-special', unit: 'tim', quantity: 999, unit_price: 650 }] }],
    products: [...baseProducts, { id: 'p-special', business_id: 'A', name: 'Servicearbete', unit: 'tim', sales_price: 950, category: 'arbete', is_active: true }],
    customer: [], price_lists_v2: [], price_list_items_v2: [], ...extra,
  }
  const calls: { table: string; columns: string; filters: [string, unknown][] }[] = []
  const db = { from(table: string) {
    let columns = '*', limit = Infinity, single = false
    const filters: [string, unknown][] = [], ins: [string, unknown[]][] = []
    const orders: string[] = []
    const q: any = {
      select(s: string) { columns = s; return q }, eq(k: string, v: unknown) { filters.push([k, v]); return q },
      in(k: string, v: unknown[]) { ins.push([k, v]); return q }, limit(n: number) { limit = n; return q },
      order(k: string) { orders.push(k); return q }, maybeSingle() { single = true; return q },
      then(resolve: any, reject: any) { return execute().then(resolve, reject) },
    }
    async function execute() {
      calls.push({ table, columns, filters: [...filters] })
      if (fail === table) return { data: null, error: { code: 'XX001', message: 'DB failure' } }
      if (fail === 'migration' && (columns.includes('job_type_slug') || filters.some(([k]) => k === 'job_type_slug'))) {
        return { data: null, error: { code: '42703', message: 'column quote_templates.job_type_slug does not exist' } }
      }
      let rows = (tables[table] || []).filter(r => filters.every(([k, v]) => k.includes('.') || r[k] === v) && ins.every(([k, v]) => v.includes(r[k])))
      for (const k of [...orders].reverse()) rows = [...rows].sort((a, b) => String(a[k] ?? '').localeCompare(String(b[k] ?? '')))
      rows = rows.slice(0, limit)
      if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'More than one row' } }
      return { data: single ? rows[0] ?? null : rows, error: null }
    }
    return q
  } }
  return { db: db as unknown as SupabaseClient, tables, calls }
}

test('jobbtyp väljer endast kopplad mall och hämtar artikeln utanför topp 100', async () => {
  const f = fixture()
  const c = await buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })
  expect(c.jobTypeContext.status).toBe('selected')
  expect(c.jobTypeContext.templateId).toBe('ta')
  expect(c.priceList[0]).toMatchObject({ id: 'p-special', unit_price: 950 })
  expect(c.priceList.length).toBeLessThanOrEqual(100)
  const prompt = buildJobTypePrompt(c.jobTypeContext, c.priceList)
  expect(prompt).toContain('Servicearbete')
  expect(prompt).toContain('[P1]')
  expect(prompt).not.toMatch(/650|999/)
  expect(prompt).toContain('Mängder')
  expect(buildPriceContext(c.priceList, 700)).toContain('[P1] Servicearbete: 950 kr/tim')
  expect(f.calls.every(c => c.filters.some(([k, v]) => k === 'business_id' && v === 'A'))).toBe(true)
})

test('annan tenants mall och artikel kan aldrig bli underlag', async () => {
  const f = fixture()
  f.tables.quote_templates.push({ ...f.tables.quote_templates[0], id: 'tb', business_id: 'B' })
  f.tables.products.find(p => p.id === 'p-special').business_id = 'B'
  await expect(buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service', templateId: 'tb' })).rejects.toThrow()
  const c = await buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })
  expect(c.priceList.some(p => p.id === 'p-special')).toBe(false)
  expect(c.jobTypeContext.rows[0].linkedProductId).toBeNull()
})

test('flera mallar kräver ett uttryckligt val — inget alfabetiskt eller LLM-val', async () => {
  const f = fixture()
  f.tables.quote_templates.push({ ...f.tables.quote_templates[0], id: 'ta2', name: 'Service större' })
  await expect(buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })).rejects.toThrow('Flera offertmallar')
  const c = await buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service', templateId: 'ta2' })
  expect(c.jobTypeContext.templateId).toBe('ta2')
})

test('fel jobbtyp på explicit mall och arkiverad jobbtyp godtas inte som valt underlag', async () => {
  const f = fixture()
  f.tables.quote_templates[0].job_type_slug = 'badrum'
  await expect(buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service', templateId: 'ta' })).rejects.toThrow()
  f.tables.job_types[0].is_active = false
  const c = await buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })
  expect(c.jobTypeContext.status).toBe('unconfigured')
  expect(c.templates).toEqual([])
})

test('ingen jobbtyp är en giltig generell start, inte en gissad jobbtyp', async () => {
  const c = await buildQuoteGenerationContext(fixture().db, 'A')
  expect(c.jobTypeContext.status).toBe('not_requested')
  expect(c.jobTypeContext.templateId).toBeNull()
})

test('bara bevisad okörd migration degraderar; vanliga DB-fel stoppar generering', async () => {
  const c = await buildQuoteGenerationContext(fixture({}, 'migration').db, 'A', null, { jobType: 'service' })
  expect(c.jobTypeContext.status).toBe('unavailable')
  expect(c.templates).toEqual([])
  for (const fail of ['job_types', 'quote_templates', 'products']) {
    await expect(buildQuoteGenerationContext(fixture({}, fail).db, 'A', null, { jobType: 'service' })).rejects.toThrow()
  }
})

test('kundprisfel är inte tillstånd att tyst använda generellt pris', async () => {
  await expect(buildQuoteGenerationContext(fixture({}, 'customer').db, 'A', 'ca')).rejects.toThrow()
  await expect(buildQuoteGenerationContext(fixture().db, 'A', 'foreign')).rejects.toThrow()
})

test('kundprislista behåller företräde och använder samma tenantbundna klient', async () => {
  const f = fixture({ customer: [{ customer_id: 'ca', business_id: 'A', price_list_id: 'listA' }],
    price_lists_v2: [{ id: 'listA', business_id: 'A', name: 'Kundavtal', hourly_rate_normal: 875,
      items: [] }], price_list_items_v2: [{ id: 'ci1', business_id: 'A', price_list_id: 'listA', name: 'Servicearbete', unit: 'tim', price: 900 },
        { id: 'ci2', business_id: 'B', price_list_id: 'listA', name: 'Servicearbete', unit: 'tim', price: 1 }] })
  const c = await buildQuoteGenerationContext(f.db, 'A', 'ca', { jobType: 'service' })
  expect(c.customerPriceList?.name).toBe('Kundavtal')
  expect(c.customerPriceList?.items).toHaveLength(1)
  expect(c.customerPriceList?.items?.[0].price).toBe(900)
  expect(f.calls.filter(c => c.table !== 'products').every(c => c.filters.some(([k, v]) => k === 'business_id' && v === 'A'))).toBe(true)
})

test('fel vid läsning av kundavtalets rader stoppar; dubbla default-listor väljs aldrig godtyckligt', async () => {
  const customer = [{ customer_id: 'ca', business_id: 'A', price_list_id: 'la' }]
  const list = [{ id: 'la', business_id: 'A', name: 'Avtal', hourly_rate_normal: 900 }]
  await expect(buildQuoteGenerationContext(fixture({ customer, price_lists_v2: list }, 'price_list_items_v2').db, 'A', 'ca')).rejects.toThrow()
  const duplicate = fixture({ customer: [{ ...customer[0], price_list_id: null }],
    price_lists_v2: [{ ...list[0], is_default: true }, { ...list[0], id: 'lb', is_default: true }] })
  await expect(buildQuoteGenerationContext(duplicate.db, 'A', 'ca')).rejects.toThrow()
})

const row = (patch: Partial<GeneratedQuoteItem> = {}): GeneratedQuoteItem => ({ id: 'r', description: 'Servicearbete',
  quantity: 4, unit: 'tim', unitPrice: 123456, type: 'labor', confidence: 85, ...patch })
const prices = [{ id: 'p-special', name: 'Servicearbete', unit: 'tim', unit_price: 950, category: 'arbete' }]

test('serverpriset vinner över modell, mall och generellt timpris; indata muteras inte', () => {
  const original = row()
  const [r] = applyGeneratedPriceTruth([original], [{ productRef: 'P1' }], prices, 700)
  expect(r).toMatchObject({ unitPrice: 950, linkedProductId: 'p-special', fromPriceList: true })
  expect(original.unitPrice).toBe(123456)
})

test('exakt kundartikel vinner; annars kundens timpris före bankens arbetspris', () => {
  const customer = { name: 'Avtal', hourly_rate_normal: 875, items: [{ name: 'Servicearbete', unit: 'tim', price: 900 }] }
  expect(applyGeneratedPriceTruth([row()], [{ productRef: 'P1' }], prices, 700, customer)[0].unitPrice).toBe(900)
  expect(applyGeneratedPriceTruth([row()], [{ productRef: 'P1' }], prices, 700, { ...customer, items: [] })[0].unitPrice).toBe(875)
})

test('kundens OB/jourpris ersätts inte tyst av normalpris; oklart rate-val saknar pris', () => {
  const customer = { name: 'Jouravtal', hourly_rate_normal: 800, hourly_rate_emergency: 1500 }
  expect(applyGeneratedPriceTruth([row()], [{ productRef: 'P1', customerRateRef: 'emergency' }], prices, 700, customer)[0].unitPrice).toBe(1500)
  for (const customerRateRef of [undefined, 'bogus', 'ob1']) {
    expect(applyGeneratedPriceTruth([row()], [{ productRef: 'P1', customerRateRef }], prices, 700, customer)[0].unitPrice).toBe(0)
  }
})

for (const bad of [0, null, -1, Infinity, NaN]) test(`osatt bankpris ${bad} uppfinns aldrig via generellt timpris`, () => {
  const [r] = applyGeneratedPriceTruth([row()], [{ productRef: 'P1' }], [{ ...prices[0], unit_price: bad as number }], 700)
  expect(r.unitPrice).toBe(0)
  expect(r.note).toContain('PRIS SAKNAS')
})

test('enhetsfel och ogiltigt explicit handtag ger ingen felaktig artikel/reservation', () => {
  for (const [r, ref] of [[row({ unit: 'st' }), 'P1'], [row(), 'P99']] as const) {
    const [result] = applyGeneratedPriceTruth([r], [{ productRef: ref }], prices, 700)
    expect(result.unitPrice).toBe(0)
    expect(result.linkedProductId).toBeNull()
  }
})

test('kg och ton är aldrig utbytbara pris-enheter', () => {
  const [r] = applyGeneratedPriceTruth([row({ description: 'Grus', type: 'material', unit: 'ton' })], [{ productRef: 'P1' }],
    [{ ...prices[0], name: 'Grus', unit: 'kg' }], 700)
  expect(r.unitPrice).toBe(0)
  expect(r.linkedProductId).toBeNull()
})

test('mängder är förslag, ogiltiga värden får aldrig bli sparbara totalsummor', () => {
  for (const quantity of [NaN, Infinity, -1, '4', null]) {
    expect(() => applyGeneratedPriceTruth([row({ quantity: quantity as number })], [], prices, 700)).toThrow()
  }
  expect(applyGeneratedPriceTruth([row()], [{ productRef: 'P1' }], prices, 700)[0].quantitySource).toBe('proposal')
})

test('AI → produktkoppling → samma sparmappning → befintligt reservationsförslag', () => {
  const [priced] = applyGeneratedPriceTruth([row()], [{ productRef: 'P1' }], prices, 700)
  const items = generatedQuoteToQuoteItems([priced], [], 'none', true)
  const library: any[] = [{ id: 'resA', title: 'Befintlig anläggning', content: 'Dolda fel ingår inte.', is_active: true,
    suggest_enabled: true, sort_order: 0, triggers: [{ trigger_type: 'product', product_id: 'p-special' }] }]
  expect(suggestSnapshotForItems(library, items).map(r => r.reservation_id)).toEqual(['resA'])
  expect(items[0].unit_price).toBe(950)
})

test('förlorad/inaktiv artikel och enhetsbyte syns som saknad koppling, aldrig en ersättningsartikel', async () => {
  for (const patch of [{ is_active: false }, { unit: 'st' }]) {
    const f = fixture()
    Object.assign(f.tables.products.find(p => p.id === 'p-special'), patch)
    const c = await buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })
    expect(c.jobTypeContext.rows[0].linkedProductId).toBeNull()
    const r = applyGeneratedPriceTruth([row()], [], c.priceList, 700, undefined, c.jobTypeContext)[0]
    expect(r.unitPrice).toBe(0)
    expect(r.linkedProductId).toBeNull()
  }
})

test('ägarens explicita artikelkoppling gäller även när mallraden har egen rubrik', async () => {
  const f = fixture()
  f.tables.quote_templates[0].default_items[0].description = 'Årlig genomgång hos kund'
  const c = await buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })
  const r = applyGeneratedPriceTruth([row({ description: 'Årlig genomgång hos kund' })], [{ productRef: 'P1' }], c.priceList, 700, undefined, c.jobTypeContext)[0]
  expect(r).toMatchObject({ unitPrice: 950, linkedProductId: 'p-special' })
})

test('dolda mallrader och deras mängder/belopp lämnas utanför modellunderlaget', async () => {
  const f = fixture()
  f.tables.quote_templates[0].default_items.push({ item_type: 'item', is_hidden: true, description: 'Intern marginal', unit: 'kr', quantity: 1, unit_price: 3456 })
  const c = await buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })
  expect(buildJobTypePrompt(c.jobTypeContext, c.priceList)).not.toMatch(/Intern marginal|3456/)
  expect(c.jobTypeContext.rows).toHaveLength(1)
})

test('för stort mallunderlag klipps aldrig tyst', async () => {
  const f = fixture()
  f.tables.quote_templates[0].default_items = Array.from({ length: 101 }, () => f.tables.quote_templates[0].default_items[0])
  await expect(buildQuoteGenerationContext(f.db, 'A', null, { jobType: 'service' })).rejects.toThrow()
})

test('nullable/falska referenser accepteras aldrig som jobbtyper', async () => {
  for (const jobType of [true, {}, [], 42, 'x'.repeat(101)]) {
    await expect(buildQuoteGenerationContext(fixture().db, 'A', null, { jobType })).rejects.toThrow()
  }
})

test('olika kundpriser för samma artikel behöver granskas i stället för att första raden vinner', () => {
  const customer = { name: 'Avtal', items: [{ name: 'Servicearbete', unit: 'tim', price: 900 }, { name: 'Servicearbete', unit: 'tim', price: 800 }] }
  expect(applyGeneratedPriceTruth([row()], [{ productRef: 'P1' }], prices, 700, customer)[0].unitPrice).toBe(0)
})

test('tvetydig artikel kan inte försvinna in i ett generellt timpris', () => {
  const ambiguous = [...prices, { ...prices[0], id: 'p-other', unit_price: 1400 }]
  const r = applyGeneratedPriceTruth([row()], [], ambiguous, 700)[0]
  expect(r.unitPrice).toBe(0)
  expect(r.linkedProductId).toBeNull()
})

test('saknat materialpris/hallucinerat pris blir noll, exakta enhetsalias kan fortfarande kopplas', () => {
  const [unknown] = applyGeneratedPriceTruth([row({ description: 'Okänt material', unit: 'st', type: 'material' })], [], prices, 700)
  expect(unknown.unitPrice).toBe(0)
  const [alias] = applyGeneratedPriceTruth([row({ unit: 'timmar' })], [{ productRef: 'P1' }], prices, 700)
  expect(alias.unitPrice).toBe(950)
})

test('delat underlag trådas till generatorn från alla tre ingångar och priser verifieras före totalsumman', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
  for (const file of ['app/api/quotes/ai-generate/route.ts', 'lib/quotes/suggest-quote-draft.ts', 'app/api/agent/trigger/tool-router.ts']) {
    const source = read(file)
    const call = source.slice(source.indexOf('await buildQuoteGenerationContext('))
    expect(call.slice(0, 230)).toContain('jobType:')
    expect(call.slice(0, call.indexOf('generatedQuoteToQuoteItems') === -1 ? undefined : call.indexOf('generatedQuoteToQuoteItems'))).toContain('jobTypeContext,')
  }
  const generator = read('lib/ai-quote-generator.ts')
  expect(generator.indexOf('items = applyGeneratedPriceTruth(')).toBeLessThan(generator.indexOf('const laborCost ='))
  expect(generator).toContain('options = applyGeneratedPriceTruth(')
  const onboarding = read('app/onboarding/components/StepProductRegister.tsx')
  expect(onboarding).toContain('jobbtyp, koppla en offertmall')
  expect(onboarding).toContain('sätt priser på dina artiklar')
  expect(read('components/onboarding/JobTypeQuoteSetup.tsx')).toContain('Artikelkopplade reservationer föreslås')
})

test('riktiga sparmapparen behåller kund, affär, jobbtyp, artikel och accepterad reservation', () => {
  const priced = applyGeneratedPriceTruth([row()], [{ productRef: 'P1' }], prices, 700)
  const input: BuildQuotePayloadInput = {
    mode: 'create', selectedCustomer: 'custA', title: 'Service Andersson', description: 'Fyra timmar',
    items: generatedQuoteToQuoteItems(priced, [], 'none', true), templateId: 'ta', quoteJobType: 'service', dealId: 'dealA', leadId: null,
    vatRate: 25, discountPercent: 0, notIncluded: '', ataTerms: '', paymentTermsText: '', termsText: '',
    reservationsSnapshot: [{ reservation_id: 'ra', title: 'Befintlig anläggning', content: 'Kontroll krävs.' }],
    paymentPlan: [], paymentPlanValid: true, calculatedPaymentPlan: [], referencePerson: '', customerReference: '',
    projectAddress: '', detailLevel: 'detailed', showUnitPrices: true, showQuantities: true, hasRotItems: false, hasRutItems: false,
    personnummer: '', fastighetsbeteckning: '', validDays: 30, templateStyle: 'modern', attachments: [],
  }
  const created = buildQuotePayload(input)
  expect(created).toMatchObject({ customer_id: 'custA', deal_id: 'dealA', job_type: 'service', template_id: 'ta', status: 'draft' })
  expect(created.quote_items[0]).toMatchObject({ linked_product_id: 'p-special', unit_price: 950, total: 3800 })
  expect(created.reservations_snapshot?.[0].reservation_id).toBe('ra')
  // Återöppning/autospar får inte nolla de här relationerna.
  const edited = buildQuotePayload({ ...input, mode: 'edit', quoteId: 'qa' })
  expect(edited).not.toHaveProperty('deal_id')
  expect(edited).not.toHaveProperty('job_type')
  expect(edited).not.toHaveProperty('template_id')
})
