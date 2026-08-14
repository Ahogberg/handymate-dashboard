/**
 * Facit för ÄTA-prisstrippningen (2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `stripAtaPrices`/`stripSingleAtaPrices` (lib/ata/strip-prices.ts) är
 * andra försvarslinjen (TD-77) mot att ÄTA-belopp läcker till en
 * användare utan `see_financials` — tre separata read-endpoints
 * (/api/projects/[id], /api/ata, /api/ata/[id]) delar den här funktionen
 * just för att gate:a EN gång, konsekvent, i stället för tre separata
 * (och tre gånger så lätta att glömma en av) implementationer. Otestad
 * sen den skrevs.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/ata-price-visibility.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { stripAtaPrices, stripSingleAtaPrices, type AtaWithPrices } from '../lib/ata/strip-prices'

function ata(overrides: Partial<AtaWithPrices> = {}): AtaWithPrices {
  return {
    change_id: 'c1',
    amount: 18500,
    total: 18500,
    description: 'Extra eluttag i garaget',
    change_type: 'addition',
    ata_number: 'ÄTA-3',
    status: 'sent',
    signed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    items: [
      { name: 'Materiel', description: 'Kabel + uttag', quantity: 2, unit: 'st', unit_price: 500, total: 1000 },
    ],
    ...overrides,
  }
}

test.describe('stripAtaPrices', () => {
  test('toppnivåns amount/total nollas för varje ÄTA i listan', () => {
    const result = stripAtaPrices([ata({ change_id: 'a', amount: 100 }), ata({ change_id: 'b', amount: 200 })])
    expect(result[0].amount).toBe(0)
    expect(result[0].total).toBe(0)
    expect(result[1].amount).toBe(0)
    expect(result[1].total).toBe(0)
  })

  test('varje radens unit_price/total nollas, men beskrivning/kvantitet/enhet bevaras', () => {
    const [result] = stripAtaPrices([ata()])
    expect(result.items![0].unit_price).toBe(0)
    expect(result.items![0].total).toBe(0)
    expect(result.items![0].name).toBe('Materiel')
    expect(result.items![0].description).toBe('Kabel + uttag')
    expect(result.items![0].quantity).toBe(2)
    expect(result.items![0].unit).toBe('st')
  })

  test('en ÄTA utan items-array (null) stripper toppnivån utan att krascha', () => {
    const [result] = stripAtaPrices([ata({ items: null })])
    expect(result.amount).toBe(0)
    expect(result.total).toBe(0)
    expect(result.items).toBeNull()
  })

  test('en ÄTA med items: undefined stripper toppnivån utan att krascha', () => {
    const [result] = stripAtaPrices([ata({ items: undefined })])
    expect(result.amount).toBe(0)
    expect(result.items).toBeUndefined()
  })

  test('andra fält (status, change_type, ata_number, signed_at, created_at) rörs ALDRIG', () => {
    const [result] = stripAtaPrices([ata()])
    expect(result.status).toBe('sent')
    expect(result.change_type).toBe('addition')
    expect(result.ata_number).toBe('ÄTA-3')
    expect(result.description).toBe('Extra eluttag i garaget')
    expect(result.created_at).toBe('2026-08-01T00:00:00Z')
  })

  test('input muteras ALDRIG — originalobjektet är oförändrat efter anrop', () => {
    const original = ata({ amount: 18500 })
    const originalItemsRef = original.items
    stripAtaPrices([original])
    expect(original.amount).toBe(18500) // fortfarande det riktiga beloppet
    expect(original.items).toBe(originalItemsRef) // samma referens, orörd
    expect((original.items as any[])[0].unit_price).toBe(500)
  })

  test('en tom lista ger en tom lista', () => {
    expect(stripAtaPrices([])).toEqual([])
  })
})

test.describe('stripSingleAtaPrices', () => {
  test('ger exakt samma resultat som listversionen för en enskild rad', () => {
    const enskild = ata({ change_id: 'x', amount: 5000 })
    const viaLista = stripAtaPrices([ata({ change_id: 'x', amount: 5000 })])[0]
    const viaSingel = stripSingleAtaPrices(enskild)
    expect(viaSingel).toEqual(viaLista)
  })

  test('muterar inte heller sin input', () => {
    const original = ata({ amount: 7000 })
    stripSingleAtaPrices(original)
    expect(original.amount).toBe(7000)
  })
})
