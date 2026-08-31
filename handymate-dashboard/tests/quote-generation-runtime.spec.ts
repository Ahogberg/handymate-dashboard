import { test, expect } from '@playwright/test'
import { generateQuoteFromInput } from '../lib/ai-quote-generator'
import { generatedQuoteToQuoteItems } from '../lib/quotes/generated-to-quote-items'
import { suggestSnapshotForItems } from '../lib/reservations/suggest-for-items'

// Riktiga generatorn, men ALL extern I/O ersatt. Inget skarpt AI-anrop,
// ingen Supabase-skrivning, ingen kostnadsbokföring eller notifiering.
async function runModelResponse(parsed: unknown) {
  const { Messages } = require('@anthropic-ai/sdk/resources/messages')
  const supabaseModule = require('../lib/supabase')
  const costModule = require('../lib/agents/shared/cost-guard')
  const previous = { create: Messages.prototype.create, db: supabaseModule.getServerSupabase,
    meter: costModule.meterDirectLlmCall, key: process.env.ANTHROPIC_API_KEY, fetch: global.fetch }
  const requests: any[] = []
  const metered: any[] = []
  const db = { from() {
    const q: any = { select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      insert() { throw new Error('Testet får aldrig skriva i databasen') },
      update() { throw new Error('Testet får aldrig skriva i databasen') },
    }
    return q
  } }
  try {
    global.fetch = async () => { throw new Error('Testet får aldrig göra nätanrop') }
    process.env.ANTHROPIC_API_KEY = 'offline-test-placeholder'
    supabaseModule.getServerSupabase = () => db
    costModule.meterDirectLlmCall = async (payload: unknown) => { metered.push(payload) }
    Messages.prototype.create = async (request: unknown) => {
      requests.push(request)
      return { content: [{ type: 'text', text: JSON.stringify(parsed) }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 } }
    }
    const quote = await generateQuoteFromInput({ businessId: 'test-only', branch: 'El', hourlyRate: 700,
      textDescription: 'Servicearbete hos Andersson, fyra timmar.',
      priceList: [{ id: 'p1', name: 'Servicearbete', unit: 'tim', unit_price: 950, category: 'arbete' }],
      jobTypeContext: { status: 'selected', jobType: 'service', templateId: 't1', templateName: 'Serviceupplägg',
        rows: [{ description: 'Servicearbete', linkedProductId: 'p1', unit: 'tim', option: false }] },
    })
    return { quote, requests, metered }
  } finally {
    Messages.prototype.create = previous.create
    supabaseModule.getServerSupabase = previous.db
    costModule.meterDirectLlmCall = previous.meter
    global.fetch = previous.fetch
    if (previous.key === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previous.key
  }
}

const aiRow = { description: 'Servicearbete', unit: 'tim', quantity: 4, unitPrice: 777777, type: 'labor', productRef: 'P1' }

test('modellsvar → serverpris → totalsummor → sparrader → reservation, med bevarad kostnadsmätning', async () => {
  const { quote, requests, metered } = await runModelResponse({ jobTitle: 'Service', items: [aiRow], options: [], confidence: 90 })
  expect(requests).toHaveLength(1)
  expect(requests[0].system).toContain('FÖRETAGETS VALDA OFFERTUPPLÄGG')
  expect(quote.items[0]).toMatchObject({ unitPrice: 950, linkedProductId: 'p1', quantitySource: 'proposal' })
  expect(quote.laborCost).toBe(3800)
  expect(quote.totalBeforeVat).toBe(3800)
  expect(quote.quoteBasis).toMatchObject({ templateId: 't1', jobType: 'service' })
  expect(quote.reasoning).toContain('Mängderna är förslag')
  expect(metered).toHaveLength(1)
  const rows = generatedQuoteToQuoteItems(quote.items, quote.options, 'none', true)
  expect(rows[0]).toMatchObject({ unit_price: 950, total: 3800, linked_product_id: 'p1' })
  const reservations = suggestSnapshotForItems([{ id: 'r1', title: 'Förbehåll', content: 'Kontroll krävs.', suggest_enabled: true,
    is_active: true, sort_order: 0, triggers: [{ trigger_type: 'product', product_id: 'p1' }] } as any], rows)
  expect(reservations).toHaveLength(1)
})

test('fel enhet från modellen får inte bankpris eller produktkoppling', async () => {
  const { quote } = await runModelResponse({ items: [{ ...aiRow, unit: 'st' }], options: [] })
  expect(quote.items[0]).toMatchObject({ unitPrice: 0, linkedProductId: null })
  expect(quote.totalBeforeVat).toBe(0)
  expect(quote.missingPriceCount).toBe(1)
})

test('tillval verifieras men ingår aldrig i grundsumman', async () => {
  const { quote } = await runModelResponse({ items: [aiRow], options: [{ ...aiRow, quantity: 2 }] })
  expect(quote.options[0].unitPrice).toBe(950)
  expect(quote.totalBeforeVat).toBe(3800)
  const rows = generatedQuoteToQuoteItems(quote.items, quote.options, 'none', true)
  expect(rows[1].option_selected).toBe(false)
})

test('ogiltig mängd från modellen stoppar generatorn i stället för falsk framgång', async () => {
  await expect(runModelResponse({ items: [{ ...aiRow, quantity: 'fyra' }] })).rejects.toThrow('ogiltig rad eller mängd')
})
