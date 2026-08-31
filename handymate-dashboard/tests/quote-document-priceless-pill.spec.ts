/**
 * Fas C (offertskaparen-design-polish) — "Sätt pris"-pillen för prislösa
 * offertrader.
 *
 * QuoteDocumentRow.tsx:s 'item'/'option'-rader avslutades tidigare alltid
 * med formatCurrency(item.total) i summa-cellen — en artikel som ALDRIG
 * prissatts (unitPrice 0) blev därmed "0 kr", ordagrant identiskt med en
 * artikel som medvetet kostar 0 kr. Hantverkaren kunde inte se skillnad.
 *
 * priceState/priceLabel (lib/products/pricing-state.ts) är redan facit-
 * testade rena funktioner — samma som AddRowSheet.tsx använder för
 * produktbankens prislösa artiklar. Det här provet verifierar bara att
 * QuoteDocumentRow nu ANVÄNDER dem korrekt, gated på isEdit:
 *
 *   1. Prislös 'item'/'option'-rad i EDIT-läge → pill + row-priceless-klass.
 *   2. Normalt prissatt rad → helt opåverkad (ingen pill, ingen klass).
 *   3. SAMMA prislösa rad i STATIC-läge → fortfarande "0 kr" via
 *      formatCurrency, ALDRIG pillen — kunden får aldrig se "Sätt pris".
 *
 * Ren komponent-rendering via renderToStaticMarkup (samma mönster som
 * lib/quote-templates/render-react.tsx redan använder för att undvika
 * Next 14:s förbud mot modulnivå-import av 'react-dom/server' i
 * app-routern) — inget webbläsarbehov, körs som ren Node-logik precis som
 * tests/quote-document-parity.spec.ts.
 *
 *   npx playwright test tests/quote-document-priceless-pill.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { renderToStaticMarkup as renderToStaticMarkupUntyped } from 'react-dom/server.browser'
import { createElement, type ReactElement } from 'react'
import { QuoteDocumentRow } from '../components/quotes/document/QuoteDocumentRow'
import type { QuoteTemplateItem } from '../lib/quote-templates/types'

const renderToStaticMarkup = renderToStaticMarkupUntyped as unknown as (element: ReactElement) => string

// Tomt (men sant) handlers-objekt räcker för isEdit (mode==='edit' && !!handlers
// && !!item.id) — fieldsEditable (kräver onItemChange) rör inte pill-logiken,
// som bara bryr sig om isEdit.
const editHandlers = {}

function renderRow(item: QuoteTemplateItem, mode: 'static' | 'edit') {
  return renderToStaticMarkup(
    createElement(QuoteDocumentRow, {
      item,
      mode,
      showQty: true,
      showPrice: true,
      colCount: 4,
      handlers: mode === 'edit' ? editHandlers : undefined,
    })
  )
}

const pricelessItem: QuoteTemplateItem = {
  itemType: 'item', id: 'i1', name: 'Håltagning', quantity: 2, unit: 'tim', unitPrice: 0, total: 0,
}

const pricedItem: QuoteTemplateItem = {
  itemType: 'item', id: 'i2', name: 'Rivning', quantity: 8, unit: 'tim', unitPrice: 650, total: 5200,
}

const pricelessOption: QuoteTemplateItem = {
  itemType: 'option', id: 'o1', optionSelected: true, name: 'Golvvärme', quantity: 1, unit: 'st', unitPrice: 0, total: 0,
}

const pricedOption: QuoteTemplateItem = {
  itemType: 'option', id: 'o2', optionSelected: true, name: 'Handdukstork', quantity: 1, unit: 'st', unitPrice: 2200, total: 2200,
}

test.describe('prislös rad — "Sätt pris"-pill (Fas C)', () => {
  // OBS: à-pris-cellen (den redigerbara unitPrice-inputen, oberoende av
  // summa-cellen den här specen gäller) visar helt korrekt "0 kr" som
  // PLAIN TEXT när den inte är fältredigerbar (canEditFields kräver
  // onItemChange, som `editHandlers` medvetet saknar här) — det är INTE
  // regressionen det här provet vaktar mot (se filkommentaren: bara den
  // SISTA cellen, summan, är i scope). Provet slår därför fast exakt hur
  // raden SLUTAR — sista cellen ska vara pillen, aldrig formatCurrency.
  const endsWithPill = (html: string) => html.endsWith('<span class="price-missing-pill">Sätt pris</span></td></tr>')

  test('prislös item-rad i edit-läge visar pillen i summa-cellen, inte "0 kr"', () => {
    const html = renderRow(pricelessItem, 'edit')
    expect(html).toContain('price-missing-pill')
    expect(html).toContain('row-priceless')
    expect(endsWithPill(html), `raden ska SLUTA med pillen (summa-cellen): ${html}`).toBe(true)
  })

  test('prislös option-rad i edit-läge visar pillen i summa-cellen, inte "0 kr"', () => {
    const html = renderRow(pricelessOption, 'edit')
    expect(html).toContain('price-missing-pill')
    expect(html).toContain('row-priceless')
    expect(endsWithPill(html), `raden ska SLUTA med pillen (summa-cellen): ${html}`).toBe(true)
  })

  test('normalt prissatt item-rad är helt opåverkad', () => {
    const html = renderRow(pricedItem, 'edit')
    expect(html).not.toContain('price-missing-pill')
    expect(html).not.toContain('row-priceless')
    expect(html).not.toContain('Sätt pris')
    expect(html).toContain('5 200 kr')
  })

  test('normalt prissatt option-rad är helt opåverkad', () => {
    const html = renderRow(pricedOption, 'edit')
    expect(html).not.toContain('price-missing-pill')
    expect(html).not.toContain('row-priceless')
    expect(html).not.toContain('Sätt pris')
    expect(html).toContain('2 200 kr')
  })

  test('SAMMA prislösa item-rad i static-läge visar fortfarande "0 kr" i summa-cellen — pillen läcker ALDRIG till kunden', () => {
    const html = renderRow(pricelessItem, 'static')
    expect(html).not.toContain('price-missing-pill')
    expect(html).not.toContain('row-priceless')
    expect(html).not.toContain('Sätt pris')
    expect(html.endsWith('0 kr</td></tr>'), `raden ska sluta med formatCurrency("0 kr"), aldrig pillen: ${html}`).toBe(true)
  })

  test('SAMMA prislösa option-rad i static-läge visar fortfarande "0 kr" i summa-cellen — pillen läcker ALDRIG till kunden', () => {
    const html = renderRow(pricelessOption, 'static')
    expect(html).not.toContain('price-missing-pill')
    expect(html).not.toContain('row-priceless')
    expect(html).not.toContain('Sätt pris')
    expect(html.endsWith('0 kr</td></tr>'), `raden ska sluta med formatCurrency("0 kr"), aldrig pillen: ${html}`).toBe(true)
  })

  test('discount-rader rörs inte — "0 kr" på en rabattrad är normalt, inte "prislöst"', () => {
    const zeroDiscount: QuoteTemplateItem = {
      itemType: 'discount', id: 'd1', name: 'Rabatt', quantity: 1, unit: 'st', unitPrice: 0, total: 0,
    }
    const html = renderRow(zeroDiscount, 'edit')
    expect(html).not.toContain('price-missing-pill')
    expect(html).not.toContain('row-priceless')
  })
})
