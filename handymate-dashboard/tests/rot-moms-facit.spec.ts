/**
 * ROT/RUT/grön teknik — moms-facit (Skatteverket-fix 2026-07-30).
 * Körs: npx playwright test tests/rot-moms-facit.spec.ts --no-deps
 *
 * Bakgrund: Skatteverkets regel är att avdraget är X % av arbetskostnaden
 * INKLUSIVE moms (ordagrant: "Rotavdrag (30 procent av arbetskostnaden
 * inklusive moms)"), efter ev. rabatt. Appens radpriser är EXKL moms (momsen
 * läggs på subtotalen efteråt) — före denna fix räknades avdraget på fel
 * (för lågt) ex-moms-belopp, vilket gav kunden ~20 % för lite avdrag.
 *
 * Detta är det permanenta facit-testet för momsregeln — kärnfunktionerna i
 * lib/rot-rut.ts samt alla motorer som konsumerar dem (quote/invoice).
 */
import { test, expect } from '@playwright/test'
import { rotRutDeductionInclVat, gronTeknikDeductionInclVat } from '../lib/rot-rut'
import { calculateQuoteTotals } from '../lib/quote-calculations'
import { calculateInvoiceTotals } from '../lib/invoice-calculations'
import { calculateRawDeduction, buildValidationFromUsage, type RotRutUsage } from '../lib/rot-rut-limits'
import type { QuoteItem } from '../lib/types/quote'
import type { InvoiceItem } from '../lib/types/invoice'

function quoteItem(over: Partial<QuoteItem>): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 1000, total: 1000, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

function invoiceItem(over: Partial<InvoiceItem>): InvoiceItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 1000, total: 1000, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as InvoiceItem
}

test.describe('rotRutDeductionInclVat — Skatteverkets momsregel', () => {
  test('(a) Skatteverkets eget exempel: 3200 ex moms (= 4000 inkl) → rotDeduction exakt 1200', () => {
    // 3200 × 1.25 (moms) = 4000 inkl moms; 30 % av 4000 = 1200.
    expect(rotRutDeductionInclVat('rot', 3200)).toBe(1200)
  })

  test('(b) ROT-taket: inkl-moms-bas 166 667+ → avdrag exakt 50 000', () => {
    // 133 333.6 ex moms × 1.25 = 166 667 inkl moms; 30 % av det = 50 000.1 → takas till 50 000.
    expect(rotRutDeductionInclVat('rot', 133333.6)).toBe(50000)
  })

  test('(c) RUT-taket: 75 000', () => {
    // 130 000 ex moms × 1.25 = 162 500 inkl moms; 50 % av det = 81 250 → takas till 75 000.
    expect(rotRutDeductionInclVat('rut', 130000)).toBe(75000)
  })
})

test.describe('calculateQuoteTotals — moms + rabatt i avdragsbasen', () => {
  test('(d) 10 % procentrabatt: avdrag räknas på diskonterad bas (3200 ex, 10 % rabatt → bas 2880 ex → 3600 inkl → 1080)', () => {
    const t = calculateQuoteTotals(
      [quoteItem({ description: 'Arbete', unit_price: 3200, total: 3200, is_rot_eligible: true, rot_rut_type: 'rot' })],
      10, // discountPercent
      25, // vatRate
    )
    expect(t.rotWorkCost).toBe(3200) // radens ex-moms arbetskostnad (visningsfält, oförändrat av fixen)
    expect(t.rotDeduction).toBeCloseTo(1080, 6)
  })

  test('(e) rabattrad (fast belopp): avdraget skalas proportionellt via afterDiscount/subtotal', () => {
    // subtotal 2000, rabattrad -200 (fast) → afterDiscount 1800 → discountFactor 0.9
    // rotDeduction = 2000 × 0.9 × 1.25 × 0.30 = 675
    const t = calculateQuoteTotals(
      [
        quoteItem({ description: 'Arbete', unit_price: 2000, total: 2000, is_rot_eligible: true, rot_rut_type: 'rot' }),
        quoteItem({ item_type: 'discount', description: 'Rabatt', quantity: 1, unit_price: 200, total: -200 }),
      ],
      0,
      25,
    )
    expect(t.rotWorkCost).toBe(2000)
    expect(t.discountAmount).toBe(200)
    expect(t.rotDeduction).toBeCloseTo(675, 6)
  })

  test('(f) grön teknik-tak EFTER moms: raw 45 000 ex (= 56 250 inkl) → takas till 50 000', () => {
    // gron_lagring (batteri) = 50 % av radtotalen → rå avdragsbas 45 000 kräver
    // radtotal 90 000. Innan fixen saknade taket momsuppräkningen (fanns bara
    // ett tak på RÅ ex-moms-summan) — detta är facit på fixen: taket appliceras
    // EFTER moms.
    expect(gronTeknikDeductionInclVat(45000)).toBe(50000)

    const t = calculateQuoteTotals(
      [quoteItem({ description: 'Batterilager', unit_price: 90000, total: 90000, rot_rut_type: 'gron_lagring' })],
      0,
      25,
    )
    expect(t.gronBase).toBe(90000)
    expect(t.gronDeduction).toBe(50000)
  })

  test('(g) calculateInvoiceTotals: samma momsregel som quote-motorn (samma input → samma avdrag)', () => {
    const quoteTotals = calculateQuoteTotals(
      [quoteItem({ description: 'Arbete', unit_price: 3200, total: 3200, is_rot_eligible: true, rot_rut_type: 'rot' })],
      0,
      25,
    )
    const invoiceTotals = calculateInvoiceTotals(
      [invoiceItem({ description: 'Arbete', unit_price: 3200, total: 3200, is_rot_eligible: true })],
      0,
      25,
    )
    expect(invoiceTotals.rotWorkCost).toBe(quoteTotals.rotWorkCost)
    expect(invoiceTotals.rotDeduction).toBeCloseTo(quoteTotals.rotDeduction, 6)
    expect(invoiceTotals.rotDeduction).toBe(1200)
  })
})

