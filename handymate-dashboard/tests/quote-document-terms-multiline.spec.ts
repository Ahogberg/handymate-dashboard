/**
 * Del 1 (offertytan) — flerradiga EditableText-värden i villkorsstycket
 * flödar EFTER sin etikett, inte ovanför den.
 *
 * Buggen: EditableText:s vilo-<span> (EditableFields.tsx) hade
 * `display: inline-block` + `white-space: pre-line`. En inline-blocks
 * baslinje är dess SISTA radbox (CSS 2.1 §10.8.1) — så det sexpunktiga
 * standardvärdet för "Ej inkluderat:" (lib/quote-standard-text-defaults.ts)
 * renderades med fem punkter FLYTANDE OVANFÖR raden med etiketten
 * <strong>Ej inkluderat:</strong>, och bara sista punkten bredvid den.
 *
 * Fixen: `display: 'inline'` för ifyllda värden (inline-boxar fragmenterar
 * över radboxar och flödar naturligt efter etiketten; pre-line fungerar på
 * inline). Tomma värden behåller inline-block för minWidth-klickytan
 * (min-width har ingen effekt på inline-boxar) — placeholdern är alltid
 * enradig så baslinjeproblemet kan inte uppstå där.
 *
 * renderToStaticMarkup serialiserar inline-styles rakt in i HTML-strängen,
 * så provet asserterar på själva stilen som skulle återinföra buggen —
 * en källsannings-assertion, inte bara dokumentordning (etiketten kommer
 * ALLTID före värdet i HTML-strömmen; det var baslinjen som var fel).
 *
 *   npx playwright test tests/quote-document-terms-multiline.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { renderToStaticMarkup as renderToStaticMarkupUntyped } from 'react-dom/server.browser'
import { createElement, type ReactElement } from 'react'
import QuoteDocument from '../components/quotes/document/QuoteDocument'
import type { QuoteTemplateData } from '../lib/quote-templates/types'
import { getDefaultStandardTexts } from '../lib/quote-standard-text-defaults'

const renderToStaticMarkup = renderToStaticMarkupUntyped as unknown as (element: ReactElement) => string

// Det RIKTIGA seed-värdet — importerat, inte kopierat, så provet följer
// produktionssanningen om standardtexten någonsin ändras.
const NOT_INCLUDED_DEFAULT = getDefaultStandardTexts()
  .find(t => t.text_type === 'not_included')!.content

function fixture(notIncluded: string): QuoteTemplateData {
  return {
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se',
      fSkatt: true, accentColor: '#0F766E',
    },
    customer: { name: 'Kalle Kund' },
    quote: {
      number: 'OF-2026-0042', issuedDate: '3 augusti 2026', validUntilDate: '2 september 2026',
      title: 'Badrumsrenovering',
      items: [
        { itemType: 'item', id: 'i1', name: 'Rivning golv', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200 },
      ],
      subtotalExVat: 5200, vatAmount: 1300, totalIncVat: 6500, amountToPay: 6500,
      paymentTerms: '30 dagar netto',
      termsText: 'Offerten omfattar arbetsmoment enligt specifikation ovan.',
      notIncluded,
    },
    displayLevel: 'full', showQuantities: true, showUnitPrices: true,
  }
}

function renderDoc(notIncluded: string, mode: 'static' | 'edit') {
  return renderToStaticMarkup(
    createElement(QuoteDocument, {
      data: { ...fixture(notIncluded), docType: 'quote' as const },
      mode,
      handlers: mode === 'edit'
        ? { onTermsChange: () => {}, onNotIncludedChange: () => {} }
        : undefined,
    })
  )
}

/** style-attributet på det EditableText-span vars innehåll börjar med `contentStart`. */
function styleOfSpanStartingWith(html: string, contentStart: string): string {
  const escaped = contentStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = html.match(new RegExp(`<span[^>]*style="([^"]*)"[^>]*>${escaped}`))
  expect(m, `hittade inget span som börjar med "${contentStart}" i: ${html.slice(html.indexOf('Villkor.'), html.indexOf('Villkor.') + 2000)}`).not.toBeNull()
  return m![1]
}

