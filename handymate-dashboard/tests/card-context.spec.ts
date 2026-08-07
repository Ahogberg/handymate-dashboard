/**
 * Facit för godkännandekortets kontextrad (2026-08-07).
 *
 * Piloten fick "Kunden har en fråga om offerten" utan att veta vilken kund
 * eller vilken offert — mottagaren visades bara när kortet SAKNADE
 * beskrivning, och ett kort med en riktig fråga tappade därför kunden helt.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/card-context.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { cardContext } from '../lib/jarvis/card-context'

test.describe('KUNDEN SKA ALLTID SYNAS', () => {
  test('kundnamnet kommer med', () => {
    expect(cardContext({ customer_name: 'Anna Sundin' })).toBe('Anna Sundin')
  })

  test('kund och offert tillsammans', () => {
    expect(cardContext({ customer_name: 'Anna Sundin', quote_title: 'Badrum' }))
      .toBe('Anna Sundin · "Badrum"')
  })

  test('projekt går före offert när båda finns', () => {
    // Projektet är det konkreta jobbet; offerten är hur det såldes.
    expect(cardContext({ customer_name: 'Anna', project_name: 'Bromsvägen 12', quote_title: 'Badrum' }))
      .toBe('Anna · Bromsvägen 12')
  })

  test('fakturanumret är hur en pengapost känns igen', () => {
    expect(cardContext({ customer_name: 'BRF Eken', invoice_number: '1042' }))
      .toBe('BRF Eken · Faktura 1042')
  })

  test('lead_review lägger namnet under parsed', () => {
    expect(cardContext({ parsed: { name: 'Johan' } })).toBe('Johan')
  })
})

test.describe('"Kunden" ÄR INTE ETT NAMN', () => {
  test('fallback-strängen filtreras bort', () => {
    // 'Kunden' sätts när kunduppslaget misslyckats
    // (lib/portal/customer-thread.ts:92). Att visa den hade sett ut som ett
    // namn, och hantverkaren hade trott att uppgiften fanns.
    expect(cardContext({ customer_name: 'Kunden' })).toBe('')
  })

  test('men offerten visas ändå när namnet är okänt', () => {
    expect(cardContext({ customer_name: 'Kunden', quote_title: 'Leklåda' })).toBe('"Leklåda"')
  })

  test('en kund som verkligen heter något med Kunden i påverkas inte', () => {
    expect(cardContext({ customer_name: 'Kundens Bygg AB' })).toBe('Kundens Bygg AB')
  })
})

test.describe('raden blir aldrig skräp', () => {
  test('tom payload ger tom sträng, inte separatorer', () => {
    for (const p of [null, undefined, {}, { customer_name: '' }, { customer_name: '   ' }]) {
      expect(cardContext(p as never), JSON.stringify(p)).toBe('')
    }
  })

  test('inga hängande separatorer när bara en del finns', () => {
    const ut = cardContext({ quote_title: 'Badrum' })
    expect(ut).toBe('"Badrum"')
    expect(ut.startsWith('·')).toBe(false)
    expect(ut.endsWith('·')).toBe(false)
  })

  test('blanksteg trimmas', () => {
    expect(cardContext({ customer_name: '  Anna  ', quote_title: ' Badrum ' }))
      .toBe('Anna · "Badrum"')
  })

  test('okända fält ignoreras utan att krascha', () => {
    expect(cardContext({ nagot_helt_annat: 42, customer_name: 'Anna' })).toBe('Anna')
  })
})
