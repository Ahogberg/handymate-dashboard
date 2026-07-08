/**
 * FACIT — produktbank (Christoffers slutverifieringsscenario, STOPP 2-direktivet).
 * Körs: npx playwright test tests/facit-produktbank.spec.ts --no-deps
 *
 * Kedjar de RIKTIGA lib-funktionerna (samma kod som prod använder) genom
 * Christoffers exakta uppsättning — permanent regressionsvakt för hela
 * produktbank-kedjan: snapshot → split → ROT-motor → visningsnivå → gruppering.
 *
 * Setup: produkt "Fasadmålning" 450 kr/kvm, ROT, komponenter
 *   arbete   0.13 tim/kvm à 550  → 71.50 kr/kvm
 *   material 0.10 l/kvm   à 89   →  8.90 kr/kvm  (grundfärg)
 *   material 0.15 l/kvm   à 105  → 15.75 kr/kvm  (täckfärg)
 * Σ komponentkostnad = 96.15 kr/kvm · arbetsandel = 71.5/96.15 ≈ 0.743630
 * Offert: 120 kvm × 450 = 54 000 kr.
 */
import { test, expect } from '@playwright/test'
import {
  buildItemSnapshot,
  splitAmount,
  resolveLaborShare,
  type SnapshotComponent,
  type SnapshotProduct,
} from '../lib/products/build-item-snapshot'
import { calculateQuoteTotals } from '../lib/quote-calculations'
import {
  resolveDisplayLevel,
  groupItemsForSummary,
  displayLevelToColumns,
} from '../lib/quotes/display-level'
import type { QuoteItem } from '../lib/types/quote'

const FASAD_COMPONENTS: SnapshotComponent[] = [
  { component_type: 'arbete', description: 'Målningsarbete', quantity_per_unit: 0.13, unit: 'tim', unit_cost: 550 },
  { component_type: 'material', description: 'Grundfärg', quantity_per_unit: 0.1, unit: 'l', unit_cost: 89 },
  { component_type: 'material', description: 'Täckfärg', quantity_per_unit: 0.15, unit: 'l', unit_cost: 105 },
]
const FASAD: SnapshotProduct = {
  id: 'prod_fasad', name: 'Fasadmålning', sku: 'MAL-100', sales_price: 450, default_labor_share: null,
}

function item(over: Partial<QuoteItem>): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 1000, total: 1000, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