test.describe('lib/rot-rut-limits.ts — årstaks-vägen (calculateCappedDeduction/validateRotRutDeduction) använder samma momsregel', () => {
  // Fixture: kund som ännu inte utnyttjat något av sitt årsutrymme.
  function fullUsage(): RotRutUsage {
    return {
      rot_used: 0,
      rut_used: 0,
      total_used: 0,
      rot_remaining: 50_000,
      rut_remaining: 75_000,
      total_remaining: 75_000,
      year: 2026,
    }
  }

  test('(h) calculateRawDeduction: 3200 ex moms → 1200 (samma facit som rotRutDeductionInclVat, inte den gamla ex-moms-buggen på 960)', () => {
    expect(calculateRawDeduction('rot', 3200)).toBe(1200)
  })

  test('(i) buildValidationFromUsage: årsutrymmet räcker → fullt inkl-moms-avdrag beviljas (1200, inte ex-moms-buggens 960)', () => {
    const requested = calculateRawDeduction('rot', 3200)
    const validation = buildValidationFromUsage('rot', requested, fullUsage())
    expect(validation.allowed).toBe(true)
    expect(validation.requested_deduction).toBe(1200)
    expect(validation.max_allowed_deduction).toBe(1200)
  })

  test('(j) buildValidationFromUsage: årstaket begränsar fortfarande — kvarvarande utrymme 800 → avdraget kapas till 800, inte 1200', () => {
    const requested = calculateRawDeduction('rot', 3200) // 1200
    const usage: RotRutUsage = {
      ...fullUsage(),
      rot_used: 49_200, // 50 000 - 49 200 = 800 kvar
      total_used: 49_200,
      rot_remaining: 800,
      total_remaining: 25_800,
    }
    const validation = buildValidationFromUsage('rot', requested, usage)
    expect(validation.requested_deduction).toBe(1200)
    expect(validation.max_allowed_deduction).toBe(800)
    expect(validation.allowed).toBe(true) // maxAllowed > 0, bara begränsat
    expect(validation.warning).toContain('800')
  })

  test('(k) buildValidationFromUsage respekterar även det gemensamma ROT+RUT-taket, inte bara typ-taket', () => {
    const requested = calculateRawDeduction('rut', 4000) // 4000 × 1.25 × 0.5 = 2500
    expect(requested).toBe(2500)
    const usage: RotRutUsage = {
      rot_used: 0,
      rut_used: 0,
      total_used: 74_000,
      rot_remaining: 50_000,
      rut_remaining: 75_000,
      total_remaining: 1_000, // gemensamt tak nästan fullt utnyttjat
      year: 2026,
    }
    const validation = buildValidationFromUsage('rut', requested, usage)
    expect(validation.max_allowed_deduction).toBe(1_000)
  })
})
