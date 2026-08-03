/**
 * ROT/RUT-flaggning på offertrader — kodrevision 2026-08-03 (Fix 1+2).
 * Körs: npx playwright test tests/rot-rut-flagging.spec.ts --no-deps
 *
 * Bakgrund: `convertLegacyItems` i app/dashboard/quotes/new/page.tsx och
 * app/dashboard/quotes/[id]/edit/page.tsx satte tidigare
 * `is_rot_eligible: item.type === 'labor'` på ALLA arbetsrader, oavsett vad
 * AI:n föreslagit (suggestedDeductionType). `applyAiResult` lade sedan bara
 * additivt TILL is_rut_eligible = true för RUT-förslag, utan att rensa
 * is_rot_eligible — och getItemRotRutType (lib/quote-calculations.ts)
 * kollar ROT FÖRST. Resultat: ett RUT-jobb (städ/trädgård) fick 30 %
 * ROT-avdrag istället för 50 % RUT — fel avdragstyp mot Skatteverket.
 * Dessutom ROT-flaggades arbete även när suggestedDeductionType === 'none'
 * (nybygge/företagskund/lokal), där inget avdrag alls ska föreslås.
 *
 * Detta test låser fast den rena mappningen (legacyItemRotRutType +
 * setItemRotRut) som nu är den ENDA källan till ROT/RUT-flaggor för
 * legacy-konverterade rader, så bugmönstret inte kan återinföras tyst.
 */
import { test, expect } from '@playwright/test'
import {
  getItemRotRutType,
  setItemRotRut,
  legacyItemRotRutType,
} from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function baseItem(over: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'tim',
    unit_price: 650, total: 650, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

test.describe('legacyItemRotRutType — ren mappning legacy type + suggestedDeductionType → RotRutType', () => {
  test('(a) labor + rot → rot', () => {
    expect(legacyItemRotRutType('labor', 'rot')).toBe('rot')
  })

  test('(b) labor + rut → rut', () => {
    expect(legacyItemRotRutType('labor', 'rut')).toBe('rut')
  })

  test('(c) Fix 2: labor + none → null (inget avdrag ska antas — nybygge/företag/lokal)', () => {
    expect(legacyItemRotRutType('labor', 'none')).toBeNull()
  })

  test('(d) labor + undefined/null → null (okänd avdragstyp antar inget avdrag)', () => {
    expect(legacyItemRotRutType('labor', undefined)).toBeNull()
    expect(legacyItemRotRutType('labor', null)).toBeNull()
  })

  test('(e) material rader blir ALDRIG ROT/RUT-berättigade, oavsett föreslagen typ', () => {
    expect(legacyItemRotRutType('material', 'rot')).toBeNull()
    expect(legacyItemRotRutType('material', 'rut')).toBeNull()
  })

  test('(f) service-rader blir ALDRIG ROT/RUT-berättigade', () => {
    expect(legacyItemRotRutType('service', 'rot')).toBeNull()
    expect(legacyItemRotRutType('service', 'rut')).toBeNull()
  })
})

test.describe('setItemRotRut — EN avdragstyp sätts konsekvent, aldrig båda flaggorna samtidigt', () => {
  test('(g) type "rot": is_rot_eligible true, is_rut_eligible false, rot_rut_type "rot"', () => {
    const item = setItemRotRut(baseItem(), 'rot')
    expect(item.is_rot_eligible).toBe(true)
    expect(item.is_rut_eligible).toBe(false)
    expect(item.rot_rut_type).toBe('rot')
  })

  test('(h) type "rut": is_rut_eligible true, is_rot_eligible false, rot_rut_type "rut"', () => {
    const item = setItemRotRut(baseItem(), 'rut')
    expect(item.is_rut_eligible).toBe(true)
    expect(item.is_rot_eligible).toBe(false)
    expect(item.rot_rut_type).toBe('rut')
  })

  test('(i) type null: båda flaggorna false, rot_rut_type null — rensar tidigare ROT-flagga när avsikten är RUT/inget', () => {
    // Simulerar exakt regressionsscenariot: en rad som (buggigt) redan hade
    // is_rot_eligible=true från den gamla convertLegacyItems ska bli helt
    // ren när den rätta typen (här: inget alls) appliceras om igen.
    const dirty = baseItem({ is_rot_eligible: true, is_rut_eligible: false })
    const item = setItemRotRut(dirty, null)
    expect(item.is_rot_eligible).toBe(false)
    expect(item.is_rut_eligible).toBe(false)
    expect(item.rot_rut_type).toBeNull()
  })
})

test.describe('Regression: convertLegacyItems-mönstret (setItemRotRut + legacyItemRotRutType) — RUT-buggen kan inte återuppstå', () => {
  // Detta reproducerar exakt vad convertLegacyItems (new/page.tsx,
  // [id]/edit/page.tsx) nu gör per rad: setItemRotRut(item, legacyItemRotRutType(item.type, suggestedDeductionType))
  function convertOneLegacyItem(
    legacyType: 'labor' | 'material' | 'service',
    suggestedDeductionType: 'rot' | 'rut' | 'none' | null | undefined,
  ): QuoteItem {
    return setItemRotRut(
      baseItem({ is_rot_eligible: false, is_rut_eligible: false }),
      legacyItemRotRutType(legacyType, suggestedDeductionType),
    )
  }

  test('(j) AI föreslår RUT på ett arbetsjobb → raden blir RUT, INTE ROT (den ursprungliga buggen)', () => {
    const item = convertOneLegacyItem('labor', 'rut')
    expect(getItemRotRutType(item)).toBe('rut')
    expect(item.is_rot_eligible).toBe(false) // aldrig kvarliggande ROT-flagga
    expect(item.is_rut_eligible).toBe(true)
  })

  test('(k) AI föreslår ROT på ett arbetsjobb → raden blir ROT, inte RUT', () => {
    const item = convertOneLegacyItem('labor', 'rot')
    expect(getItemRotRutType(item)).toBe('rot')
    expect(item.is_rut_eligible).toBe(false)
  })

  test('(l) AI föreslår "none" (nybygge/företag/lokal) → arbetsraden får INGEN avdragstyp', () => {
    const item = convertOneLegacyItem('labor', 'none')
    expect(getItemRotRutType(item)).toBeNull()
    expect(item.is_rot_eligible).toBe(false)
    expect(item.is_rut_eligible).toBe(false)
  })

  test('(m) materialrader förblir avdragsfria även när AI föreslår RUT för jobbet i stort', () => {
    const item = convertOneLegacyItem('material', 'rut')
    expect(getItemRotRutType(item)).toBeNull()
  })
})
