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
import { test, expect } from '@playwright/test'
import { renderToStaticMarkup as renderToStaticMarkupUntyped } from 'react-dom/server.browser'
import { createElement, type ReactElement } from 'react'
import QuoteDocument from '../components/quotes/document/QuoteDocument'
import { describeReservationSuggestionRows } from '../components/quotes/document/format'
import type { QuoteTemplateData, QuoteTemplateItem } from '../lib/quote-templates/types'
import type { ReservationSuggestion } from '../lib/reservations/match'

const renderToStaticMarkup = renderToStaticMarkupUntyped as unknown as (element: ReactElement) => string

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
})