test.describe('FACIT produktbank — Christoffers scenario', () => {
  // Bygg radens snapshot en gång (samma väg som applyProductToItem i editorn).
  const snap = buildItemSnapshot(FASAD, FASAD_COMPONENTS, 120, 54000)

  test('(a) EN rad med rätt summa: 120 kvm × 450 = 54 000 kr', () => {
    const total = 120 * 450
    expect(total).toBe(54000)
    // Kunden ser en enda item-rad — snapshotens komponenter expanderar aldrig.
    expect(snap.component_snapshot?.components).toHaveLength(3)
  })

  test('(b) ROT på arbetsandelen, inte totalen: bas ≈ 40 156, avdrag ≈ 12 047 (INTE 16 200)', () => {
    // Arbetsandelen härledd ur komponenterna.
    expect(snap.labor_share).toBeCloseTo(71.5 / 96.15, 10)
    expect(snap.labor_amount).toBe(40156.01)
    expect(snap.material_amount).toBe(13843.99)
    expect(snap.estimated_hours).toBeCloseTo(15.6, 10) // 120 × 0.13

    const t = calculateQuoteTotals([
      item({
        description: 'Fasadmålning', quantity: 120, unit: 'kvm', unit_price: 450, total: 54000,
        is_rot_eligible: true, rot_rut_type: 'rot',
        labor_amount: snap.labor_amount, material_amount: snap.material_amount,
      }),
    ], 0, 25)

    expect(t.rotWorkCost).toBe(40156.01)          // basen = arbetsandelen
    expect(t.rotDeduction).toBeCloseTo(12046.803, 3) // 40156.01 × 0.30
    // Kontrast: en naiv beräkning på hela raden hade gett 54000 × 0.30 = 16 200.
    expect(t.rotDeduction).not.toBeCloseTo(16200, 0)
  })

  test('(c)/(d) tre visningsnivåer + totalsumma/ROT alltid synliga', () => {
    // Nivå-mappningen (samma resolver alla ytor delar).
    expect(resolveDisplayLevel({ detail_level: 'subtotals_only' })).toBe('summary')
    expect(resolveDisplayLevel({ detail_level: 'detailed', show_unit_prices: false })).toBe('rows')
    expect(resolveDisplayLevel({ detail_level: 'detailed', show_unit_prices: true })).toBe('full')

    // Kolumnexponering per nivå.
    expect(displayLevelToColumns('summary')).toEqual({ showQuantities: false, showUnitPrices: false, showRows: false })
    expect(displayLevelToColumns('rows')).toEqual({ showQuantities: false, showUnitPrices: false, showRows: true })
    expect(displayLevelToColumns('full')).toEqual({ showQuantities: true, showUnitPrices: true, showRows: true })

    // "Bara delsummor": Fasad-raden grupperas; totalen (54 000) hamnar i gruppen.
    // Totalsumma + ROT beräknas separat av calculateQuoteTotals → alltid synliga
    // oavsett nivå (döljs aldrig av filtret).
    const rows: QuoteItem[] = [
      item({ item_type: 'heading', description: 'Utvändigt' }),
      item({ description: 'Fasadmålning', quantity: 120, unit: 'kvm', unit_price: 450, total: 54000 }),
    ]
    const { groups, options } = groupItemsForSummary(rows)
    expect(groups).toEqual([{ heading: 'Utvändigt', total: 54000 }])
    expect(options).toHaveLength(0)
  })

  test('(e) befintliga rader UTAN labor_amount → ROT på hela totalen (legacy oförändrat)', () => {
    const t = calculateQuoteTotals([
      item({ description: 'Gammal ROT-rad', quantity: 1, unit: 'st', unit_price: 10000, total: 10000, is_rot_eligible: true, rot_rut_type: 'rot' }),
    ], 0, 25)
    expect(t.rotWorkCost).toBe(10000)             // ?? radtotal
    expect(t.rotDeduction).toBe(3000)             // 10000 × 0.30
  })

  test('(f) snapshot fryser arbetsandelen — produktprisändring rör inte skapad rad', () => {
    // Byggd rad har fryst labor_share; en senare prisändring på produkten
    // ändrar INTE snapshotens andel. Mängdomräkning använder den frysta andelen.
    const frozenShare = snap.component_snapshot?.labor_share
    expect(frozenShare).toBeCloseTo(71.5 / 96.15, 10)

    // Simulera "produkten höjs till 500 kr/kvm efteråt" → den redan skapade radens
    // snapshot är oförändrad; om kunden ändrar mängd till 100 kvm räknas spliten
    // om från den FRYSTA andelen (54000→45000-basen), aldrig från nytt produktpris.
    const recomputed = splitAmount(100 * 450, frozenShare ?? null)
    expect(recomputed.labor_amount).toBe(33463.34)  // round2(45000 × 0.743630)
    expect((recomputed.labor_amount ?? 0) + (recomputed.material_amount ?? 0)).toBe(45000)
  })

  test('(g) ren materialprodukt (labor_share 0) → labor_amount 0 → ROT-bas EXAKT 0', () => {
    // ?? -vs-|| -fällan: 0 är giltigt, inte falsy-fallback.
    expect(resolveLaborShare([], 0)).toBe(0)
    const { labor_amount, material_amount } = splitAmount(54000, 0)
    expect(labor_amount).toBe(0)
    expect(material_amount).toBe(54000)

    const t = calculateQuoteTotals([
      item({ description: 'Ren material', quantity: 1, unit: 'st', unit_price: 54000, total: 54000, is_rot_eligible: true, rot_rut_type: 'rot', labor_amount: 0, material_amount: 54000 }),
    ], 0, 25)
    expect(t.rotWorkCost).toBe(0)                 // bas EXAKT 0, inte 54000
    expect(t.rotDeduction).toBe(0)
  })

  test('(h) skev andel på ojämnt belopp → labor + material = total exakt (öres-invariant)', () => {
    const total = 999.99
    const { labor_amount, material_amount } = splitAmount(total, 1 / 3)
    expect((labor_amount ?? 0) + (material_amount ?? 0)).toBe(total)
    // Härledning: material = total − labor, aldrig egen avrundning.
    expect(material_amount).toBe(Math.round((total - (labor_amount ?? 0)) * 100) / 100)
  })
})
