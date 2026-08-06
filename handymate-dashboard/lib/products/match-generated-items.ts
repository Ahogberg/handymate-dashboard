/**
 * Kopplar AI-genererade offertrader till artiklar i produktbanken.
 *
 * ═══ VARFÖR DEN HÄR FUNKTIONEN BEHÖVS ═══
 *
 * AI-genererade rader fick aldrig `linked_product_id`. Utan den finns ingen
 * komponent-snapshot, ingen arbetsandel, ingen ROT-split och inget inköpspris.
 * Följderna märks långt nedströms: marginalkortet kan inte räkna, ROT-avdraget
 * måste sättas för hand, och reservationsmotorn — som matchar på produkt och
 * kategori — kan knappt trigga alls på en AI-byggd offert. Utkastet såg klart
 * ut men var tomt under ytan.
 *
 * ═══ VARFÖR HANDTAG ISTÄLLET FÖR UUID I PROMPTEN ═══
 *
 * Modellen får korta handtag ([P1], [P2] …) i prislistekontexten i stället för
 * produkternas UUID. Tre skäl: UUID:er slösar tokens, de är lätta för en modell
 * att skriva av fel på en siffra, och ett felskrivet UUID ser giltigt ut medan
 * ett handtag utanför intervallet omedelbart går att avvisa. Handtagen är
 * lokala för ETT anrop och betyder ingenting utanför det.
 *
 * ═══ DEN VIKTIGASTE REGELN: HELLRE MISSA ÄN GISSA ═══
 *
 * En falsk positiv är värre än en miss. Missar vi förblir raden precis som
 * idag — "PRIS SAKNAS", hantverkaren fyller i den. Kopplar vi FEL produkt
 * ärver raden fel inköpspris, fel arbetsandel och fel ROT-flagga, och allt
 * det ser korrekt ut i gränssnittet. Hantverkaren har ingen anledning att
 * misstänka något förrän marginalen är fel på fakturan.
 *
 * Därför är varje väg in hårt vaktad:
 *   1. Handtag  — accepteras BARA om det finns OCH namnen överlappar. Ett
 *                 handtag som pekar på "Fönsterbyte" när raden heter
 *                 "Rivning kök" är en hallucination, inte en träff.
 *   2. Exakt    — normaliserat namn identiskt.
 *   3. Fuzzy    — token-överlapp över tröskel OCH samma enhetsfamilj. En
 *                 rad i timmar kopplas aldrig till en artikel i kvadratmeter,
 *                 hur lika namnen än är.
 *   Ingen träff → null. Raden lämnas orörd.
 *
 * Ren funktion — facit-testad i tests/match-generated-items.spec.ts.
 */

export interface MatchableProduct {
  id: string
  name: string
  unit: string
  category?: string | null
}

export interface MatchableItem {
  description: string
  unit: string
  /** Handtaget modellen påstod sig ha använt, t.ex. "P3" eller "[P3]". */
  productRef?: string | null
}

export type MatchType = 'handle' | 'exact' | 'fuzzy'

export interface ProductMatch {
  productId: string
  matchType: MatchType
  /** 0–1. Loggas så träffkvaliteten kan mätas innan tröskeln släpps lös. */
  score: number
}

/**
 * Enhetsfamiljer. Två artiklar i olika familjer är olika saker även när de
 * heter nästan samma — "Fönsterbyte" som timrad och "Fönsterbyte" som styckpris
 * är inte utbytbara, och att koppla ihop dem ger fel kvantitet i offerten.
 */
const UNIT_FAMILIES: Record<string, string> = {
  tim: 'time', timmar: 'time', timme: 'time', h: 'time', tim2: 'time',
  st: 'each', styck: 'each', stk: 'each',
  m2: 'area', 'm²': 'area', kvm: 'area',
  m: 'length', lpm: 'length', löpm: 'length', meter: 'length',
  m3: 'volume', 'm³': 'volume',
  kg: 'weight', ton: 'weight',
  l: 'volume_l', liter: 'volume_l',
}

/** Ord som inte bär betydelse och därför inte får skapa falsk likhet. */
const STOPWORDS = new Set([
  'och', 'eller', 'med', 'utan', 'för', 'av', 'på', 'i', 'till', 'per',
  'ett', 'en', 'the', 'inkl', 'exkl', 'ca', 'st', 'arbete', 'material',
])

/** Under detta token-överlapp litar vi inte på en fuzzy-träff. */
export const FUZZY_THRESHOLD = 0.6

