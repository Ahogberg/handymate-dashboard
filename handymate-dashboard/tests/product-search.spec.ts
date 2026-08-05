/**
 * Facit-tester för produktbankens sök och branschsortiment (etapp 1,
 * offertplanen 2026-08-05).
 *
 * Bakgrunden till varje test är en verklig defekt kartläggningen hittade:
 * söksträngen matchades som EN sammanhängande substräng ("fasad mål" gav noll
 * träffar), det fanns ingen rankning, och en ny kund fick NOLL artiklar för
 * att onboarding seedade fel tabell.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/product-search.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  expandSynonyms,
  scoreProductMatch,
  rankBySearchMatch,
} from '../lib/products/search-ranking'
import { getDefaultProducts, getDefaultPriceList, getSeededBranches } from '../lib/product-defaults'

test.describe('expandSynonyms — hantverkarens ord vs artikelns namn', () => {
  test('kända ord expanderas åt båda hållen', () => {
    expect(expandSynonyms('eluttag')).toContain('vägguttag')
    expect(expandSynonyms('vägguttag')).toContain('eluttag')
    expect(expandSynonyms('toalett')).toContain('wc')
  })

  test('okänt ord returneras som ensam kandidat', () => {
    expect(expandSynonyms('takstolsbeslag')).toEqual(['takstolsbeslag'])
  })

  test('versaler och blanksteg normaliseras', () => {
    expect(expandSynonyms('  ELUTTAG ')).toContain('vägguttag')
  })

  test('tom sträng ger tom lista', () => {
    expect(expandSynonyms('   ')).toEqual([])
  })
})

test.describe('scoreProductMatch — bäst träff vinner', () => {
  test('exakt namn slår prefix som slår substräng', () => {
    const exact = scoreProductMatch({ name: 'Fasadmålning' }, 'Fasadmålning')
    const prefix = scoreProductMatch({ name: 'Fasadmålning trä' }, 'Fasadmålning')
    const substring = scoreProductMatch({ name: 'Extra fasadmålning' }, 'Fasadmålning')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(substring)
  })

  test('ordgränsträff värderas över träff mitt i ett ord', () => {
    const wordStart = scoreProductMatch({ name: 'Målning tak' }, 'tak')
    const midWord = scoreProductMatch({ name: 'Kontakta oss' }, 'tak')
    expect(wordStart).toBeGreaterThan(midWord)
  })

  test('artikelnummer matchar', () => {
    expect(scoreProductMatch({ name: 'Eluttag', sku: 'HM-EL-050' }, 'HM-EL-050')).toBeGreaterThan(0)
  })

  test('favorit ger en knuff men slår aldrig en bättre textträff', () => {
    const favoriteWeak = scoreProductMatch({ name: 'Extra fasadmålning', is_favorite: true }, 'Fasadmålning')
    const plainExact = scoreProductMatch({ name: 'Fasadmålning', is_favorite: false }, 'Fasadmålning')
    expect(plainExact).toBeGreaterThan(favoriteWeak)
  })

  test('delvis ordträff ger poäng utan sammanhängande substräng', () => {
    // Det som var noll träffar före tokeniseringen.
    expect(scoreProductMatch({ name: 'Fasadmålning' }, 'fasad mål')).toBeGreaterThan(0)
  })

  test('ingen träff alls ger noll', () => {
    expect(scoreProductMatch({ name: 'Eluttag' }, 'takpanna')).toBe(0)
  })
})

test.describe('rankBySearchMatch — ordning och renhet', () => {
  test('bästa träffen hamnar först', () => {
    const products = [
      { name: 'Extra fasadmålning' },
      { name: 'Fasadmålning' },
      { name: 'Fasadfärg' },
    ]
    expect(rankBySearchMatch(products, 'Fasadmålning')[0].name).toBe('Fasadmålning')
  })

  test('lika poäng behåller inbördes ordning (stabil sortering)', () => {
    const products = [{ name: 'Målning A' }, { name: 'Målning B' }]
    const ranked = rankBySearchMatch(products, 'målning')
    expect(ranked.map(p => p.name)).toEqual(['Målning A', 'Målning B'])
  })

  test('mutationsfri — indatalistan rörs inte', () => {
    const products = [{ name: 'B' }, { name: 'A' }]
    const before = products.map(p => p.name)
    rankBySearchMatch(products, 'A')
    expect(products.map(p => p.name)).toEqual(before)
  })

  test('tom sökterm returnerar listan oförändrad', () => {
    const products = [{ name: 'B' }, { name: 'A' }]
    expect(rankBySearchMatch(products, '   ')).toBe(products)
  })
})

test.describe('branschsortimentet — ingen kund startar tom', () => {
  test('alla branscher ger minst 12 artiklar', () => {
    // En artikelbank med en handfull rader känns tom och gör AI-offerten
    // tunn. Tröskeln höjdes efter att städ, flytt, vent, lås och "övrigt"
    // visat sig ligga under de andra branscherna.
    for (const branch of getSeededBranches()) {
      expect(getDefaultProducts(branch).length, `${branch} har för få artiklar`).toBeGreaterThanOrEqual(12)
    }
  })

  test('okänd bransch faller tillbaka på ett fungerande sortiment', () => {
    expect(getDefaultProducts('rymdfarkostreparation').length).toBeGreaterThan(0)
  })

  test('artikelnumren är unika inom varje bransch', () => {
    for (const branch of getSeededBranches()) {
      const skus = getDefaultProducts(branch).map(p => p.sku)
      expect(new Set(skus).size, `${branch} har dubbletter av artikelnummer`).toBe(skus.length)
    }
  })

  test('löpande arbete använder enheten tim — annars fångar inte ROT-växeln raden', () => {
    // lib/quote-calculations.ts applyGlobalRotEligibility letar efter exakt 'tim'.
    for (const branch of getSeededBranches()) {
      const hourly = getDefaultProducts(branch).filter(p => p.legacy_category === 'labor')
      expect(hourly.length, `${branch} saknar timdebiterat arbete`).toBeGreaterThan(0)
      for (const row of hourly) {
        expect(row.unit, `${branch}/${row.sku} har fel enhet`).toBe('tim')
      }
    }
  })

  test('materialrader har varken arbetsandel eller avdrag', () => {
    for (const branch of getSeededBranches()) {
      for (const row of getDefaultProducts(branch).filter(p => p.legacy_category === 'material')) {
        expect(row.labor_share, `${row.sku} har arbetsandel`).toBe(0)
        expect(row.deduction, `${row.sku} har avdragstyp`).toBeNull()
      }
    }
  })

  test('arbetsandelen ligger alltid mellan 0 och 1', () => {
    for (const branch of getSeededBranches()) {
      for (const row of getDefaultProducts(branch)) {
        expect(row.labor_share).toBeGreaterThanOrEqual(0)
        expect(row.labor_share).toBeLessThanOrEqual(1)
      }
    }
  })

  test('alla priser är positiva — en artikel på 0 kr ser ut som ett fel i offerten', () => {
    for (const branch of getSeededBranches()) {
      for (const row of getDefaultProducts(branch)) {
        expect(row.unit_price, `${row.sku} saknar pris`).toBeGreaterThan(0)
      }
    }
  })

  test('städ och flytt använder RUT, byggbranscherna ROT', () => {
    const cleaningLabor = getDefaultProducts('cleaning').find(p => p.sku === 'HM-STA-001')
    const movingLabor = getDefaultProducts('moving').find(p => p.sku === 'HM-FLY-001')
    const buildLabor = getDefaultProducts('construction').find(p => p.sku === 'HM-BYG-001')
    expect(cleaningLabor?.deduction).toBe('rut')
    expect(movingLabor?.deduction).toBe('rut')
    expect(buildLabor?.deduction).toBe('rot')
  })

  test('price_list härleds ur samma data — telefonen kan inte säga ett annat pris', () => {
    for (const branch of getSeededBranches()) {
      const products = getDefaultProducts(branch)
      const priceList = getDefaultPriceList(branch)
      expect(priceList.length).toBe(products.length)
      for (let i = 0; i < products.length; i++) {
        expect(priceList[i].name).toBe(products[i].name)
        expect(priceList[i].unit_price).toBe(products[i].unit_price)
      }
    }
  })

  test('gemensamma raderna finns i varje bransch', () => {
    for (const branch of getSeededBranches()) {
      const names = getDefaultProducts(branch).map(p => p.name)
      expect(names, `${branch} saknar framkörning`).toContain('Framkörning')
    }
  })
})
