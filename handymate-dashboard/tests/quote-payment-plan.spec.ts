/**
 * Facit för offertens delsummor + betalplan (2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `calculateSubtotal` styr vilken delsumma-rad som visas mellan
 * sektionsrubriker i offerteditorn — fel gräns läser som en felräknad
 * offert. `calculatePaymentPlan`/`validatePaymentPlan` styr hur mycket
 * kunden ska betala vid varje betalningstillfälle — fel här är pengar
 * som hamnar fel, inte bara en visningsbugg.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-payment-plan.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { calculateSubtotal, calculatePaymentPlan, validatePaymentPlan } from '../lib/quote-calculations'
import type { QuoteItem, PaymentPlanEntry } from '../lib/types/quote'

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'qi',
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

function plan(percent: number, label = 'Delbetalning'): PaymentPlanEntry {
  return { label, percent, amount: 0, due_description: '' }
}

test.describe('calculateSubtotal — bara raderna i SAMMA sektion', () => {
  test('summerar rader tillbaka till närmast föregående rubrik/delsumma, inte hela listan', () => {
    const items = [
      item({ item_type: 'heading', description: 'Sektion A' }),
      item({ quantity: 2, unit_price: 1000 }), // 2000
      item({ quantity: 1, unit_price: 500 }), // 500
      item({ item_type: 'subtotal' }), // index 3 — ska bli 2500
    ]
    expect(calculateSubtotal(items, 3)).toBe(2500)
  })

  test('en rabattrad inom sektionen dras av delsumman', () => {
    const items = [
      item({ item_type: 'heading', description: 'Sektion A' }),
      item({ quantity: 1, unit_price: 10000 }),
      item({ item_type: 'discount', total: -1000 }),
      item({ item_type: 'subtotal' }),
    ]
    expect(calculateSubtotal(items, 3)).toBe(9000)
  })

  test('en andra delsumma längre upp stoppar summeringen där, inte vid listans start', () => {
    const items = [
      item({ quantity: 1, unit_price: 99999 }), // ska ALDRIG räknas med — ligger ovanför gränsen
      item({ item_type: 'subtotal' }), // index 1 — första sektionens egen delsumma
      item({ quantity: 1, unit_price: 100 }),
      item({ item_type: 'subtotal' }), // index 3 — ska bara bli 100
    ]
    expect(calculateSubtotal(items, 3)).toBe(100)
  })

  test('index som inte pekar på en delsummerad rad ger 0, inte fel rads summa', () => {
    const items = [item({ quantity: 1, unit_price: 500 }), item({ item_type: 'subtotal' })]
    expect(calculateSubtotal(items, 0)).toBe(0) // index 0 är en 'item', inte 'subtotal'
  })
})

test.describe('calculatePaymentPlan — procent till kronor', () => {
  test('varje post får sin andel av totalen i kronor', () => {
    const result = calculatePaymentPlan(100000, [plan(50, 'Vid start'), plan(50, 'Vid slut')])
    expect(result[0].amount).toBe(50000)
    expect(result[1].amount).toBe(50000)
  })

  test('0 %-post ger 0 kr, inte NaN', () => {
    const result = calculatePaymentPlan(50000, [plan(0)])
    expect(result[0].amount).toBe(0)
  })

  test('tom plan ger tom lista', () => {
    expect(calculatePaymentPlan(10000, [])).toEqual([])
  })

  test('FYND (dokumenterat, inte fixat): en äkta tredelning (33.3333 % × 3) rundar varje post separat — summan kan hamna under totalen', () => {
    const result = calculatePaymentPlan(100000, [plan(33.3333), plan(33.3333), plan(33.3333)])
    const sum = result.reduce((s, r) => s + r.amount, 0)
    // Nuvarande beteende: INGEN avstämning mot totalen — varje rad avrundas
    // helt för sig (Math.round per post, ingen "sista raden tar mellan-
    // skillnaden"-logik). Här: 10 öre kortare än totalen. Andreas bör se
    // detta explicit — värt en fix om det stör i praktiken.
    expect(result.map(r => r.amount)).toEqual([33333.3, 33333.3, 33333.3])
    expect(sum).toBeCloseTo(99999.9, 5) // flyttal — se upp för exakt toBe på summerade decimaler
    expect(sum).toBeLessThan(100000) // kortare än totalen, inte lika med den
  })

  test('bevarar övriga fält på varje post (label, due_description) oförändrade', () => {
    const result = calculatePaymentPlan(1000, [{ label: 'Vid signering', percent: 100, amount: 0, due_description: 'Direkt' }])
    expect(result[0].label).toBe('Vid signering')
    expect(result[0].due_description).toBe('Direkt')
  })
})

test.describe('validatePaymentPlan — summan ska vara 100 %', () => {
  test('en plan som summerar exakt till 100 % är giltig', () => {
    expect(validatePaymentPlan([plan(40), plan(60)])).toBe(true)
  })

  test('99 % är INTE giltigt', () => {
    expect(validatePaymentPlan([plan(50), plan(49)])).toBe(false)
  })

  test('101 % är INTE giltigt', () => {
    expect(validatePaymentPlan([plan(50), plan(51)])).toBe(false)
  })

  test('en avrundningsdifferens inom 0.01 räknas som giltig (flyttalstolerans)', () => {
    expect(validatePaymentPlan([plan(33.34), plan(33.33), plan(33.33)])).toBe(true)
  })

  test('FYND (dokumenterat, inte fixat): en tom plan räknas som giltig', () => {
    // Ingen betalplan = betalning hanteras utanför denna mekanism (t.ex. hela
    // beloppet vid faktura) — troligen avsiktligt, men värt att Andreas ser
    // att det är exakt SÅ det fungerar idag, inte en gissning.
    expect(validatePaymentPlan([])).toBe(true)
  })
})
