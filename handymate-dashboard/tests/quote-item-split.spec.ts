/**
 * Facit för arbete/material-splitten vid offertskapande (2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `resolveItemSplit` (lib/quotes/create-quote.ts) är splitten som föder
 * BÅDE ROT/RUT-basen (labor_amount, se lib/quote-calculations.ts) och
 * marginal-/COGS-rapporteringen (labor_total/material_total på quotes-
 * raden). Fanns bara kontrollerad att den EXISTERAR
 * (tests/offertbyggaren.spec.ts, en källtext-grep) — aldrig körd med
 * data förrän nu.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-item-split.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { resolveItemSplit } from '../lib/quotes/create-quote'

test.describe('resolveItemSplit', () => {
  test('labor + material som redan summerar till radens total lämnas orörda', () => {
    const result = resolveItemSplit({ description: 'Kök', labor_amount: 6000, material_amount: 4000 }, 10000)
    expect(result).toEqual({ labor_amount: 6000, material_amount: 4000 })
  })

  test('labor_amount utan material_amount härleder material = total − labor', () => {
    const result = resolveItemSplit({ description: 'Rivning', labor_amount: 3000, material_amount: null }, 5000)
    expect(result).toEqual({ labor_amount: 3000, material_amount: 2000 })
  })

  test('labor + material som INTE summerar till radtotalen läks — material omräknas, labor vinner', () => {
    const result = resolveItemSplit({ description: 'Felaktig rad', labor_amount: 10, material_amount: 5 }, 20)
    expect(result).toEqual({ labor_amount: 10, material_amount: 10 }) // 20 - 10, INTE de ursprungliga 5
  })

  test('ingen labor_amount OCH ingen material_amount (helt legacy-rad) ger båda fälten null', () => {
    const result = resolveItemSplit({ description: 'Legacy' }, 5000)
    expect(result).toEqual({ labor_amount: null, material_amount: null })
  })

  test('material_amount satt men labor_amount saknas — labor förblir null, material rörs INTE', () => {
    // Splitten kräver labor_amount som ankare (produktbankens auktoritativa
    // fält) — utan den gissar funktionen aldrig ett labor-belopp, även om
    // material redan finns satt på raden.
    const result = resolveItemSplit({ description: 'Bara material satt', labor_amount: null, material_amount: 4500 }, 5000)
    expect(result).toEqual({ labor_amount: null, material_amount: 4500 })
  })

  test('labor_amount: 0 är giltigt (ren material-rad) och läker material till hela radtotalen', () => {
    // ?? inte || — samma fälla som i quote-calculations.ts: 0 är ett GILTIGT
    // labor-belopp (t.ex. ren materialleverans), inte "saknas".
    const result = resolveItemSplit({ description: 'Ren material', labor_amount: 0, material_amount: null }, 8000)
    expect(result).toEqual({ labor_amount: 0, material_amount: 8000 })
  })

  test('läkning avrundar till öre, ingen krona/öre försvinner i flyttalsbrus', () => {
    const result = resolveItemSplit({ description: 'Ojämn rad', labor_amount: 33.333, material_amount: null }, 100)
    expect(result.material_amount).toBe(66.67)
  })

  test('en avrundningsdifferens ≤ 0.01 kr räknas som "stämmer" — läks INTE i onödan', () => {
    // labor + material = 99.995, radtotal 100 — differensen (0.005) är under
    // 0.01-tröskeln, så de ORIGINALA värdena ska bevaras, inte läkas.
    const result = resolveItemSplit({ description: 'Nästan exakt', labor_amount: 50, material_amount: 49.995 }, 100)
    expect(result).toEqual({ labor_amount: 50, material_amount: 49.995 })
  })
})
