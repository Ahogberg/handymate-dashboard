/**
 * Facit för Fas 3 (offert-omtaget, 2026-08-31) — create_quote_draft.
 *
 * ═══ VAD SOM VAKTAS HÄR ═══
 *
 * Matte-chattens tidigare "skapa offert"-väg (create_quote) kräver att
 * Claude SJÄLV dikterar färdiga rader — det finns ingen riktig AI-generering
 * bakom den, bara den platta prislista-texten i systemprompten. Det här
 * facit-testet skyddar det NYA verktyget (create_quote_draft) som i stället
 * anropar den riktiga motorn (generateQuoteFromInput, samma som "Bygg
 * utkast"-knappen), och skyddar samtidigt en verklig gammal lucka som
 * upptäcktes under samma arbete: create_quote (agentens/Mattes STRUKTURERADE
 * offertverktyg) satte ALDRIG reservations_snapshot, trots att kommentaren i
 * koden uttryckligen sa att det bara var kö-vägen som gjorde det.
 *
 * Samma konvention som tests/ai-quote-product-linking.spec.ts och
 * tests/agent-tool-boundaries.spec.ts: rena funktioner testas direkt, I/O-
 * tunga routerfunktioner verifieras strukturellt (källkodsläsning) i stället
 * för att mocka Supabase/Anthropic — se de filernas egna huvuden för samma
 * resonemang.
 *
 * Körs: npx playwright test tests/create-quote-draft.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  hasEnoughDescriptionForAiDraft,
  QUOTE_DRAFT_MIN_DESCRIPTION_LENGTH,
} from '../lib/quotes/quote-generation-context'
import { generatedQuoteToQuoteItems, type GeneratedQuoteItemInput } from '../lib/quotes/generated-to-quote-items'
import { toolDefinitions } from '../app/api/agent/trigger/tool-definitions'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Kroppen för en funktion, från deklarationen till nästa toppnivådeklaration
    (samma helper som tests/agent-tool-boundaries.spec.ts). */
function funktionskropp(källa: string, namn: string): string {
  const start = källa.indexOf(`async function ${namn}(`)
  expect(start, `hittade inte ${namn}() — har den bytt namn?`).toBeGreaterThan(-1)
  const nästa = källa.indexOf('\nasync function ', start + 10)
  return källa.slice(start, nästa === -1 ? källa.length : nästa)
}

test.describe('hasEnoughDescriptionForAiDraft — ärlighetsregeln, ren gate', () => {
  test('kort/tom text → nej', () => {
    expect(hasEnoughDescriptionForAiDraft('')).toBe(false)
    expect(hasEnoughDescriptionForAiDraft('Badrum')).toBe(false)
    expect(hasEnoughDescriptionForAiDraft(undefined)).toBe(false)
    expect(hasEnoughDescriptionForAiDraft(null)).toBe(false)
    expect(hasEnoughDescriptionForAiDraft('   ')).toBe(false)
  })

  test('exakt på tröskeln (efter trim) → ja', () => {
    const exakt = 'x'.repeat(QUOTE_DRAFT_MIN_DESCRIPTION_LENGTH)
    expect(hasEnoughDescriptionForAiDraft(exakt)).toBe(true)
    expect(hasEnoughDescriptionForAiDraft(`  ${exakt}  `)).toBe(true)
  })

  test('en meningsfull beskrivning → ja', () => {
    expect(hasEnoughDescriptionForAiDraft('Byta ut hela badrumsgolvet och kakla väggarna, ca 6 kvm.')).toBe(true)
  })
})

