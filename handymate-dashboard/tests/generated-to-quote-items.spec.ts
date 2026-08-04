/**
 * Godkännande-kedjan (2026-08-04, "kritisk söm"-fixen) — facit-tester för
 * lib/quotes/generated-to-quote-items.ts: mappningen från ai-generate-svarets
 * GeneratedQuoteItem[] (lib/ai-quote-generator.ts) till strukturerade
 * QuoteItem[] enligt POST /api/quotes-kontraktet.
 *
 * Samma mönster som tests/rot-rut-flagging.spec.ts / tests/ai-option-mapping.spec.ts
 * — ren funktion, ingen I/O, inget nätverk.
 *
 * Körs: npx playwright test tests/generated-to-quote-items.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  normalizeUnit,
  mapGeneratedItemToQuoteItem,
  generatedQuoteToQuoteItems,
  type GeneratedQuoteItemInput,
} from '../lib/quotes/generated-to-quote-items'
import { getItemRotRutType } from '../lib/quote-calculations'

function laborItem(over: Partial<GeneratedQuoteItemInput> = {}): GeneratedQuoteItemInput {
  return {
    description: 'Rivning golv',
    quantity: 4,
    unit: 'tim',
    unitPrice: 650,
    type: 'labor',
    ...over,
  }
}

test.describe('normalizeUnit — samma enhetsmappning som convertLegacyItems', () => {
  test('hour/timmar/h → tim', () => {
    expect(normalizeUnit('hour')).toBe('tim')
    expect(normalizeUnit('timmar')).toBe('tim')
    expect(normalizeUnit('h')).toBe('tim')
    expect(normalizeUnit('H')).toBe('tim')
  })

  test('piece/styck → st', () => {
    expect(normalizeUnit('piece')).toBe('st')
    expect(normalizeUnit('styck')).toBe('st')
  })

  test('okänd enhet lämnas orörd', () => {
    expect(normalizeUnit('m2')).toBe('m2')
  })

  test('null/undefined/tom → st (default)', () => {
    expect(normalizeUnit(null)).toBe('st')
    expect(normalizeUnit(undefined)).toBe('st')
    expect(normalizeUnit('')).toBe('st')
  })
})

test.describe('mapGeneratedItemToQuoteItem — ROT/RUT-flaggning per rad', () => {
  test('labor-rad + suggestedDeductionType "rot" → ROT-flaggad', () => {
    const row = mapGeneratedItemToQuoteItem(laborItem(), 'rot', 'item', 0)
    expect(getItemRotRutType(row)).toBe('rot')
    expect(row.is_rot_eligible).toBe(true)
    expect(row.is_rut_eligible).toBe(false)
  })

  test('labor-rad + suggestedDeductionType "rut" → RUT-flaggad', () => {
    const row = mapGeneratedItemToQuoteItem(laborItem(), 'rut', 'item', 0)
    expect(getItemRotRutType(row)).toBe('rut')
    expect(row.is_rut_eligible).toBe(true)
    expect(row.is_rot_eligible).toBe(false)
  })

  test('suggestedDeductionType "none" → ingen avdragstyp, även på labor-rad', () => {
    const row = mapGeneratedItemToQuoteItem(laborItem(), 'none', 'item', 0)
    expect(getItemRotRutType(row)).toBeNull()
    expect(row.is_rot_eligible).toBe(false)
    expect(row.is_rut_eligible).toBe(false)
  })

  test('material-rad blir ALDRIG ROT/RUT-berättigad, oavsett suggestedDeductionType', () => {
    const row = mapGeneratedItemToQuoteItem(
      laborItem({ type: 'material', unit: 'st' }),
      'rot',
      'item',
      0,
    )
    expect(getItemRotRutType(row)).toBeNull()
  })

  test('service-rad blir aldrig ROT/RUT-berättigad', () => {
    const row = mapGeneratedItemToQuoteItem(laborItem({ type: 'service' }), 'rut', 'item', 0)
    expect(getItemRotRutType(row)).toBeNull()
  })

  test('fält, enhet och total mappas korrekt', () => {
    const row = mapGeneratedItemToQuoteItem(
      laborItem({ description: 'Riva kakel', quantity: 3, unit: 'hour', unitPrice: 500 }),
      'rot',
      'item',
      2,
    )
    expect(row.description).toBe('Riva kakel')
    expect(row.quantity).toBe(3)
    expect(row.unit).toBe('tim')
    expect(row.unit_price).toBe(500)
    expect(row.total).toBe(1500)
    expect(row.sort_order).toBe(2)
    expect(row.item_type).toBe('item')
  })

  test('description saknas → faller tillbaka på name', () => {
    const row = mapGeneratedItemToQuoteItem(
      { name: 'Från name-fältet', quantity: 1, unit: 'st', unitPrice: 100, type: 'material' } as GeneratedQuoteItemInput,
      'none',
      'item',
      0,
    )
    expect(row.description).toBe('Från name-fältet')
  })

  test('unitPrice saknas → faller tillbaka på unit_price (snake_case)', () => {
    const row = mapGeneratedItemToQuoteItem(
      { description: 'X', quantity: 2, unit: 'st', unit_price: 250, type: 'material' } as GeneratedQuoteItemInput,
      'none',
      'item',
      0,
    )
    expect(row.unit_price).toBe(250)
    expect(row.total).toBe(500)
  })

  test('itemType "option" → option_selected/option_default false (aldrig förvalt)', () => {
    const row = mapGeneratedItemToQuoteItem(laborItem(), 'rot', 'option', 0)
    expect(row.item_type).toBe('option')
    expect(row.option_selected).toBe(false)
    expect(row.option_default).toBe(false)
    // Fortfarande ROT-flaggad — option-status och ROT/RUT är oberoende.
    expect(getItemRotRutType(row)).toBe('rot')
  })
})

test.describe('generatedQuoteToQuoteItems — helt GeneratedQuote-svar → QuoteItem[]', () => {
  test('items + options kombineras, options efter items med löpande sort_order', () => {
    const items: GeneratedQuoteItemInput[] = [
      laborItem({ description: 'Grundarbete' }),
      laborItem({ description: 'Material', type: 'material', unit: 'st', unitPrice: 300 }),
    ]
    const options: GeneratedQuoteItemInput[] = [
      laborItem({ description: 'Tillval målning', type: 'service' }),
    ]
    const result = generatedQuoteToQuoteItems(items, options, 'rot')
    expect(result).toHaveLength(3)
    expect(result[0].item_type).toBe('item')
    expect(result[1].item_type).toBe('item')
    expect(result[2].item_type).toBe('option')
    expect(result[0].sort_order).toBe(0)
    expect(result[1].sort_order).toBe(1)
    expect(result[2].sort_order).toBe(2)
    expect(result[2].option_selected).toBe(false)
  })

  test('tom items + tom options → tom array', () => {
    expect(generatedQuoteToQuoteItems([], [], 'none')).toEqual([])
  })

  test('null/undefined items/options → tom array (ingen krasch)', () => {
    expect(generatedQuoteToQuoteItems(null, undefined, 'none')).toEqual([])
  })

  test('bara items, inga options', () => {
    const result = generatedQuoteToQuoteItems([laborItem()], [], 'rut')
    expect(result).toHaveLength(1)
    expect(getItemRotRutType(result[0])).toBe('rut')
  })
})
