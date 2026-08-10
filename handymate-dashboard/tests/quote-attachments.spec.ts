/**
 * Facit + källskanningar för offertbilagorna (2026-08-10, Andreas fynd).
 *
 * ═══ FELET SOM VAKTAS ═══
 *
 * Uppladdningen sparades i quotes.attachments (B6) — men fältet nådde aldrig
 * kunden: mallbyggaren mappade det inte (så varken dokumentet eller PDF:en
 * visade bilagorna), och den enda ytan som renderade dem (/quote/[token])
 * är sidan portalkunder redirectas FÖRBI. Dessutom saknade edit-sidan
 * bilagehanteringen helt. Samma felklass som A4 ("insamlat men aldrig
 * renderat") + "Bygg inte på en yta kunden aldrig når" (lärdomen 2026-08-06).
 *
 *   npx playwright test tests/quote-attachments.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildQuoteTemplateData } from '../lib/quote-templates/data-builder'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const minimalQuote = (attachments: unknown) => ({
  quote_items: [],
  items: [],
  attachments,
})

test.describe('mallbyggaren bär bilagorna — defensivt filtrerade', () => {
  test('giltiga bilagor mappas till namn + länk', () => {
    const data = buildQuoteTemplateData(
      minimalQuote([
        { name: 'Ritning_plan2.pdf', url: 'https://x/storage/ritning.pdf', size: 12345 },
        { name: 'Materialspec.pdf', url: 'https://x/storage/spec.pdf' },
      ]),
      {}, {},
    )
    expect(data.quote.attachments).toEqual([
      { name: 'Ritning_plan2.pdf', url: 'https://x/storage/ritning.pdf' },
      { name: 'Materialspec.pdf', url: 'https://x/storage/spec.pdf' },
    ])
  })

  test('trasiga rader filtreras — en skräprad får aldrig fälla dokumentet', () => {
    const data = buildQuoteTemplateData(
      minimalQuote([
        { name: 'Ok.pdf', url: 'https://x/ok.pdf' },
        { name: 123, url: 'https://x/fel.pdf' },
        { url: 'https://x/utan-namn.pdf' },
        null,
        'bara-en-sträng',
      ]),
      {}, {},
    )
    expect(data.quote.attachments).toEqual([{ name: 'Ok.pdf', url: 'https://x/ok.pdf' }])
  })

  test('saknat/trasigt fält blir null, tom lista förblir tom — sektionen grindar på längd', () => {
    // Samma semantik som reservations: [] är ett ärligt "inga", null är
    // "fältet fanns inte". QuoteDocument renderar bara vid length > 0.
    expect(buildQuoteTemplateData(minimalQuote([]), {}, {}).quote.attachments).toEqual([])
    expect(buildQuoteTemplateData(minimalQuote(null), {}, {}).quote.attachments).toBeNull()
    expect(buildQuoteTemplateData(minimalQuote('skräp'), {}, {}).quote.attachments).toBeNull()
    const dok = read('components/quotes/document/QuoteDocument.tsx')
    expect(dok).toContain('data.quote.attachments.length > 0')
  })
})

test.describe('hela kedjan renderar — dokument, PDF, portal, publika sidan', () => {
  test('QuoteDocument (dokumentet + PDF:en via render-react) har Bilagor-sektionen', () => {
    const dok = read('components/quotes/document/QuoteDocument.tsx')
    expect(dok).toContain('data.quote.attachments')
    expect(dok).toContain('Bilagor')
    // PDF-vägen renderar SAMMA komponent — sektionen följer med gratis.
    expect(read('lib/quote-templates/render-react.tsx')).toContain("QuoteDocument from '@/components/quotes/document/QuoteDocument'")
  })

  test('portalens signeringsmodal visar bilagorna — ytan kunden faktiskt når', () => {
    const modal = read('app/portal/[token]/components/PortalQuoteSigningModal.tsx')
    expect(modal).toContain('setBilagor(Array.isArray(data.quote.attachments)')
    expect(modal).toContain('BILAGOR')
  })

  test('publika DTO:n bär fältet — modalen läser den vägen', () => {
    expect(read('lib/quotes/public-dto.ts')).toContain('attachments: Array.isArray(quote.attachments)')
  })

  test('live-förhandsvisningarna visar samma sak som kunden får', () => {
    for (const sida of ['app/dashboard/quotes/new/page.tsx', 'app/dashboard/quotes/[id]/edit/page.tsx']) {
      const s = read(sida)
      expect(s, `${sida} skickar inte bilagorna till live-dokumentet`)
        .toContain('attachments: attachments.length > 0')
    }
  })
})

test.describe('edit-sidan tappar aldrig bilagorna', () => {
  const edit = read('app/dashboard/quotes/[id]/edit/page.tsx')

  test('hydrerar från offerten och renderar kortet', () => {
    expect(edit).toContain('setAttachments((quote as any).attachments)')
    expect(edit).toContain('<QuoteNewAttachmentsCard')
  })

  test('payloaden bär fältet — även som tömd lista, så borttag sparas', () => {
    // API:t uppdaterar bara när fältet finns i bodyn (body.attachments !==
    // undefined) — skickas det aldrig går bilagor inte att ta bort.
    const i = edit.indexOf('const buildPayload')
    const block = edit.slice(i, edit.indexOf('async function', i))
    expect(block).toContain('attachments,')
  })

  test('PUT-vägen skriver bara när fältet skickas — ingen radering av misstag', () => {
    const api = read('app/api/quotes/route.ts')
    expect(api).toContain('if (body.attachments !== undefined) updates.attachments = body.attachments')
  })
})