test.describe('generatedQuoteToQuoteItems → strukturerade, prissatta rader', () => {
  // Simulerar ett realistiskt generateQuoteFromInput-svar (samma form som
  // GeneratedQuoteItem, lib/ai-quote-generator.ts).
  const items: GeneratedQuoteItemInput[] = [
    { description: 'Rivning av golv', quantity: 4, unit: 'timmar', unitPrice: 650, type: 'labor', confidence: 85 },
    { description: 'Klinkerplattor', quantity: 6, unit: 'm2', unitPrice: 420, type: 'material', confidence: 80, linkedProductId: 'p-1' },
  ]
  const options: GeneratedQuoteItemInput[] = [
    { description: 'Bortforsling av rivningsmassor', quantity: 1, unit: 'st', unitPrice: 800, type: 'service', confidence: 60 },
  ]

  test('ger icke-tomma, prissatta rader med rätt item_type/total', () => {
    const rader = generatedQuoteToQuoteItems(items, options, 'rot')
    expect(rader.length).toBe(3)
    const [rivning, klinker, tillval] = rader
    expect(rivning.item_type).toBe('item')
    expect(rivning.total).toBe(4 * 650)
    expect(rivning.is_rot_eligible).toBe(true) // arbete + rot → ROT-berättigad
    expect(klinker.item_type).toBe('item')
    expect(klinker.total).toBe(6 * 420)
    expect(klinker.linked_product_id).toBe('p-1')
    expect(tillval.item_type).toBe('option')
    expect(tillval.option_selected).toBe(false) // tillval är ALDRIG förvalda
  })

  test('tom items/options-lista ger tom array, ingen krasch', () => {
    expect(generatedQuoteToQuoteItems([], [], 'none')).toEqual([])
    expect(generatedQuoteToQuoteItems(null, undefined, 'none')).toEqual([])
  })
})

test.describe('toolDefinitions — create_quote_draft-schemat', () => {
  const def = toolDefinitions.find(t => t.name === 'create_quote_draft')

  test('verktyget finns, kräver bara job_description', () => {
    expect(def, 'create_quote_draft saknas i tool-definitions.ts').toBeTruthy()
    expect((def as any).input_schema.required).toEqual(['job_description'])
  })

  test('customer_id, title och job_type är valfria fält på schemat', () => {
    const props = (def as any).input_schema.properties
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['customer_id', 'title', 'job_description', 'job_type']))
  })

  test('beskrivningen skiljer verktyget uttryckligen från create_quote', () => {
    expect((def as any).description).toContain('create_quote')
  })
})

test.describe('Matte-chatten och Daniel har verktyget i sin allowlista', () => {
  test('CURATED_TOOL_NAMES (Matte-chattens tillgängliga verktyg) innehåller create_quote_draft', () => {
    const s = read('app/api/matte/chat/route.ts')
    const block = s.slice(s.indexOf('const CURATED_TOOL_NAMES'), s.indexOf('const CURATED_TOOL_NAMES') + 1500)
    expect(block).toContain("'create_quote_draft'")
  })

  test('Daniel (säljare) får create_quote_draft i sin allowedTools-lista', () => {
    const s = read('lib/agents/personalities.ts')
    const start = s.indexOf("id: 'daniel'")
    expect(start, 'hittade inte Daniels personlighet').toBeGreaterThan(-1)
    const block = s.slice(start, s.indexOf('triggers:', start))
    expect(block).toContain("'create_quote_draft'")
  })
})

