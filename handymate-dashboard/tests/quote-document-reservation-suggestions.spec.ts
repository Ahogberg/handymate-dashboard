/**
 * Fas D (offertskaparen-design-polish, 2026-09-01) — reservationsförslagen
 * flyttade IN i dokumentets egen Reservationer-sektion.
 *
 * Ersätter den fristående ReservationSuggestionBanner:en (satt i
 * assistentkolumnen, utanför dokumentet) med en amberfärgad ruta inuti
 * QuoteDocument.tsx:s "Reservationer"-sektion — se komponentens docblock för
 * `reservationSuggestions`/`onReviewReservationSuggestions`.
 *
 * Tre saker facit-testas:
 *   1. Rutan renderas i EDIT-läge med förslag, både när den frusna
 *      (accepterade) reservationslistan är tom OCH när den redan har
 *      innehåll — count/radnamn stämmer i båda fallen.
 *   2. Rutan renderas ALDRIG i STATIC-läge, oavsett förslag — samma
 *      edit/static-disciplin som "Sätt pris"-pillen
 *      (tests/quote-document-priceless-pill.spec.ts, QuoteDocumentRow.tsx
 *      isPriceless). En kund ska aldrig se en intern "ta ställning"-uppmaning.
 *   3. Radnamns-hopslagningshjälparen (describeReservationSuggestionRows,
 *      components/quotes/document/format.ts) — 1/2/3+ distinkta rader.
 *
 * Körs: npx playwright test tests/quote-document-reservation-suggestions.spec.ts --no-deps
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'
import { renderToStaticMarkup as renderToStaticMarkupUntyped } from 'react-dom/server.browser'
import { createElement, type ReactElement } from 'react'
import QuoteDocument from '../components/quotes/document/QuoteDocument'
import { ReservationSuggestionBox } from '../components/quotes/document/ReservationSuggestionBox'
import { describeReservationSuggestionRows } from '../components/quotes/document/format'
import type { QuoteTemplateData, QuoteTemplateItem } from '../lib/quote-templates/types'
import type { ReservationSuggestion } from '../lib/reservations/match'

const renderToStaticMarkup = renderToStaticMarkupUntyped as unknown as (element: ReactElement) => string

const ROOT = path.resolve(__dirname, '..')

function baseItems(): QuoteTemplateItem[] {
  return [
    { itemType: 'item', id: 'i1', name: 'Rivning golv', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200 },
    { itemType: 'item', id: 'i2', name: 'Håltagning vägg', quantity: 2, unit: 'tim', unitPrice: 700, total: 1400 },
  ]
}

function fixture(reservations: QuoteTemplateData['quote']['reservations'] = null): QuoteTemplateData {
  return {
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: 'Verkstadsgatan 4, 123 45 Storstad',
      contactName: 'Anna Andersson', phone: '070-1234567', email: 'anna@byggco.se',
      fSkatt: true, accentColor: '#0F766E',
    },
    customer: { name: 'Kalle Kund' },
    quote: {
      number: 'OF-2026-0042', issuedDate: '3 augusti 2026', validUntilDate: '2 september 2026',
      title: 'Badrumsrenovering', items: baseItems(),
      subtotalExVat: 6600, vatAmount: 1650, totalIncVat: 8250, amountToPay: 8250,
      paymentTerms: '30 dagar netto',
      reservations,
    },
    displayLevel: 'full', showQuantities: true, showUnitPrices: true,
  }
}

const suggestions: ReservationSuggestion[] = [
  {
    reservation: { id: 'r1', title: 'Asbestförbehåll', content: 'Provtagning krävs innan rivning.', triggers: [] },
    triggeredBy: [{ itemId: 'i1', description: 'Rivning golv' }],
  },
  {
    reservation: { id: 'r2', title: 'Dolda rör', content: 'Ansvarsfriskrivning för dolda ledningar.', triggers: [] },
    triggeredBy: [{ itemId: 'i2', description: 'Håltagning vägg' }],
  },
]

function renderDoc(data: QuoteTemplateData, mode: 'static' | 'edit', reservationSuggestions?: ReservationSuggestion[]) {
  return renderToStaticMarkup(
    createElement(QuoteDocument, {
      data: { ...data, docType: 'quote' as const },
      mode,
      reservationSuggestions,
      onReviewReservationSuggestions: () => {},
    })
  )
}

test.describe('Reservationsförslag i dokumentet (Fas D)', () => {
  test('renderas i edit-läge när accepterad-listan är TOM', () => {
    const html = renderDoc(fixture(null), 'edit', suggestions)
    expect(html).toContain('2 förslag från Daniel')
    expect(html).toContain('Rivning golv och Håltagning vägg')
    expect(html).toContain('Ta ställning')
    expect(html).toContain('data-section="reservationer"')
  })

  test('renderas i edit-läge NÄR accepterad-listan redan har innehåll', () => {
    const html = renderDoc(
      fixture([{ title: 'Befintligt förbehåll', content: 'Redan tillagt.' }]),
      'edit',
      suggestions,
    )
    expect(html).toContain('Befintligt förbehåll')
    expect(html).toContain('2 förslag från Daniel')
    expect(html).toContain('Ta ställning')
  })

  test('renderas ALDRIG i static-läge, även med förslag — kunden ska aldrig se "Ta ställning"', () => {
    const html = renderDoc(fixture(null), 'static', suggestions)
    expect(html).not.toContain('Ta ställning')
    expect(html).not.toContain('förslag från Daniel')
  })

  test('renderas inte i edit-läge när det inte finns några förslag', () => {
    const html = renderDoc(fixture(null), 'edit', [])
    expect(html).not.toContain('Ta ställning')
    expect(html).not.toContain('förslag från Daniel')
  })

  test('renderas inte alls när reservationSuggestions är utelämnad', () => {
    const html = renderDoc(fixture(null), 'edit', undefined)
    expect(html).not.toContain('Ta ställning')
  })

  // Bugg (adversarial datakorrekthetsgranskning, 2026-09-01): matchReservations
  // kan producera en triggeredBy-post med description: '' (t.ex. en produkt-/
  // kategori-trigger på en rad utan egen fri beskrivning). Om ALLA träffar
  // över samtliga förslag saknar beskrivning blev meningen "N förslag från
  // Daniel — följer med raderna" med ett efterföljande blanksteg och inga
  // namn — läser som trasigt. Klausulen ska då utelämnas helt.
  test('alla triggeredBy-beskrivningar blanka → ingen "— följer med raderna"-klausul, bara "N förslag från Daniel"', () => {
    const blankSuggestions: ReservationSuggestion[] = [
      {
        reservation: { id: 'r3', title: 'Elsäkerhetsförbehåll', content: 'Behörig elektriker krävs.', triggers: [] },
        triggeredBy: [{ itemId: 'i3', description: '' }],
      },
      {
        reservation: { id: 'r4', title: 'Ventilationsförbehåll', content: 'OVK kan krävas.', triggers: [] },
        triggeredBy: [{ itemId: 'i4', description: '   ' }],
      },
    ]
    const html = renderDoc(fixture(null), 'edit', blankSuggestions)
    expect(html).toContain('2 förslag från Daniel')
    expect(html).not.toContain('följer med raderna')
    // Exakt innehåll i textstycket — inget löst "—" eller extra blanksteg
    // kvar när radnamns-klausulen är borttagen.
    const textMatch = html.match(/<p class="reservation-suggestion-banner__text">(.*?)<\/p>/)
    expect(textMatch, `hittade inte textstycket i: ${html}`).not.toBeNull()
    expect(textMatch![1]).toBe('<strong>2 förslag från Daniel</strong>')
  })
})

test.describe('describeReservationSuggestionRows — radnamns-hopslagning', () => {
  test('1 distinkt radnamn: bara namnet, ingen "och"', () => {
    expect(describeReservationSuggestionRows(['Rivning golv'])).toBe('Rivning golv')
  })

  test('2 distinkta radnamn: "A och B"', () => {
    expect(describeReservationSuggestionRows(['Rivning golv', 'Håltagning vägg'])).toBe('Rivning golv och Håltagning vägg')
  })

  test('3+ distinkta radnamn: "A och B m.fl."', () => {
    expect(describeReservationSuggestionRows(['Rivning golv', 'Håltagning vägg', 'Elarbete'])).toBe(
      'Rivning golv och Håltagning vägg m.fl.',
    )
  })

  test('dedupe: samma radnamn från flera förslag räknas bara en gång', () => {
    expect(describeReservationSuggestionRows(['Rivning golv', 'Rivning golv', 'Håltagning vägg'])).toBe(
      'Rivning golv och Håltagning vägg',
    )
  })

  test('tom lista ger tom sträng', () => {
    expect(describeReservationSuggestionRows([])).toBe('')
  })

  // Bugg (adversarial review, 2026-09-01): ALLA beskrivningar blanka (tom
  // sträng eller bara whitespace) ska ge tom sträng, inte t.ex. ett löst
  // mellanslag — det är just det fallet som gjorde att JSX-konsumenten i
  // ReservationSuggestionBox.tsx tidigare renderade en trasig mening.
  test('alla beskrivningar blanka (tomt/whitespace) ger tom sträng', () => {
    expect(describeReservationSuggestionRows(['', '   ', ''])).toBe('')
  })
})

test.describe('Lokalt "dölj tills vidare" på reservationsförslagsrutan (adversarial review, 2026-09-01)', () => {
  // Ingen @testing-library/react/jsdom finns i det här repot (samma
  // disciplin som tests/priority-rules-suggestions.spec.ts och
  // tests/next-best-action.spec.ts) — facit källskannar den renderade
  // komponentens källkod i stället för att mounta den och simulera ett
  // klick. Det bevisar EXAKT vad ×-knappens onClick gör (och inte gör),
  // vilket är starkare än en mount-test här hade varit: en körd
  // klicksimulering hade bara visat att rutan försvinner, inte GARANTERAT
  // att inget annat (sendDecisions, setReviewOpen, en framtida
  // regressions-ihopkoppling) råkar triggas av samma handler.
  const SOURCE = fs.readFileSync(path.join(ROOT, 'components/quotes/document/ReservationSuggestionBox.tsx'), 'utf8')

  test('komponenten har en egen, lokal useState för dismissed — inte en prop, inte reservationsmotorns state', () => {
    expect(SOURCE).toContain('const [dismissed, setDismissed] = useState(false)')
    // Får aldrig komma in som prop — då hade den kunnat styras/persisteras utifrån.
    expect(SOURCE).not.toMatch(/dismissed\s*[:,]\s*(boolean|prop)/i)
  })

  test('dismissed=true döljer rutan helt (early return null, precis som suggestions.length===0)', () => {
    expect(SOURCE).toContain('if (suggestions.length === 0 || dismissed) return null')
  })

  test('×-knappens onClick anropar ENDAST setDismissed(true) — rör aldrig onReview, suggestions eller reservationsmotorns beslut', () => {
    // Isolera ×-knappens JSX-block (mellan dismiss-ariaLabel och dess stängande tag).
    const dismissStart = SOURCE.indexOf('aria-label="Dölj tills vidare"')
    expect(dismissStart, 'hittade inte dismiss-knappen i källan').toBeGreaterThan(-1)
    const blockStart = SOURCE.lastIndexOf('<button', dismissStart)
    const blockEnd = SOURCE.indexOf('</button>', dismissStart)
    const dismissButtonBlock = SOURCE.slice(blockStart, blockEnd)

    expect(dismissButtonBlock).toContain('onClick={() => setDismissed(true)}')
    // Nollbevis: dismiss-knappens EGET block nämner inte någon av
    // reservationsmotorns muterande vägar.
    for (const forbidden of ['onReview', 'sendDecisions', 'setReviewOpen', 'dismissedIds', 'acceptSuggestions', 'fetch(']) {
      expect(dismissButtonBlock, `dismiss-knappen ska aldrig referera "${forbidden}"`).not.toContain(forbidden)
    }
  })

  test('"Ta ställning"-knappen är en annan knapp och rör inte dismissed-state', () => {
    const ctaStart = SOURCE.indexOf('reservation-suggestion-banner__cta')
    const ctaBlockStart = SOURCE.lastIndexOf('<button', ctaStart)
    const ctaBlockEnd = SOURCE.indexOf('</button>', ctaStart)
    const ctaButtonBlock = SOURCE.slice(ctaBlockStart, ctaBlockEnd)

    expect(ctaButtonBlock).toContain('onClick={() => onReview?.()}')
    expect(ctaButtonBlock).not.toContain('setDismissed')
  })

  test('komponentens props tar bara suggestions/onReview/sectionAttrs — inget separat dismiss-relaterat callback att koppla till persistens av misstag', () => {
    const propsBlockStart = SOURCE.indexOf('interface ReservationSuggestionBoxProps')
    const propsBlockEnd = SOURCE.indexOf('}', propsBlockStart)
    const propsBlock = SOURCE.slice(propsBlockStart, propsBlockEnd)
    expect(propsBlock).toContain('suggestions: ReservationSuggestion[]')
    expect(propsBlock).toContain('onReview?: () => void')
    expect(propsBlock).toContain('sectionAttrs: Record<string, string | undefined>')
    expect(propsBlock).not.toContain('onDismiss')
  })
})
