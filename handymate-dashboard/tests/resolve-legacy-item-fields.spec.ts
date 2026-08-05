/**
 * Fas 0.2, fix 2 (plan: vad-kan-vi-kopiera-snug-phoenix.md) — facit-tester för
 * resolveLegacyItemFields (lib/quote-calculations.ts).
 *
 * Bakgrund: convertLegacyItems (app/dashboard/quotes/new/page.tsx +
 * app/dashboard/quotes/[id]/edit/page.tsx) läste tidigare BARA
 * item.name/item.unit_price. ai-generate (lib/ai-quote-generator.ts,
 * GeneratedQuoteItem) skickar description/unitPrice — inte name/unit_price
 * — så unit_price blev `undefined` för AI-genererade rader och
 * total = quantity * undefined = NaN, maskerat av `quote: any`-typningen på
 * anropssidan (app/dashboard/quotes/new/page.tsx applyAiResult).
 *
 * convertLegacyItems självt är inte exporterat (page.tsx-lokal, 'use client'
 * -sida — App Router tillåter inga extra named exports från en page.tsx, se
 * tests/ai-option-mapping.spec.ts) — resolveLegacyItemFields är den rena,
 * delade fält-mappningen båda kopiorna av convertLegacyItems nu anropar,
 * och den ÄR facit-testbar direkt.
 *
 * Körs: npx playwright test tests/resolve-legacy-item-fields.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { resolveLegacyItemFields } from '../lib/quote-calculations'

test.describe('resolveLegacyItemFields — description/unitPrice primärt (ai-generate-formen)', () => {
  test('description + unitPrice satta → används direkt, ingen NaN', () => {
    const result = resolveLegacyItemFields({
      description: 'Rivning golv',
      quantity: 4,
      unitPrice: 650,
    })
    expect(result).toEqual({ description: 'Rivning golv', quantity: 4, unitPrice: 650 })
  })

  test('BÅDA fältformerna satta samtidigt → description/unitPrice vinner (ai-generate-formen primär)', () => {
    const result = resolveLegacyItemFields({
      description: 'AI-beskrivning',
      name: 'Mall-namn',
      quantity: 2,
      unitPrice: 700,
      unit_price: 999,
    })
    expect(result.description).toBe('AI-beskrivning')
    expect(result.unitPrice).toBe(700)
  })
})

test.describe('resolveLegacyItemFields — name/unit_price fallback (mall-formen)', () => {
  test('bara name + unit_price satta (ingen description/unitPrice) → fallback används', () => {
    const result = resolveLegacyItemFields({
      name: 'Materialpost',
      quantity: 3,
      unit_price: 500,
    })
    expect(result).toEqual({ description: 'Materialpost', quantity: 3, unitPrice: 500 })
  })
})

test.describe('resolveLegacyItemFields — tomma/saknade fält, NaN får ALDRIG uppstå', () => {
  test('helt tomt objekt → 0-värden, tom beskrivning, ingen NaN', () => {
    const result = resolveLegacyItemFields({})
    expect(result).toEqual({ description: '', quantity: 0, unitPrice: 0 })
    expect(Number.isNaN(result.quantity)).toBe(false)
    expect(Number.isNaN(result.unitPrice)).toBe(false)
  })

  test('unitPrice och unit_price båda undefined → 0, inte NaN', () => {
    const result = resolveLegacyItemFields({ description: 'Rad utan pris', quantity: 1 })
    expect(result.unitPrice).toBe(0)
    expect(Number.isNaN(result.unitPrice)).toBe(false)
  })

  test('quantity undefined → 0, inte NaN, så total (quantity*unitPrice) blir 0 inte NaN', () => {
    const result = resolveLegacyItemFields({ description: 'Rad', unitPrice: 500 })
    expect(result.quantity).toBe(0)
    const total = result.quantity * result.unitPrice
    expect(total).toBe(0)
    expect(Number.isNaN(total)).toBe(false)
  })

  test('unitPrice explicit 0 (genuint gratis rad, t.ex. "Framkörning ingår") → 0 bevaras, faller INTE tillbaka på unit_price', () => {
    const result = resolveLegacyItemFields({ description: 'Framkörning ingår', quantity: 1, unitPrice: 0, unit_price: 495 })
    expect(result.unitPrice).toBe(0)
  })

  test('varken description eller name → tom sträng, ingen krasch', () => {
    const result = resolveLegacyItemFields({ quantity: 1, unitPrice: 100 })
    expect(result.description).toBe('')
  })
})
