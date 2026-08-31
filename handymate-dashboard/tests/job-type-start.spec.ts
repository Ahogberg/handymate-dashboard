import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { toSetupTemplate, type QuoteSetupData } from '../lib/quotes/job-type-setup'
import { loadJobTypeStart, canApplyJobTypeStart, type QuoteStartSnapshot } from '../lib/quotes/job-type-start'
import { completeFirstQuoteOnboarding } from '../lib/onboarding/first-quote-handoff'
import { resolveTemplateItemPrices } from '../lib/quotes/resolve-template-item-prices'
import type { QuoteTemplate } from '../lib/types/quote'

const selection = { jobTypeSlug: 'service', templateId: 'qtpl_service' }
const template = { id: selection.templateId, business_id: 'own', job_type_slug: 'service', name: 'Service', updated_at: '2026-08-31',
  default_items: [{ id: 'qi1', item_type: 'item', description: 'Service hos Andersson', unit: 'tim', quantity: 4, unit_price: 650,
    total: 2600, linked_product_id: 'p1', is_rot_eligible: true, is_rut_eligible: false, sort_order: 0 }],
} as QuoteTemplate & { job_type_slug: string }
const setup: QuoteSetupData = { linkingAvailable: true, jobTypes: [{ id: 'j1', slug: 'service', name: 'Service' }],
  templates: [toSetupTemplate({ ...template })], products: [{ id: 'p1', name: 'Servicearbete', unit: 'tim', salesPrice: 950 }] }

function transport(overrides: { setup?: QuoteSetupData; template?: unknown; fail?: string } = {}) {
  const calls: { url: string; method: string; body: unknown }[] = []
  const fetcher = (async (url: string, options?: RequestInit) => {
    const method = options?.method || 'GET'
    calls.push({ url, method, body: options?.body ? JSON.parse(String(options.body)) : null })
    if (overrides.fail === `${method} ${url}`) return new Response('{}', { status: 503 })
    if (url === '/api/job-types/quote-setup') return Response.json(overrides.setup || setup)
    if (url === '/api/quote-templates') return Response.json({ templates: [overrides.template || template] })
    if (url === '/api/onboarding') return Response.json({ ok: true })
    throw new Error(`Oväntat anrop: ${url}`)
  }) as typeof fetch
  return { calls, fetcher }
}

test('riktig mall → delad resolver: vald artikel 950, inte mallens 650 eller generellt timpris 700', async () => {
  const network = transport()
  const start = await loadJobTypeStart(selection, undefined, network.fetcher)
  const [row] = resolveTemplateItemPrices(start.template.default_items, start.products, 700)
  expect(row.unit_price).toBe(950)
  expect(row.total).toBe(3800)
  expect(row.description).toBe('Service hos Andersson')
  expect(row.linked_product_id).toBe('p1')
  expect(network.calls.every(c => c.method === 'GET')).toBe(true)
})

for (const [label, altered] of Object.entries({
  'annan tenant/mall': { ...template, id: 'foreign' },
  'ny version': { ...template, updated_at: '2026-09-01' },
  'annan jobbtyp': { ...template, job_type_slug: 'badrum' },
  'ändrad artikel': { ...template, default_items: [{ ...template.default_items[0], linked_product_id: 'p2' }] },
})) test(`${label} kan inte läsas som ett giltigt startunderlag`, async () => {
  await expect(loadJobTypeStart(selection, undefined, transport({ template: altered }).fetcher)).rejects.toThrow()
})

for (const fail of ['GET /api/job-types/quote-setup', 'GET /api/quote-templates']) test(`${fail}: läsfel är inte en tom lyckad offert`, async () => {
  await expect(loadJobTypeStart(selection, undefined, transport({ fail }).fetcher)).rejects.toThrow()
})

test('arkiverad jobbtyp och okörd migration förhindrar förifyllnad, utan offertskrivning', async () => {
  for (const changed of [{ ...setup, jobTypes: [] }, { ...setup, linkingAvailable: false }]) {
    const network = transport({ setup: changed })
    await expect(loadJobTypeStart(selection, undefined, network.fetcher)).rejects.toThrow()
    expect(network.calls.every(c => c.method === 'GET')).toBe(true)
  }
})

