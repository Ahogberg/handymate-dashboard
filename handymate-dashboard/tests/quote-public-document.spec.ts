/**
 * Facit-test — ETAPP 5 (offert-masterplan.md): ren logik för kundvyns
 * dokumentdata (lib/quotes/public-document.ts). Testar option-state→
 * templateData-mappningen (applyLiveSelectionToTemplateData) och
 * displayLevel-saneringen (sanitizeTemplateDataForPublic) utan att rendera
 * React eller nätverksanropa.
 *
 * Körs: npx playwright test tests/quote-public-document.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { applyLiveSelectionToTemplateData, sanitizeTemplateDataForPublic } from '../lib/quotes/public-document'
import type { QuoteTemplateData, QuoteTemplateItem } from '../lib/quote-templates/types'
import type { QuoteTotals } from '../lib/types/quote'

function baseData(items: QuoteTemplateItem[], displayLevel: QuoteTemplateData['displayLevel'] = 'full'): QuoteTemplateData {
  return {
    isSigned: false,
    signatureCta: 'active',
    business: {
      name: 'Bygg & Co AB', orgNumber: '556677-8899', address: '', contactName: '', phone: '', email: '',
      fSkatt: true, accentColor: '#0F766E',
    },
    customer: { name: 'Kalle Kund' },
    quote: {
      number: 'OF-1', issuedDate: '1 jan 2026', validUntilDate: '1 feb 2026', title: 'Badrum',
      items, subtotalExVat: 1000, vatAmount: 250, totalIncVat: 1250, amountToPay: 1250, paymentTerms: '',
    },
    displayLevel,
    showQuantities: displayLevel === 'full',
    showUnitPrices: displayLevel === 'full',
  }
}

function totals(overrides: Partial<QuoteTotals> = {}): QuoteTotals {
  return {
    laborTotal: 0, materialTotal: 0, serviceTotal: 0, subtotal: 1000, discountAmount: 0, afterDiscount: 1000,
    vat: 250, total: 1250, rotWorkCost: 0, rotDeduction: 0, rotCustomerPays: 0, rutWorkCost: 0, rutDeduction: 0,
    rutCustomerPays: 0, gronBase: 0, gronDeduction: 0, gronCustomerPays: 0, totalDeduction: 0,
    customerPaysAfterDeductions: 1250,
    ...overrides,
  }
}

test.describe('applyLiveSelectionToTemplateData', () => {
  test('kryssar i ett tillval → optionSelected sätts true för det id:t, andra rörs ej', () => {
    const items: QuoteTemplateItem[] = [
      { itemType: 'item', id: 'i1', name: 'Rivning', quantity: 1, unit: 'st', unitPrice: 1000, total: 1000 },
      { itemType: 'option', id: 'o1', optionSelected: false, name: 'Golvvärme', quantity: 1, unit: 'st', unitPrice: 8000, total: 8000 },
      { itemType: 'option', id: 'o2', optionSelected: true, name: 'Handdukstork', quantity: 1, unit: 'st', unitPrice: 2200, total: 2200 },
    ]
    const data = baseData(items)
    const result = applyLiveSelectionToTemplateData(data, new Set(['o1']), totals())

    const byId = Object.fromEntries(result.quote.items.map(i => [i.id, i]))
    expect(byId.o1.optionSelected).toBe(true)
    expect(byId.o2.optionSelected).toBe(false) // ej i valda-setet → avbockad
    expect(byId.i1.optionSelected).toBeUndefined() // vanlig rad orörd
  })

  test('rader utan id (rubrik/text/delsumma) lämnas helt orörda', () => {
    const items: QuoteTemplateItem[] = [
      { itemType: 'heading', name: 'Badrum', quantity: 0, unit: '', unitPrice: 0, total: 0 },
      { itemType: 'subtotal', name: 'Delsumma', quantity: 0, unit: '', unitPrice: 0, total: 5000 },
    ]
    const data = baseData(items)
    const result = applyLiveSelectionToTemplateData(data, new Set(), totals())
    expect(result.quote.items).toEqual(items)
  })

  test('summeringsfälten speglar live-totalen (inte de gamla statiska värdena)', () => {
    const data = baseData([])
    const t = totals({ subtotal: 2000, vat: 500, total: 2500, rotDeduction: 300, customerPaysAfterDeductions: 2200 })
    const result = applyLiveSelectionToTemplateData(data, new Set(), t)
    expect(result.quote.subtotalExVat).toBe(2000)
    expect(result.quote.vatAmount).toBe(500)
    expect(result.quote.totalIncVat).toBe(2500)
    expect(result.quote.rotDeduction).toBe(300)
    expect(result.quote.amountToPay).toBe(2200)
  })

  test('0-avdrag → rotDeduction/rutDeduction/gronDeduction blir undefined (döljer raden i dokumentet)', () => {
    const data = baseData([])
    const result = applyLiveSelectionToTemplateData(data, new Set(), totals())
    expect(result.quote.rotDeduction).toBeUndefined()
    expect(result.quote.rutDeduction).toBeUndefined()
    expect(result.quote.gronDeduction).toBeUndefined()
  })

  test('input-objektet muteras aldrig (ren funktion)', () => {
    const items: QuoteTemplateItem[] = [
      { itemType: 'option', id: 'o1', optionSelected: false, name: 'Golvvärme', quantity: 1, unit: 'st', unitPrice: 8000, total: 8000 },
    ]
    const data = baseData(items)
    applyLiveSelectionToTemplateData(data, new Set(['o1']), totals())
    expect(data.quote.items[0].optionSelected).toBe(false)
  })
})

test.describe('sanitizeTemplateDataForPublic', () => {
  test('personnummer tas bort ur publik template-data utan att mutera input', () => {
    const data = baseData([], 'full')
    data.customer.personnummer = '198001011234'
    const result = sanitizeTemplateDataForPublic(data)
    expect(result.customer.personnummer).toBeNull()
    expect(data.customer.personnummer).toBe('198001011234')
  })

  test("displayLevel 'full' — items lämnas helt orörda", () => {
    const items: QuoteTemplateItem[] = [
      { itemType: 'item', id: 'i1', name: 'Kakel', quantity: 12, unit: 'm2', unitPrice: 450, total: 5400 },
    ]
    const data = baseData(items, 'full')
    expect(sanitizeTemplateDataForPublic(data)).toBe(data) // no-op, samma referens
  })

  test("displayLevel 'rows' — quantity/unitPrice nollställs på icke-tillvalsrader, totalen behålls", () => {
    const items: QuoteTemplateItem[] = [
      { itemType: 'item', id: 'i1', name: 'Kakel', quantity: 12, unit: 'm2', unitPrice: 450, total: 5400 },
      { itemType: 'option', id: 'o1', optionSelected: true, name: 'Golvvärme', quantity: 1, unit: 'st', unitPrice: 8000, total: 8000 },
    ]
    const data = baseData(items, 'rows')
    const result = sanitizeTemplateDataForPublic(data)
    const byId = Object.fromEntries(result.quote.items.map(i => [i.id, i]))
    expect(byId.i1.quantity).toBe(0)
    expect(byId.i1.unitPrice).toBe(0)
    expect(byId.i1.total).toBe(5400) // radtotal ska INTE strippas
    // Tillvalsrader behåller fulla fält — kunden behöver priset för att välja.
    expect(byId.o1.quantity).toBe(1)
    expect(byId.o1.unitPrice).toBe(8000)
  })

  test("displayLevel 'rows' — input-objektet muteras aldrig", () => {
    const items: QuoteTemplateItem[] = [
      { itemType: 'item', id: 'i1', name: 'Kakel', quantity: 12, unit: 'm2', unitPrice: 450, total: 5400 },
    ]
    const data = baseData(items, 'rows')
    sanitizeTemplateDataForPublic(data)
    expect(data.quote.items[0].quantity).toBe(12)
    expect(data.quote.items[0].unitPrice).toBe(450)
  })
})
