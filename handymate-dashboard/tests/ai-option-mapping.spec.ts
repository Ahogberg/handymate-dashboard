/**
 * B5 (kodrevision 2026-08-03, F2) — facit-tester för applyOptionRowDefaults,
 * den rena kärnan i convertLegacyItems' 'option'-mappning
 * (app/dashboard/quotes/new/page.tsx): AI-föreslagna tillval (quote.options)
 * mappas till item_type 'option' med option_selected/option_default false.
 *
 * convertLegacyItems självt är inte exporterat (page.tsx-lokal, 'use client'-
 * sida — App Router tillåter inga extra named exports från en page.tsx) och
 * beror på generateItemId()/normalizeUnit(), så det är inte rent nog att
 * unittesta direkt. applyOptionRowDefaults + setItemRotRut + legacyItemRotRutType
 * (redan testad i rot-rut-flagging.spec.ts) är den faktiska produktionskoden
 * convertLegacyItems anropar för att bygga en option-rad — samma mönster som
 * rot-rut-flagging.spec.ts.
 *
 * Körs: npx playwright test tests/ai-option-mapping.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  applyOptionRowDefaults,
  setItemRotRut,
  legacyItemRotRutType,
} from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function baseItem(over: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 500, total: 500, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

test.describe('applyOptionRowDefaults — tillvalsradens default-fält', () => {
  test('item_type "option" → option_selected false, option_default false', () => {
    const row = applyOptionRowDefaults(baseItem({ item_type: 'option' }))
    expect(row.item_type).toBe('option')
    expect(row.option_selected).toBe(false)
    expect(row.option_default).toBe(false)
  })

  test('item_type "item" (grundrad) → orörd, inga option-fält tillagda', () => {
    const row = applyOptionRowDefaults(baseItem({ item_type: 'item' }))
    expect(row.option_selected).toBeUndefined()
    expect(row.option_default).toBeUndefined()
  })

  test('övriga item_type (heading/text/subtotal/discount) → no-op', () => {
    for (const t of ['heading', 'text', 'subtotal', 'discount'] as const) {
      const row = applyOptionRowDefaults(baseItem({ item_type: t }))
      expect(row.option_selected).toBeUndefined()
      expect(row.option_default).toBeUndefined()
    }
  })

  test('kombinerat med setItemRotRut+legacyItemRotRutType (convertLegacyItems-vägen): ' +
    'ett AI-föreslaget ROT-tillval blir item_type "option" + ROT-flaggat + avbockat', () => {
    const rotType = legacyItemRotRutType('labor', 'rot')
    const row = applyOptionRowDefaults(
      setItemRotRut(baseItem({ item_type: 'option', unit: 'tim' }), rotType),
    )
    expect(row.item_type).toBe('option')
    expect(row.is_rot_eligible).toBe(true)
    expect(row.is_rut_eligible).toBe(false)
    expect(row.option_selected).toBe(false)
    expect(row.option_default).toBe(false)
  })

  test('kombinerat: ett AI-föreslaget materialtillval får ALDRIG ROT, ' +
    'oavsett suggestedDeductionType', () => {
    const rotType = legacyItemRotRutType('material', 'rot')
    const row = applyOptionRowDefaults(
      setItemRotRut(baseItem({ item_type: 'option' }), rotType),
    )
    expect(row.is_rot_eligible).toBe(false)
    expect(row.is_rut_eligible).toBe(false)
    expect(row.option_selected).toBe(false)
    expect(row.option_default).toBe(false)
  })
})