test('samtidiga ändringar, startlägesbyte och AI-bygge kan aldrig skrivas över', () => {
  const before: QuoteStartSnapshot = { items: [], jobType: null, input: '', mode: 'intake', busy: false }
  expect(canApplyJobTypeStart(before, { ...before })).toBe(true)
  for (const patch of [{ items: [{}] }, { items: [] }, { input: 'Fyra nya uttag' }, { mode: 'blank' }, { jobType: 'badrum' }, { busy: true }, { formSignature: 'nya villkor eller ny kund' }]) {
    expect(canApplyJobTypeStart(before, { ...before, ...patch })).toBe(false)
  }
})

test('onboarding läser om, sparar insamlade val, finaliserar, sedan får anroparen en intern URL', async () => {
  const network = transport()
  const href = await completeFirstQuoteOnboarding(selection, { companyName: 'El AB', firstFocus: 'fler-jobb' }, network.fetcher)
  expect(href).toBe('/dashboard/quotes/new?first_quote=1&job_type=service&template_id=qtpl_service')
  expect(network.calls.map(c => c.method)).toEqual(['GET', 'PUT', 'POST'])
  expect(network.calls[1].body).toEqual({ step: 7, data: { companyName: 'El AB', firstFocus: 'fler-jobb', firstQuoteSelection: selection } })
  expect(network.calls.some(c => /quotes|send/.test(c.url))).toBe(false)
})

for (const method of ['GET', 'PUT', 'POST']) test(`onboarding ${method}-fel lämnar kvar användaren utan falsk övergång`, async () => {
  const network = transport({ fail: `${method} ${method === 'GET' ? '/api/job-types/quote-setup' : '/api/onboarding'}` })
  await expect(completeFirstQuoteOnboarding(selection, {}, network.fetcher)).rejects.toThrow()
  expect(network.calls.length).toBe(method === 'GET' ? 1 : method === 'PUT' ? 2 : 3)
})

test('föråldrat onboardingval ger inga skrivningar', async () => {
  const network = transport({ setup: { ...setup, jobTypes: [] } })
  await expect(completeFirstQuoteOnboarding(selection, {}, network.fetcher)).rejects.toThrow()
  expect(network.calls.map(c => c.method)).toEqual(['GET'])
})

test('inkopplingen äger ingen ny offertskrivare, ingen ny pris-/reservationsmotor och inget nionde steg', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const builder = read('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
  const handler = builder.split('async function applyJobTypeStart')[1].split('function handleTemplateSelect')[0]
  expect(handler).toContain('isEditMode')
  expect(handler).toContain('inheritedJobType !== selection.jobTypeSlug')
  expect(handler).toContain('canApplyJobTypeStart(before, jobStartSnapshot.current)')
  expect(handler).toContain('handleNewTemplateSelect(start.template, start.products)')
  expect(handler).not.toMatch(/setSelectedCustomer|setTitle|setDescription|\.insert\(/)
  expect(builder).toContain('resolveTemplateItemPrices(cloned, pricingProducts, pricingSettings?.hourly_rate)')
  expect(builder).toContain('useReservationSuggestions(items,')
  expect(builder).toContain('jobTypeStart={jobTypeStart}')
  const intake = read('app/dashboard/quotes/new/components/quick/QuickIntake.tsx')
  expect(intake.indexOf('{jobTypeStart}')).toBeGreaterThan(intake.indexOf('fixed inset-0'))
  const onboarding = read('app/onboarding/page.tsx')
  expect(onboarding).toContain('TOTAL_STEPS = 8')
  expect(onboarding).toContain('<FirstQuoteLaunch')
  expect(onboarding).toContain('await completeFirstQuoteOnboarding')
  expect(read('app/onboarding/components/Step6LiveTour.tsx')).toContain('writeFirstMissionPrompt')
})
