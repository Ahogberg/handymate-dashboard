/**
 * Facit för kundportalens LIVE-totalsumma (2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `calculatePublicQuoteTotals`/`calculatePublicQuoteTotalsFromBase`
 * (lib/quote-calculations.ts) är en PARALLELL kodväg till den interna
 * `calculateQuoteTotals` — kundportalen och signeringsmodalen räknar
 * beloppet kunden ser via dessa, inte via motorn editorn/servern
 * använder. Exakt den buggklassen `tests/quote-preview-summary.spec.ts`
 * redan dokumenterar (B4: "kortet visade rader från en generering och
 * godkännandet sparade en annan"), fast på kundsidan denna gång — om de
 * två vägarna nånsin ger olika svar ser kunden fel summa på det enda
 * ställe där beloppet ÄR beslutet.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-public-live-total.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  calculateQuoteTotals,
  calculatePublicQuoteTotals,
  calculatePublicQuoteTotalsFromBase,
  type PublicStructuredItem,
} from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'qi_1',
    item_type: 'item',
    description: 'Rad',
    quantity: 1,
    unit: 'st',
    unit_price: 0,
    total: 0,
    is_rot_eligible: false,
    is_rut_eligible: false,
    sort_order: 0,
    ...overrides,
  }
}

function toPublic(it: QuoteItem): PublicStructuredItem {
  return {
    id: it.id,
    item_type: it.item_type,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    total: it.total,
    sort_order: it.sort_order,
    is_rot_eligible: it.is_rot_eligible,
    is_rut_eligible: it.is_rut_eligible,
    rot_rut_type: it.rot_rut_type,
    option_selected: it.option_selected,
    option_default: it.option_default,
    labor_amount: it.labor_amount,
    material_amount: it.material_amount,
  }
}

test.describe('calculatePublicQuoteTotals — måste matcha calculateQuoteTotals på samma rader', () => {
  test('en enkel ROT-rad ger identisk QuoteTotals via båda vägarna', () => {
    const items = [item({ id: 'a', quantity: 10, unit: 'tim', unit_price: 800, rot_rut_type: 'rot' })]
    const facit = calculateQuoteTotals(items)
    const publikt = calculatePublicQuoteTotals(items.map(toPublic), new Set())
    expect(publikt).toEqual(facit)
  })

  test('bockat tillval räknas med, obockat rörs aldrig', () => {
    const base = item({ id: 'a', quantity: 1, unit: 'st', unit_price: 10000 })
    const optionOn = item({ id: 'opt-on', item_type: 'option', quantity: 1, unit: 'st', unit_price: 5000 })
    const optionOff = item({ id: 'opt-off', item_type: 'option', quantity: 1, unit: 'st', unit_price: 3000 })

    // Facit: samma rader, men option_selected redan satt manuellt.
    const facitItems = [base, { ...optionOn, option_selected: true }, { ...optionOff, option_selected: false }]
    const facit = calculateQuoteTotals(facitItems)

    // Publikt: option_selected kommer via selectedOptionIds, inte fältet på raden.
    const publikt = calculatePublicQuoteTotals(
      [toPublic(base), toPublic(optionOn), toPublic(optionOff)],
      new Set(['opt-on']),
    )
    expect(publikt).toEqual(facit)
    expect(publikt.subtotal).toBe(15000) // bas 10000 + bockat tillval 5000, INTE det obockade
  })

  test('legacy-rad utan rot_rut_type men med is_rot_eligible=true faller tillbaka korrekt', () => {
    const legacy: QuoteItem = item({
      id: 'a',
      quantity: 10,
      unit: 'tim',
      unit_price: 500,
      is_rot_eligible: true,
      rot_rut_type: undefined,
    })
    const facit = calculateQuoteTotals([legacy])
    const publikt = calculatePublicQuoteTotals(
      [{ ...toPublic(legacy), rot_rut_type: undefined }],
      new Set(),
    )
    expect(publikt).toEqual(facit)
    expect(publikt.rotWorkCost).toBe(5000) // hela radtotalen, inte 0
  })

  test('labor_amount: 0 ger ROT-bas 0, inte hela radtotalen (?? inte ||)', () => {
    const items = [item({ id: 'a', quantity: 1, unit: 'tim', unit_price: 10000, rot_rut_type: 'rot', labor_amount: 0 })]
    const facit = calculateQuoteTotals(items)
    const publikt = calculatePublicQuoteTotals(items.map(toPublic), new Set())
    expect(publikt).toEqual(facit)
    expect(facit.rotWorkCost).toBe(0)
  })

  test('rabatt (procent + rabattrad) påverkar bas och moms konsekvent i båda vägarna', () => {
    const items = [
      item({ id: 'a', quantity: 1, unit: 'st', unit_price: 10000 }),
      item({ id: 'b', item_type: 'discount', description: 'Rabatt', quantity: 1, unit: 'st', unit_price: 500, total: -500 }),
    ]
    const facit = calculateQuoteTotals(items, 10)
    const publikt = calculatePublicQuoteTotals(items.map(toPublic), new Set(), 10)
    expect(publikt).toEqual(facit)
  })

  test('tom radlista ger nollor i båda vägarna, ingen krasch', () => {
    const facit = calculateQuoteTotals([])
    const publikt = calculatePublicQuoteTotals([], new Set())
    expect(publikt).toEqual(facit)
    expect(publikt.total).toBe(0)
  })

  test('grön teknik-tak (50 000 kr) appliceras identiskt i båda vägarna', () => {
    const items = [item({ id: 'a', quantity: 1, unit: 'st', unit_price: 500000, rot_rut_type: 'gron_solceller' })]
    const facit = calculateQuoteTotals(items)
    const publikt = calculatePublicQuoteTotals(items.map(toPublic), new Set())
    expect(publikt).toEqual(facit)
    expect(facit.gronDeduction).toBeLessThanOrEqual(50000)
  })
})

test.describe('calculatePublicQuoteTotalsFromBase — kombinerad bas + tillval matchar en fullständig omräkning', () => {
  test('bas + ett bockat ROT-tillval ger samma slutsumma som att räkna om hela listan', () => {
    const baseItem = item({ id: 'a', quantity: 1, unit: 'st', unit_price: 20000 })
    const option = item({ id: 'opt', item_type: 'option', quantity: 1, unit: 'tim', unit_price: 4000, rot_rut_type: 'rot' })

    // Väg 1: allt i en enda calculateQuoteTotals-körning.
    const facit = calculateQuoteTotals([baseItem, { ...option, option_selected: true }])

    // Väg 2: bas räknas separat, tillvalet läggs på ovanpå via FromBase.
    const baseTotals = calculateQuoteTotals([baseItem])
    const combined = calculatePublicQuoteTotalsFromBase(baseTotals, [toPublic(option)], new Set(['opt']))

    expect(combined).toEqual(facit)
  })

  test('ett obockat tillval påverkar aldrig den kombinerade summan', () => {
    const baseItem = item({ id: 'a', quantity: 1, unit: 'st', unit_price: 20000 })
    const option = item({ id: 'opt', item_type: 'option', quantity: 1, unit: 'st', unit_price: 9999 })
    const baseTotals = calculateQuoteTotals([baseItem])

    const withoutOption = calculatePublicQuoteTotalsFromBase(baseTotals, [toPublic(option)], new Set())
    expect(withoutOption).toEqual(baseTotals)
  })

  test('grön teknik-tillval höjer avdraget ovanpå basens redan färdiga avdrag, taket gäller EN gång', () => {
    const baseItem = item({ id: 'a', quantity: 1, unit: 'st', unit_price: 200000, rot_rut_type: 'gron_solceller' })
    const option = item({ id: 'opt', item_type: 'option', quantity: 1, unit: 'st', unit_price: 200000, rot_rut_type: 'gron_solceller' })

    const facit = calculateQuoteTotals([baseItem, { ...option, option_selected: true }])
    const baseTotals = calculateQuoteTotals([baseItem])
    const combined = calculatePublicQuoteTotalsFromBase(baseTotals, [toPublic(option)], new Set(['opt']))

    expect(combined.gronDeduction).toBe(facit.gronDeduction)
    expect(combined.gronDeduction).toBeLessThanOrEqual(50000) // taket, inte 2×15% av båda raderna var för sig
    expect(combined).toEqual(facit)
  })
})
