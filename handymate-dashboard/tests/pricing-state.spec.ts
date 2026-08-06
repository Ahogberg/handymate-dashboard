/**
 * Facit för artikelns prisläge och "Sätt som standard" (2026-08-06).
 *
 * Det som testas hårdast är NÄR VI INTE FRÅGAR. En knapp som erbjuder att
 * spara något som redan är sparat lär bort uppmärksamhet — samma princip som
 * amber-varningarna i offertflödet och tystnaden i intäktssvepet.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/pricing-state.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { priceState, priceLabel, standardPriceOffer } from '../lib/products/pricing-state'

test.describe('prisläget', () => {
  test('noll är inte ett pris — det är frånvaron av ett', () => {
    // sales_price är NUMERIC NOT NULL, så noll är enda möjliga representation
    // av "aldrig prissatt". Att visa den som "0 kr" hade sagt att artikeln är
    // gratis.
    expect(priceState(0)).toBe('osatt')
    expect(priceState(null)).toBe('osatt')
    expect(priceState(undefined)).toBe('osatt')
  })

  test('ett pris över noll är satt', () => {
    expect(priceState(650)).toBe('satt')
    expect(priceState(1)).toBe('satt')
  })

  test('negativt pris räknas som osatt, inte som rabatt', () => {
    expect(priceState(-100)).toBe('osatt')
  })
})

test.describe('etiketten i väljaren', () => {
  test('prislös artikel säger "Sätt pris", aldrig "0 kr"', () => {
    expect(priceLabel(0, 'tim')).toBe('Sätt pris')
  })

  test('prissatt artikel visar pris och enhet', () => {
    expect(priceLabel(650, 'tim')).toContain('kr/tim')
    expect(priceLabel(650, 'tim').replace(/\D/g, '')).toContain('650')
  })

  test('tusental formateras svenskt', () => {
    // Icke-brytande mellanslag som avgränsare — jämför på siffrorna.
    expect(priceLabel(18400, 'st').replace(/\D/g, '')).toContain('18400')
  })
})

test.describe('NÄR VI INTE FRÅGAR — viktigare än när vi gör det', () => {
  test('rad utan koppling till banken: ingen fråga', () => {
    // Fritextrader och omatchade AI-rader har ingen artikel att spara till.
    expect(standardPriceOffer({ linkedProductId: null, rowPrice: 650, productPrice: 0 }).show).toBe(false)
  })

  test('rad utan pris: ingenting att spara', () => {
    expect(standardPriceOffer({ linkedProductId: 'p1', rowPrice: 0, productPrice: 0 }).show).toBe(false)
  })

  test('samma pris som artikeln: ingen fråga', () => {
    // Det finns inget att spara. En knapp som inte gör något lär bort
    // uppmärksamhet.
    expect(standardPriceOffer({ linkedProductId: 'p1', rowPrice: 650, productPrice: 650 }).show).toBe(false)
  })

  test('öresskillnad räknas som samma pris', () => {
    // Priser avrundas till kronor innan jämförelse — annars hade en
    // flyttalsavvikelse triggat frågan i onödan.
    expect(standardPriceOffer({ linkedProductId: 'p1', rowPrice: 650.2, productPrice: 650 }).show).toBe(false)
  })
})

test.describe('när vi frågar — och vad vi säger', () => {
  test('prislös artikel: erbjud att SPARA', () => {
    const o = standardPriceOffer({ linkedProductId: 'p1', rowPrice: 650, productPrice: 0 })
    expect(o.show).toBe(true)
    expect(o.label).toContain('Spara')
    expect(o.label).toContain('standardpris')
  })

  test('prissatt artikel med annat pris: säg att det är en ÄNDRING', () => {
    // Hantverkaren ska veta att han skriver över något som redan finns, inte
    // fylla en lucka.
    const o = standardPriceOffer({ linkedProductId: 'p1', rowPrice: 700, productPrice: 650 })
    expect(o.show).toBe(true)
    expect(o.label).toContain('Ändra')
  })

  test('beloppet står i erbjudandet', () => {
    // "Spara som standard" utan siffra kräver att man minns vad man skrev.
    const o = standardPriceOffer({ linkedProductId: 'p1', rowPrice: 1850, productPrice: 0 })
    expect(o.label.replace(/\D/g, '')).toContain('1850')
  })

  test('lägre pris än standarden erbjuds också', () => {
    // Rabatterad rad kan mycket väl vara det nya normalpriset.
    expect(standardPriceOffer({ linkedProductId: 'p1', rowPrice: 500, productPrice: 650 }).show).toBe(true)
  })
})
