/**
 * Facit-tester för produktkopplingens SÖM (etapp B1, 2026-08-06).
 *
 * ═══ VAD SOM VAKTAS HÄR ═══
 *
 * Handtagen ([P1], [P2] …) numreras på TVÅ ställen: i buildPriceContext när
 * prislistan skrivs in i prompten, och i generateQuoteFromInput när svaret
 * matchas tillbaka. Går de isär med bara ett steg pekar varje handtag på FEL
 * artikel — och eftersom hallucinationsvakten kräver namnöverlapp skulle det
 * mesta då tyst falla tillbaka på namnmatchning i stället för att larma.
 * Felet vore alltså osynligt: offerten ser rätt ut, men kopplingarna är fel
 * eller saknas.
 *
 * Testet läser handtagen ur den FAKTISKA prompttexten och kontrollerar att de
 * pekar på samma artikel som matchningen tror. Det är den enda kontroll som
 * kan fånga en off-by-one mellan de två filerna.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/ai-quote-product-linking.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { buildPriceContext, type PriceListItem } from '../lib/ai-quote-generator'
import { matchGeneratedItem, type MatchableProduct } from '../lib/products/match-generated-items'
import { generatedQuoteToQuoteItems } from '../lib/quotes/generated-to-quote-items'

const PRICE_LIST: PriceListItem[] = [
  { id: 'p-alpha', name: 'Fönsterbyte 2-glas', unit: 'st', unit_price: 1850, category: 'Snickeri' },
  { id: 'p-beta', name: 'Rivning badrum', unit: 'tim', unit_price: 650, category: 'Rivning' },
  { id: 'p-gamma', name: 'Kakelsättning vägg', unit: 'm2', unit_price: 950, category: 'Kakel' },
  { id: 'p-delta', name: 'Fogning våtrum', unit: 'm2', unit_price: 420, category: 'Kakel' },
]

/** Plockar ut { handle → artikelnamn } ur den genererade prompttexten. */
function handlesInPrompt(prompt: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const line of prompt.split('\n')) {
    const m = line.match(/\[(P\d+)\]\s+(.+?):\s/)
    if (m) found.set(m[1], m[2])
  }
  return found
}

test.describe('handtagen i prompten', () => {
  test('varje artikel med id får ett handtag', () => {
    const handles = handlesInPrompt(buildPriceContext(PRICE_LIST, 650))
    expect(handles.size).toBe(PRICE_LIST.length)
  })

  test('OFF-BY-ONE-VAKTEN: handtag Pn pekar på artikeln med index n-1', () => {
    // Det här är hela poängen med filen. Kategorigrupperingen i
    // buildPriceContext skriver ut artiklarna i en ANNAN ordning än
    // inmatningslistan (Kakel-artiklarna hamnar tillsammans), så numreringen
    // MÅSTE följa inmatningsindexet och inte utskriftsordningen.
    const handles = handlesInPrompt(buildPriceContext(PRICE_LIST, 650))
    PRICE_LIST.forEach((product, index) => {
      expect(handles.get(`P${index + 1}`)).toBe(product.name)
    })
  })

  test('handtagen förklaras för modellen — annars ekas de aldrig tillbaka', () => {
    expect(buildPriceContext(PRICE_LIST, 650)).toContain('productRef')
  })

  test('UX1d: prislösa artiklar får handtag men ALDRIG "0 kr" i prompten', () => {
    const medPrislos: PriceListItem[] = [
      ...PRICE_LIST,
      { id: 'p-epsilon', name: 'Installation utomhusbelysning', unit: 'st', unit_price: 0, category: 'El' },
    ]
    const prompt = buildPriceContext(medPrislos, 650)
    // Handtaget finns (länkningen är poängen) — index 5 → P5
    expect(prompt).toContain('[P5] Installation utomhusbelysning')
    // ...men aldrig som ett pris
    expect(prompt).not.toContain('Installation utomhusbelysning: 0 kr')
    // ...och i ett eget block med gissa-aldrig-instruktionen
    expect(prompt).toContain('ARTIKLAR UTAN SATT PRIS')
    expect(prompt).toContain('Gissa ALDRIG')
    // Prissatta handtag är opåverkade (ingen indexförskjutning)
    const handles = handlesInPrompt(prompt)
    PRICE_LIST.forEach((product, index) => {
      expect(handles.get(`P${index + 1}`)).toBe(product.name)
    })
  })

  test('D1: kundprislista är ett ÖVERLÄGG — handtagen skrivs ÄNDÅ', () => {
    // Tidigare ERSATTE kundlistan hela produktbanken: [P#] skickades aldrig
    // och produktkopplingen förlorades exakt för kunder MED prislista.
    const prompt = buildPriceContext(PRICE_LIST, 650, undefined, {
      name: 'Bees kundlista',
      hourly_rate_normal: 795,
      items: [{ name: 'Specialtimme', price: 795, unit: 'tim' }],
    })
    expect(prompt).toContain('KUNDSPECIFIK PRISLISTA')
    expect(prompt).toContain('Specialtimme: 795 kr/tim')
    // ...och produktbanken med intakta handtag följer alltid med:
    const handles = handlesInPrompt(prompt)
    PRICE_LIST.forEach((product, index) => {
      expect(handles.get(`P${index + 1}`)).toBe(product.name)
    })
    expect(prompt).toContain('productRef')
  })

  test('prislista UTAN id får inga handtag och ingen instruktion om dem', () => {
    // Äldre anropare (app/api/quotes/generate) skickar bara namn och pris.
    // Att då be modellen ange ett handtag hade varit en instruktion den inte
    // kan följa — den skulle gissa.
    const withoutIds = PRICE_LIST.map(({ id, ...rest }) => rest)
    const prompt = buildPriceContext(withoutIds, 650)
    expect(handlesInPrompt(prompt).size).toBe(0)
    expect(prompt).not.toContain('productRef')
    // Priserna måste fortfarande vara med — annars har vi tystat prislistan.
    expect(prompt).toContain('Fönsterbyte 2-glas')
    expect(prompt).toContain('1850')
  })
})