test.describe('Villkorsstyckets flerradiga EditableText — etikett-först-flöde (edit-läge)', () => {
  test('seed-värdet är fortfarande den flerradiga premissen provet bygger på', () => {
    // Sex •-rader separerade med \n — utan detta testar resten ingenting.
    expect(NOT_INCLUDED_DEFAULT.split('\n').length).toBe(6)
    expect(NOT_INCLUDED_DEFAULT.startsWith('• ')).toBe(true)
  })

  test('sexpunktiga "Ej inkluderat"-värdet renderas som display:inline — ALDRIG inline-block (baslinjebuggen)', () => {
    const html = renderDoc(NOT_INCLUDED_DEFAULT, 'edit')

    // Etiketten före värdet i dokumentordning (sanity, inte själva fixen).
    const labelIdx = html.indexOf('<strong>Ej inkluderat:</strong>')
    const valueIdx = html.indexOf('• Eventuella tillstånd och bygglov')
    expect(labelIdx).toBeGreaterThan(-1)
    expect(valueIdx).toBeGreaterThan(labelIdx)

    // Själva fixen: värde-spanets style. 'display:inline' är en delsträng
    // av 'display:inline-block', så matcha med avgränsare.
    const style = styleOfSpanStartingWith(html, '• Eventuella tillstånd och bygglov')
    expect(style).not.toContain('display:inline-block')
    expect(style).toMatch(/(^|;)display:inline(;|$)/)
    // pre-line ska överleva fixen — det är den som gör \n till radbrytningar.
    expect(style).toContain('white-space:pre-line')
  })

  test('flerradiga "Villkor."-värdet (termsText via onTermsChange) tar samma inline-väg', () => {
    const multilineTerms = 'Offerten omfattar arbetsmoment enligt specifikation.\nEtablering ingår.'
    const html = renderToStaticMarkup(
      createElement(QuoteDocument, {
        data: { ...fixture(NOT_INCLUDED_DEFAULT), docType: 'quote' as const, quote: { ...fixture(NOT_INCLUDED_DEFAULT).quote, termsText: multilineTerms } } as QuoteTemplateData & { docType: 'quote' },
        mode: 'edit',
        handlers: { onTermsChange: () => {}, onNotIncludedChange: () => {} },
      })
    )
    const style = styleOfSpanStartingWith(html, 'Offerten omfattar arbetsmoment enligt specifikation.')
    expect(style).not.toContain('display:inline-block')
    expect(style).toMatch(/(^|;)display:inline(;|$)/)
  })

  test('TOMT värde behåller inline-block — minWidth-klickytan kräver en block-container och placeholdern är enradig', () => {
    const html = renderDoc('', 'edit')
    // Tomt notIncluded + onNotIncludedChange → placeholder-spanet renderas
    // inuti det yttre editable-spanet.
    const m = html.match(/<span[^>]*style="([^"]*)"[^>]*><span[^>]*>Vad ingår inte i offerten…<\/span>/)
    expect(m, 'placeholder-spanet för tomt "Ej inkluderat" saknas').not.toBeNull()
    expect(m![1]).toContain('display:inline-block')
    expect(m![1]).toContain('min-width:1ch')
  })
})

test.describe('Static-grenen (kund/PDF) är orörd av fixen', () => {
  test('static-läge renderar rå text direkt i <p class="terms"> — ingen EditableText-markup alls', () => {
    const html = renderDoc(NOT_INCLUDED_DEFAULT, 'static')
    // Rå textnod direkt efter etiketten (mellanslaget kommer från JSX:en).
    expect(html).toContain('<strong>Ej inkluderat:</strong> • Eventuella tillstånd och bygglov')
    // Inga vilo-spans från EditableText någonstans i static-dokumentet.
    expect(html).not.toContain('editable-text')
    expect(html).not.toContain('white-space:pre-line')
  })
})