test.describe('createQuoteDraft() — samma säkerhets- och ärlighetsordning som createQuote()', () => {
  const s = read('app/api/agent/trigger/tool-router.ts')
  const kropp = funktionskropp(s, 'createQuoteDraft')

  test('för tunn beskrivning stoppas FÖRE all I/O (ingen tenant-slagning, ingen AI-generering)', () => {
    const gateIdx = kropp.indexOf('hasEnoughDescriptionForAiDraft(')
    const tenantIdx = kropp.indexOf('assertCustomerInBusiness(')
    const genIdx = kropp.indexOf('generateQuoteFromInput(')
    expect(gateIdx, 'ingen ärlighets-gate för tunn text').toBeGreaterThan(-1)
    expect(gateIdx).toBeLessThan(tenantIdx)
    expect(gateIdx).toBeLessThan(genIdx)
  })

  test('kunden verifieras mot tenanten FÖRE AI-genereringen, när customer_id anges', () => {
    const tenantIdx = kropp.indexOf('assertCustomerInBusiness(')
    const genIdx = kropp.indexOf('generateQuoteFromInput(')
    expect(tenantIdx, 'ingen tenantvakt').toBeGreaterThan(-1)
    expect(tenantIdx).toBeLessThan(genIdx)
  })

  test('saknat timpris stoppar FÖRE generateQuoteFromInput — aldrig ett gissat pris', () => {
    const hourlyIdx = kropp.indexOf('hourlyRateField(')
    const guardIdx = kropp.indexOf('if (!hourlyRate)')
    const genIdx = kropp.indexOf('generateQuoteFromInput(')
    expect(hourlyIdx, 'ingen hourlyRateField-uppslagning').toBeGreaterThan(-1)
    expect(guardIdx, 'inget hourlyRate-guard').toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(genIdx)
  })

  test('reservationsförslaget beräknas (UX3b-mönstret) innan offerten skapas', () => {
    const resIdx = kropp.indexOf('fetchReservationLibrary(')
    const suggestIdx = kropp.indexOf('suggestSnapshotForItems(')
    const createIdx = kropp.indexOf('createCanonicalQuote(')
    expect(resIdx, 'inget reservationsbibliotek hämtas').toBeGreaterThan(-1)
    expect(suggestIdx, 'inget reservationsförslag beräknas').toBeGreaterThan(-1)
    expect(resIdx).toBeLessThan(createIdx)
    expect(suggestIdx).toBeLessThan(createIdx)
  })

  test('offerten skapas via den kanoniska byggaren med source "matte" och genererade rader', () => {
    expect(kropp).toContain("source: 'matte'")
    expect(kropp).toContain('items: quoteItems')
  })
})

test.describe('createQuote() — reservationsluckan (Codex-fynd, 2026-08-31) stängd', () => {
  const s = read('app/api/agent/trigger/tool-router.ts')
  const kropp = funktionskropp(s, 'createQuote')

  test('create_quote sätter nu reservations_snapshot precis som editorn/kö-vägen', () => {
    // Innan fixen: en kommentar sa uttryckligen "reservations_snapshot sätts
    // inte här" — verifiera att det motsatsen nu är sant, inte bara att
    // orden råkar finnas kvar i en gammal kommentar.
    expect(kropp).toContain('fetchReservationLibrary(')
    expect(kropp).toContain('suggestSnapshotForItems(')
    expect(kropp).toContain('reservations_snapshot: reservationsSnapshot')
    expect(kropp, 'den gamla "sätts inte här"-kommentaren ska vara borttagen, inte bara motsagd')
      .not.toContain('reservations_snapshot sätts inte här')
  })

  test('reservationsförslaget beräknas innan offerten skapas', () => {
    const suggestIdx = kropp.indexOf('suggestSnapshotForItems(')
    const createIdx = kropp.indexOf('createCanonicalQuote(')
    expect(suggestIdx).toBeGreaterThan(-1)
    expect(suggestIdx).toBeLessThan(createIdx)
  })
})

test.describe('EN källa för prislista/mallar/kundprislista (Del A punkt 6 — DRY-extraktionen)', () => {
  test('ai-generate-routen, bakgrundsförslaget och create_quote_draft använder alla buildQuoteGenerationContext', () => {
    for (const fil of [
      'app/api/quotes/ai-generate/route.ts',
      'lib/quotes/suggest-quote-draft.ts',
      'app/api/agent/trigger/tool-router.ts',
    ]) {
      const s = read(fil)
      expect(s, `${fil} anropar inte buildQuoteGenerationContext`).toContain('buildQuoteGenerationContext(')
    }
  })
})

test.describe('EXTERNAL_DENIED_TOOLS — create_quote_draft är fail-closed klassat', () => {
  test('verktyget är klassat i external-actor-facit, inte bortglömt', () => {
    const s = read('tests/external-actor.spec.ts')
    expect(s).toContain('create_quote_draft:')
  })
})
