import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { toSetupTemplate, resolveFirstQuoteSelection, coreArticleGuidance, type QuoteSetupData } from '../lib/quotes/job-type-setup'
import { loadJobTypeStart } from '../lib/quotes/job-type-start'
import { resolveTemplateItemPrices } from '../lib/quotes/resolve-template-item-prices'
import { suggestSnapshotForItems } from '../lib/reservations/suggest-for-items'
import { buildQuotePayload } from '../app/dashboard/quotes/_shared/buildQuotePayload'
import { fetchQuoteForEdit } from '../app/dashboard/quotes/_shared/loadEditQuote'
import { calculateQuoteValidUntil } from '../lib/quotes/validity'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

const rawTemplate = {
  id: 'tpl_service', name: 'Servicebesök', category: 'service', job_type_slug: 'service', updated_at: '2026-08-31T08:00:00Z',
  default_items: [
    { item_type: 'item', description: 'Arbetstid', unit: 'tim', quantity: 4, unit_price: 650, linked_product_id: 'work' },
    { item_type: 'item', description: 'Framkörning', unit: 'st', quantity: 1, unit_price: 9999, linked_product_id: 'trip' },
    { item_type: 'item', description: 'Standardmaterial', unit: 'st', quantity: 1, unit_price: 9999, linked_product_id: 'material' },
  ],
}
const setup: QuoteSetupData = {
  linkingAvailable: true,
  jobTypes: [{ id: 'jt_service', slug: 'service', name: 'Servicebesök' }],
  templates: [toSetupTemplate(rawTemplate)],
  products: [
    { id: 'work', name: 'Arbetstid', unit: 'tim', salesPrice: 950 },
    { id: 'trip', name: 'Framkörning', unit: 'st', salesPrice: 495 },
    { id: 'material', name: 'Standardmaterial', unit: 'st', salesPrice: 325 },
  ],
}

function setupTransport() {
  const fetcher = (async (url: string) => {
    if (url === '/api/job-types/quote-setup') return Response.json(setup)
    if (url === '/api/quote-templates') return Response.json({ templates: [rawTemplate] })
    throw new Error(`Oväntat anrop ${url}`)
  }) as typeof fetch
  return fetcher
}

test('nytt företag → jobbtyp → verkliga priser → reservation → sparning → återöppning', async () => {
  const selection = resolveFirstQuoteSelection(setup, { jobTypeSlug: 'service', templateId: 'tpl_service' })
  expect(selection).not.toBeNull()
  const start = await loadJobTypeStart(selection!, undefined, setupTransport())
  const items = resolveTemplateItemPrices(start.template.default_items, start.products, 700)
  expect(items.map(i => i.unit_price)).toEqual([950, 495, 325])
  expect(items.map(i => i.unit_price)).not.toContain(9999)

  const reservations = suggestSnapshotForItems([{
    id: 'res_trip', title: 'Framkomlighet', content: 'Fri väg fram till arbetsplatsen förutsätts.', is_active: true,
    suggest_enabled: true, sort_order: 0, triggers: [{ trigger_type: 'product', product_id: 'trip' }],
  } as any], items)
  expect(reservations.map(r => r.reservation_id)).toEqual(['res_trip'])

  const payload = buildQuotePayload({
    mode: 'create', selectedCustomer: 'customer_1', title: 'Service hos Andersson', description: 'Fyra timmar service',
    items, templateId: selection!.templateId, quoteJobType: selection!.jobTypeSlug, dealId: 'deal_1', leadId: null,
    vatRate: 25, discountPercent: 0, notIncluded: '', ataTerms: '', paymentTermsText: '', termsText: '',
    reservationsSnapshot: reservations, paymentPlan: [], paymentPlanValid: true, calculatedPaymentPlan: [],
    referencePerson: '', customerReference: '', projectAddress: '', detailLevel: 'detailed', showUnitPrices: true,
    showQuantities: true, hasRotItems: false, hasRutItems: false, personnummer: '', fastighetsbeteckning: '',
    validDays: 30, templateStyle: 'modern', attachments: [],
  })
  expect(payload).toMatchObject({ customer_id: 'customer_1', deal_id: 'deal_1', job_type: 'service', template_id: 'tpl_service' })
  expect(payload.reservations_snapshot).toEqual(reservations)

  const previousFetch = global.fetch
  try {
    global.fetch = (async () => Response.json({ quote: {
      ...payload, quote_id: 'quote_1', quote_number: '#001', created_at: '2026-08-31T08:00:00Z',
      valid_until: '2026-09-30', quote_items: payload.quote_items,
    } })) as typeof fetch
    const reopened = await fetchQuoteForEdit('quote_1')
    expect(reopened.selectedCustomer).toBe('customer_1')
    expect(reopened.items.map(i => i.linked_product_id)).toEqual(['work', 'trip', 'material'])
    expect(reopened.items.map(i => i.unit_price)).toEqual([950, 495, 325])
    expect(reopened.loadedReservations).toEqual(reservations)
  } finally { global.fetch = previousFetch }
})

test('3–5 nyckelartiklar är rekommendation och sann status, aldrig onboardinggrind', () => {
  const rows = setup.templates[0].items.map((item, index) => ({ item, product: setup.products[index], status: 'priced' as const }))
  expect(coreArticleGuidance(rows)).toContain('3 nyckelartiklar')
  const component = read('components/onboarding/JobTypeQuoteSetup.tsx')
  expect(component).toContain('3–5 återkommande nyckelartiklar')
  expect(component).toContain('Det är en genväg, inte ett krav')
  expect(component).not.toMatch(/disabled=\{[^}]*coreArticle|throw[^\n]*nyckelartik/i)
})

test('editorns Skicka går till riktiga skicka-dialogen och påstår aldrig skickat före sändning', () => {
  const save = read('app/dashboard/quotes/_shared/useQuoteBuilderSave.ts')
  const details = read('app/dashboard/quotes/[id]/page.tsx')
  expect(save).toContain('`/dashboard/quotes/${quoteId}?send=true`')
  expect(save).not.toContain("toast.success(send ? 'Offert skickad!'")
  expect(save).not.toMatch(/mode === 'edit' && send \? \{ status: 'sent' \}/)
  expect(details).toContain("searchParams?.get('send') === 'true'")
  expect(details).toContain('onOpenSendModal()')
})

test('autospar förankrar giltighetsdatum i offertens skapandedatum', () => {
  expect(calculateQuoteValidUntil('2026-08-01T12:00:00Z', 30)).toBe('2026-08-31')
  expect(calculateQuoteValidUntil('2026-08-01T12:00:00+02:00', 60)).toBe('2026-09-30')
  const route = read('app/api/quotes/route.ts')
  expect(route).toContain("select('quote_id, business_id, status, customer_id, created_at')")
  expect(route).toContain('calculateQuoteValidUntil(existing.created_at, body.valid_days)')
  expect(route).not.toMatch(/if \(body\.valid_days !== undefined\)[\s\S]{0,180}const validUntil = new Date\(\)/)
})
