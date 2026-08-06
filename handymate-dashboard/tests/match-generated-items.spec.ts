/**
 * Facit-tester för produktmatchningen (etapp B1, 2026-08-06).
 *
 * Det som testas hårdast är inte träffarna utan MISSARNA. En falsk positiv
 * kopplar fel artikel till en rad, och raden ärver då fel inköpspris, fel
 * arbetsandel och fel ROT-flagga — allt osynligt i gränssnittet. Hantverkaren
 * upptäcker det först när marginalen är fel på fakturan. En miss däremot syns
 * direkt: raden står kvar med "PRIS SAKNAS".
 *
 * Körs utan browser/session:
 *   npx playwright test tests/match-generated-items.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  matchGeneratedItem,
  matchGeneratedItems,
  buildProductHandles,
  tokenSimilarity,
  unitFamily,
  normalizeName,
  FUZZY_THRESHOLD,
  type MatchableProduct,
} from '../lib/products/match-generated-items'

const PRODUCTS: MatchableProduct[] = [
  { id: 'prod-1', name: 'Fönsterbyte 2-glas', unit: 'st', category: 'Snickeri' },
  { id: 'prod-2', name: 'Rivning badrum', unit: 'tim', category: 'Rivning' },
  { id: 'prod-3', name: 'Kakelsättning vägg', unit: 'm2', category: 'Kakel' },
  { id: 'prod-4', name: 'Snickare timpris', unit: 'tim', category: 'Arbete' },
  { id: 'prod-5', name: 'Småmaterial', unit: 'st', category: 'Övrigt' },
]

const match = (item: { description: string; unit: string; productRef?: string | null }) =>
  matchGeneratedItem(item, PRODUCTS, buildProductHandles(PRODUCTS))

test.describe('handtaget — modellens egen referens', () => {
  test('giltigt handtag med namnöverlapp träffar', () => {
    const result = match({ description: 'Fönsterbyte 2-glas', unit: 'st', productRef: 'P1' })
    expect(result?.productId).toBe('prod-1')
    expect(result?.matchType).toBe('handle')
  })

  test('handtaget tolkas oavsett format modellen råkar skriva', () => {
    for (const ref of ['P1', '[P1]', 'p1', '[P1] Fönsterbyte 2-glas']) {
      expect(match({ description: 'Fönsterbyte 2-glas', unit: 'st', productRef: ref })?.productId)
        .toBe('prod-1')
    }
  })

  test('HALLUCINATION: handtag som pekar på fel artikel avvisas', () => {
    // Modellen skriver [P1] (Fönsterbyte) på en rad om rivning. Utan
    // namnkontrollen hade raden ärvt fönstrets pris och ROT-flagga.
    const result = match({ description: 'Rivning badrum', unit: 'tim', productRef: 'P1' })
    expect(result?.productId).not.toBe('prod-1')
  })

  test('en hallucination faller tillbaka på radens EGET namn, inte på ingenting', () => {
    // Samma rad som ovan: handtaget var fel, men beskrivningen är exakt en
    // artikel i banken. Att straffa raden för modellens misstag vore fel.
    const result = match({ description: 'Rivning badrum', unit: 'tim', productRef: 'P1' })
    expect(result?.productId).toBe('prod-2')
    expect(result?.matchType).toBe('exact')
  })

  test('handtag utanför intervallet avvisas', () => {
    expect(match({ description: 'Något helt annat här', unit: 'st', productRef: 'P99' })).toBeNull()
  })

  test('påhittat handtagsformat kraschar inte', () => {
    for (const ref of ['', '   ', 'okänt', '[]', 'PP', null, undefined]) {
      expect(() => match({ description: 'Något helt annat här', unit: 'st', productRef: ref })).not.toThrow()
    }
  })
})

test.describe('exakt namnmatch', () => {
  test('normaliserat namn räcker — versaler och skiljetecken spelar ingen roll', () => {
    expect(match({ description: 'FÖNSTERBYTE, 2-GLAS!', unit: 'st' })?.productId).toBe('prod-1')
    expect(match({ description: 'FÖNSTERBYTE, 2-GLAS!', unit: 'st' })?.matchType).toBe('exact')
  })

  test('exakt namn vinner över enhetsfamiljen', () => {
    // Om namnen är identiska är det samma artikel även om AI:n gissat fel
    // enhet — enhetsfamiljen finns för att bromsa FUZZY-gissningar.
    expect(match({ description: 'Kakelsättning vägg', unit: 'st' })?.productId).toBe('prod-3')
  })
})

test.describe('fuzzy — bara inom samma enhetsfamilj', () => {
  test('ENHETSKROCK avvisar en annars stark namnlikhet', () => {
    // "Kakelsättning väggar badrum" liknar prod-3 starkt, men raden är i
    // timmar och artikeln i m2. Att koppla ihop dem hade gett fel kvantitet.
    const result = match({ description: 'Kakelsättning väggar', unit: 'tim' })
    expect(result?.productId).not.toBe('prod-3')
  })

  test('samma enhetsfamilj med olika skrivsätt räknas som samma', () => {
    expect(unitFamily('timmar')).toBe(unitFamily('tim'))
    expect(unitFamily('m²')).toBe(unitFamily('m2'))
    expect(unitFamily('ST')).toBe(unitFamily('st'))
  })

  test('svag likhet under tröskeln avvisas', () => {
    expect(tokenSimilarity('Rivning badrum', 'Kakelsättning vägg')).toBeLessThan(FUZZY_THRESHOLD)
    expect(match({ description: 'Diskmaskinsinstallation kök', unit: 'st' })).toBeNull()
  })

  test('oavgjort mellan två artiklar är INTE en träff', () => {
    // Två identiska namn i samma enhetsfamilj: vi vet inte vilken som avses,
    // och att ta den första är att gissa.
    const tied: MatchableProduct[] = [
      { id: 'a', name: 'Målning vägg', unit: 'm2' },
      { id: 'b', name: 'Målning vägg', unit: 'm2' },
    ]
    const result = matchGeneratedItem(
      { description: 'Målning väggar invändigt', unit: 'm2' },
      tied,
      buildProductHandles(tied),
    )
    expect(result).toBeNull()
  })
})

test.describe('inget att matcha mot', () => {
  test('tom produktbank ger null, aldrig en krasch', () => {
    expect(matchGeneratedItem({ description: 'Fönsterbyte 2-glas', unit: 'st' }, [], new Map())).toBeNull()
  })

  test('tom beskrivning ger null', () => {
    expect(match({ description: '', unit: 'st' })).toBeNull()
  })

  test('en rad som bara består av stoppord matchar aldrig', () => {
    // "Arbete och material" innehåller inga betydelsebärande ord. Utan
    // stoppordsfiltret hade den kunnat få hög likhet mot vad som helst.
    expect(match({ description: 'Arbete och material', unit: 'st' })).toBeNull()
  })

  test('korta ordfragment skapar ingen likhet', () => {
    expect(tokenSimilarity('ab cd', 'ab cd ef')).toBe(0)
  })
})

test.describe('matchGeneratedItems — hela listan', () => {
  test('bara träffar finns i mappen; missar saknas helt', () => {
    const result = matchGeneratedItems(
      [
        { description: 'Fönsterbyte 2-glas', unit: 'st', productRef: 'P1' },
        { description: 'Något vi aldrig sålt', unit: 'st' },
        { description: 'Rivning badrum', unit: 'tim' },
      ],
      PRODUCTS,
    )
    expect(result.size).toBe(2)
    expect(result.has(1)).toBe(false)   // ingen null-post för missen
    expect(result.get(0)?.productId).toBe('prod-1')
    expect(result.get(2)?.productId).toBe('prod-2')
  })

  test('index bevaras även när första raden missar', () => {
    const result = matchGeneratedItems(
      [
        { description: 'Okänd rad utan motsvarighet', unit: 'st' },
        { description: 'Småmaterial', unit: 'st' },
      ],
      PRODUCTS,
    )
    expect(result.get(1)?.productId).toBe('prod-5')
  })

  test('handtagen följer produktordningen som skickades in', () => {
    const handles = buildProductHandles(PRODUCTS)
    expect(handles.get('P1')?.id).toBe('prod-1')
    expect(handles.get('P5')?.id).toBe('prod-5')
    expect(handles.get('P6')).toBeUndefined()
  })
})

test.describe('normalisering', () => {
  test('svenska tecken bevaras — å/ä/ö får inte strippas som skiljetecken', () => {
    expect(normalizeName('Fönster & Dörrar')).toBe('fönster dörrar')
    expect(normalizeName('Målning, invändigt')).toBe('målning invändigt')
  })
})