export function unitFamily(unit: string | null | undefined): string | null {
  if (!unit) return null
  const key = unit.trim().toLowerCase().replace(/\./g, '')
  return UNIT_FAMILIES[key] ?? key ?? null
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(name: string | null | undefined): string[] {
  return normalizeName(name)
    .split(' ')
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

/**
 * Token-överlapp (Jaccard). Tom mängd på någon sida ger 0 — en rad som bara
 * består av stoppord får aldrig matcha något.
 */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  Array.from(ta).forEach(t => { if (tb.has(t)) shared++ })
  const union = ta.size + tb.size - shared
  return union === 0 ? 0 : shared / union
}

/**
 * Ger varje produkt ett kort handtag (P1, P2 …) för prompt-kontexten.
 * Ordningen är anroparens och måste vara densamma när matchningen körs —
 * därför byggs handtagen EN gång och skickas med till båda stegen.
 */
export function buildProductHandles(products: MatchableProduct[]): Map<string, MatchableProduct> {
  const map = new Map<string, MatchableProduct>()
  products.forEach((product, index) => {
    map.set(`P${index + 1}`, product)
  })
  return map
}

/** Plockar ut "P3" ur "P3", "[P3]", "p3" eller "[P3] Fönsterbyte". */
function parseHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = String(raw).match(/p\s*(\d+)/i)
  return match ? `P${match[1]}` : null
}

/**
 * Matchar EN rad. Exporterad för att kunna facit-testas isolerat — det här är
 * den del av motorn där ett fel är dyrast och därför måste vara lättast att
 * pröva.
 */
export function matchGeneratedItem(
  item: MatchableItem,
  products: MatchableProduct[],
  handles: Map<string, MatchableProduct>,
): ProductMatch | null {
  if (!item.description || products.length === 0) return null

  const itemFamily = unitFamily(item.unit)

  // ── 1. Handtaget modellen påstår sig ha använt ────────────────────
  const handle = parseHandle(item.productRef)
  if (handle) {
    const candidate = handles.get(handle)
    if (candidate) {
      // HALLUCINATIONSVAKTEN. Modellen kan skriva [P7] på en rad som inte har
      // något med produkt 7 att göra — den har sett listan men associerar fel.
      // Utan namnkontrollen vore handtaget bara ett sätt att göra en gissning
      // svårare att upptäcka.
      const similarity = tokenSimilarity(item.description, candidate.name)
      if (similarity > 0) {
        return { productId: candidate.id, matchType: 'handle', score: similarity }
      }
    }
    // Ogiltigt handtag eller namnkrock: vi litar inte på raden längre, men vi
    // ger den ändå chansen att träffa på eget namn nedan.
  }

  // ── 2. Exakt namnmatch ────────────────────────────────────────────
  const normalized = normalizeName(item.description)
  if (normalized) {
    const exact = products.find(p => normalizeName(p.name) === normalized)
    if (exact) return { productId: exact.id, matchType: 'exact', score: 1 }
  }

  // ── 3. Fuzzy, men bara inom samma enhetsfamilj ────────────────────
  let best: { product: MatchableProduct; score: number } | null = null
  for (const product of products) {
    if (itemFamily && unitFamily(product.unit) !== itemFamily) continue
    const score = tokenSimilarity(item.description, product.name)
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = { product, score }
    }
  }
  // Oavgjort mellan två artiklar är inte en träff — då vet vi inte vilken, och
  // att välja den första är att gissa.
  if (best) {
    const tied = products.filter(
      p =>
        p.id !== best!.product.id &&
        (!itemFamily || unitFamily(p.unit) === itemFamily) &&
        tokenSimilarity(item.description, p.name) === best!.score,
    )
    if (tied.length === 0) {
      return { productId: best.product.id, matchType: 'fuzzy', score: best.score }
    }
  }

  return null
}

/**
 * Matchar en hel radlista. Returnerar en map från radindex till träff —
 * omatchade rader saknas helt i mappen, aldrig som null-värde, så anroparen
 * inte kan råka behandla "ingen träff" som en träff.
 */
export function matchGeneratedItems(
  items: MatchableItem[],
  products: MatchableProduct[],
): Map<number, ProductMatch> {
  const handles = buildProductHandles(products)
  const result = new Map<number, ProductMatch>()
  items.forEach((item, index) => {
    const match = matchGeneratedItem(item, products, handles)
    if (match) result.set(index, match)
  })
  return result
}

/**
 * Prislisteraden som den visas för modellen, med handtag.
 * Hålls här — inte i prompten — så att formatet och parsningen aldrig kan
 * glida isär.
 */
export function formatProductForPrompt(handle: string, product: MatchableProduct, price: number): string {
  return `[${handle}] ${product.name}: ${price} kr/${product.unit}`
}
