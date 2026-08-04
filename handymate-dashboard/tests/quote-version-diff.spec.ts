/**
 * FACIT — computeVersionDiff (ETAPP 4, offert-masterplan.md, punkt 5):
 * "vad ändrades"-raden i offertens versionsväljare. Ren funktion, ingen DOM.
 * Körs: npx playwright test tests/quote-version-diff.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { computeVersionDiff, formatSignedCurrency } from '../app/dashboard/quotes/[id]/helpers'

// sv-SE:s Intl.NumberFormat separerar tusental med U+00A0 (icke-brytande
// mellanslag), inte ett vanligt mellanslag (U+0020) — bygg de förväntade
// beloppssträngarna genom SAMMA Intl-anrop istället för att skriva dem för
// hand, annars failar testet på ett osynligt tecken snarare än på logik.
const kr = (n: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

test.describe('computeVersionDiff — versionsväljarens "vad ändrades"-rad', () => {
  test('(a) ingen föregående version → null (inget att jämföra)', () => {
    expect(computeVersionDiff({ total: 10000, item_count: 3 }, null)).toBeNull()
    expect(computeVersionDiff({ total: 10000, item_count: 3 }, undefined)).toBeNull()
  })

  test('(b) identisk total + radantal → explicit "inga ändringar"', () => {
    expect(computeVersionDiff({ total: 10000, item_count: 3 }, { total: 10000, item_count: 3 }))
      .toBe('Inga ändringar mot föregående version')
  })

  test('(c) fler rader + högre totalsumma → "+N rader, +X kr"', () => {
    const result = computeVersionDiff({ total: 14500, item_count: 5 }, { total: 10000, item_count: 3 })
    expect(result).toBe(`+2 rader, +${kr(4500)}`)
  })

  test('(d) färre rader + lägre totalsumma → radantalet stringifieras med vanligt bindestreck (JS Number→String), beloppet med typografiskt minustecken (U+2212, via formatSignedCurrency)', () => {
    const result = computeVersionDiff({ total: 8000, item_count: 2 }, { total: 10000, item_count: 3 })
    expect(result).toBe(`-1 rad, −${kr(2000)}`)
  })

  test('(e) singular "rad" vid ±1, plural "rader" annars', () => {
    expect(computeVersionDiff({ total: 10000, item_count: 4 }, { total: 10000, item_count: 3 }))
      .toBe('+1 rad')
    expect(computeVersionDiff({ total: 10000, item_count: 6 }, { total: 10000, item_count: 3 }))
      .toBe('+3 rader')
  })

  test('(f) endast belopp ändrat (samma radantal) → ingen radtext', () => {
    expect(computeVersionDiff({ total: 12000, item_count: 3 }, { total: 10000, item_count: 3 }))
      .toBe(`+${kr(2000)}`)
  })

  test('(g) endast radantal ändrat (samma totalsumma) → inget belopp', () => {
    expect(computeVersionDiff({ total: 10000, item_count: 4 }, { total: 10000, item_count: 3 }))
      .toBe('+1 rad')
  })
})

test.describe('formatSignedCurrency', () => {
  test('positivt belopp får +', () => {
    expect(formatSignedCurrency(4500)).toBe(`+${kr(4500)}`)
  })
  test('negativt belopp får − (U+2212), aldrig dubbelt minus', () => {
    const v = formatSignedCurrency(-4500)
    expect(v.startsWith('−')).toBe(true)
    expect(v.includes('--')).toBe(false)
  })
  test('0 → inget tecken', () => {
    expect(formatSignedCurrency(0)).not.toMatch(/^[+−]/)
  })
})