test.describe('handtaget hela vägen: prompt → svar → koppling', () => {
  const products: MatchableProduct[] = PRICE_LIST.map(p => ({
    id: p.id!, name: p.name, unit: p.unit, category: p.category,
  }))
  const handles = new Map<string, MatchableProduct>()
  PRICE_LIST.forEach((p, i) => handles.set(`P${i + 1}`, products[i]))

  test('handtaget modellen läste i prompten leder till rätt artikel', () => {
    const promptHandles = handlesInPrompt(buildPriceContext(PRICE_LIST, 650))
    // Simulerar modellen: den läser [P3] Kakelsättning vägg och ekar "P3".
    const [handle, name] = Array.from(promptHandles.entries())[2]
    const result = matchGeneratedItem(
      { description: name, unit: 'm2', productRef: handle },
      products,
      handles,
    )
    expect(result?.productId).toBe('p-gamma')
    expect(result?.matchType).toBe('handle')
  })

  test('två snarlika artiklar i samma kategori blandas inte ihop', () => {
    // "Kakelsättning vägg" och "Fogning våtrum" ligger båda under Kakel i m2.
    // Utan korrekt handtag hade fuzzy-steget kunnat välja fel.
    expect(
      matchGeneratedItem({ description: 'Fogning våtrum', unit: 'm2', productRef: 'P4' }, products, handles)?.productId,
    ).toBe('p-delta')
  })
})

test.describe('kopplingen överlever in i den sparade raden', () => {
  test('linkedProductId blir linked_product_id på quote_items', () => {
    // Godkännande-kön går inte genom klientens applyProductToItem utan genom
    // den här rena mappningen. Tappas fältet här blir en godkänd AI-offert
    // lika tom under ytan som före B1.
    const rows = generatedQuoteToQuoteItems(
      [
        { description: 'Fönsterbyte 2-glas', quantity: 12, unit: 'st', unitPrice: 1850, type: 'material', linkedProductId: 'p-alpha' },
        { description: 'Okänd rad', quantity: 1, unit: 'st', unitPrice: 0, type: 'material', linkedProductId: null },
      ],
      [],
      'rot',
    )
    expect(rows[0].linked_product_id).toBe('p-alpha')
    expect(rows[1].linked_product_id).toBeUndefined()
  })

  test('tillvalsrader bär också sin koppling', () => {
    const rows = generatedQuoteToQuoteItems(
      [{ description: 'Grundrad', quantity: 1, unit: 'st', unitPrice: 100, type: 'material' }],
      [{ description: 'Rivning badrum', quantity: 4, unit: 'tim', unitPrice: 650, type: 'labor', linkedProductId: 'p-beta' }],
      'rot',
    )
    const option = rows.find(r => r.item_type === 'option')
    expect(option?.linked_product_id).toBe('p-beta')
  })

  test('en rad utan koppling får INTE fältet satt till något falskt', () => {
    // Ett tomt eller felaktigt linked_product_id är värre än inget: nedströms
    // kod som slår upp produkten skulle då få en miss den tolkar som data.
    const rows = generatedQuoteToQuoteItems(
      [{ description: 'Rad utan match', quantity: 1, unit: 'st', unitPrice: 0, type: 'material' }],
      [],
      'none',
    )
    expect('linked_product_id' in rows[0]).toBe(false)
  })
})
