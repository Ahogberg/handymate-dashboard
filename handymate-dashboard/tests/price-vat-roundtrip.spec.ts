/**
 * Facit för moms-räkningen (2026-08-14, stretch — Codex-brevet punkt 7).
 *
 * `formatSEK`/`formatPriceWithVat` är rena strängformatterare (precis det
 * brevet säger sällan är värt ett test) och lämnas därför otestade här —
 * bara de två räknande funktionerna, `calculateVat`/`priceExVat`, som
 * faktiskt används för att räkna ut ett belopp, inte bara visa det.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/price-vat-roundtrip.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { calculateVat, priceExVat } from '../lib/format-price'

test.describe('calculateVat', () => {
  test('25% (standard) på ett runt belopp', () => {
    expect(calculateVat(1000)).toBe(250)
  })

  test('rundar till hel krona', () => {
    expect(calculateVat(333, 25)).toBe(83) // 83.25 → 83
  })

  test('0 kr ger 0 kr moms, ingen krasch', () => {
    expect(calculateVat(0)).toBe(0)
  })

  test('icke-standard momssatser (12%, 6%, 0%) räknas korrekt', () => {
    expect(calculateVat(1000, 12)).toBe(120)
    expect(calculateVat(1000, 6)).toBe(60)
    expect(calculateVat(1000, 0)).toBe(0)
  })
})

test.describe('priceExVat', () => {
  test('25% (standard) på ett runt belopp', () => {
    expect(priceExVat(1250)).toBe(1000)
  })

  test('0 kr ger 0 kr, ingen krasch', () => {
    expect(priceExVat(0)).toBe(0)
  })

  test('icke-standard momssatser (12%, 6%) räknas korrekt', () => {
    expect(priceExVat(1120, 12)).toBe(1000)
    expect(priceExVat(1060, 6)).toBe(1000)
  })
})

test.describe('round-trip — ex-moms → moms → tillbaka till ex-moms', () => {
  for (const [belopp, sats] of [[1000, 25], [333, 25], [12345, 25], [1000, 12], [1000, 6], [7, 25]] as const) {
    test(`${belopp} kr @ ${sats}% hamnar inom 1 kr av startvärdet efter tur och retur`, () => {
      const moms = calculateVat(belopp, sats)
      const inklMoms = belopp + moms
      const tillbaka = priceExVat(inklMoms, sats)
      // Två separata avrundningar till hel krona (calculateVat, sedan
      // priceExVat) garanterar INTE ett exakt round-trip för alla belopp —
      // ±1 kr är förväntat och ok, mer än så vore ett räknefel.
      expect(Math.abs(tillbaka - belopp)).toBeLessThanOrEqual(1)
    })
  }
})
