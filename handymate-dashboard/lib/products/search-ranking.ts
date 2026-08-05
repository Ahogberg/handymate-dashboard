/**
 * Sökhjälp för produktbanken — synonymer och träffrankning.
 *
 * Bakgrund (kartläggning 2026-08-05): sökningen var en ren `ilike %hela
 * söksträngen%` utan rankning, så "fasad mål" gav noll träffar mot
 * "Fasadmålning" och en exakt träff kunde hamna under en slumpmässig
 * substrängmatchning. Tokeniseringen löser ordföljden (app/api/products/route.ts);
 * det här löser ORDVALET och ORDNINGEN.
 *
 * Rena funktioner — facit-testade i tests/product-search.spec.ts.
 */

/**
 * Ord hantverkare skriver vs ord artiklar heter. Symmetriskt: varje par
 * expanderas åt båda hållen, så det spelar ingen roll vilket ord man skriver.
 * Håll listan kort och verklighetsnära — en synonym som är fel oftare än rätt
 * gör sökningen sämre, inte bättre.
 */
const SYNONYM_GROUPS: string[][] = [
  ['eluttag', 'vägguttag', 'uttag'],
  ['strömbrytare', 'brytare', 'strömställare'],
  ['lampa', 'armatur', 'belysning'],
  ['spot', 'spotlight', 'downlight'],
  ['laddbox', 'laddstolpe', 'elbilsladdare'],
  ['elcentral', 'proppskåp', 'säkringsskåp'],
  ['blandare', 'kran', 'vattenkran'],
  ['wc', 'toalett', 'toastol', 'toalettstol'],
  ['handfat', 'tvättställ'],
  ['varmvattenberedare', 'beredare', 'vvb'],
  ['golvbrunn', 'brunn'],
  ['tätskikt', 'tätskiktsmatta', 'membran'],
  ['kakel', 'klinker', 'plattsättning'],
  ['parkett', 'trägolv'],
  ['laminat', 'laminatgolv'],
  ['gips', 'gipsskiva'],
  ['regel', 'reglar'],
  ['trall', 'trädäck', 'altangolv'],
  ['fasadmålning', 'fasadmåleri'],
  ['tapet', 'tapetsering'],
  ['spackel', 'spackling'],
  ['takpanna', 'betongpanna', 'tegelpanna'],
  ['hängränna', 'ränna', 'takränna'],
  ['stuprör', 'nedlöp'],
  ['värmepump', 'luftvärmepump'],
  ['ventilation', 'ftx', 'aggregat'],
  ['köksfläkt', 'fläkt', 'spisfläkt'],
  ['cylinder', 'låscylinder'],
  ['säkerhetsdörr', 'ytterdörr'],
  ['städ', 'städning', 'lokalvård'],
  ['flyttstäd', 'utflyttsstäd'],
  ['häck', 'häckklippning'],
  ['gräs', 'gräsklippning', 'gräsmatta'],
  ['framkörning', 'resa', 'resekostnad'],
  ['bortforsling', 'borttransport', 'avfall'],
]

/** token → alla ord i dess synonymgrupp (inklusive token självt). */
const SYNONYM_INDEX: Record<string, string[]> = (() => {
  const index: Record<string, string[]> = {}
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) index[word] = group
  }
  return index
})()

/**
 * Expanderar ett sökord till sina synonymer. Okända ord returneras oförändrade
 * som en ensam kandidat, så anroparen alltid kan behandla svaret likadant.
 */
export function expandSynonyms(token: string): string[] {
  const normalized = token.trim().toLowerCase()
  if (!normalized) return []
  return SYNONYM_INDEX[normalized] || [normalized]
}

export interface RankableProduct {
  name: string
  sku?: string | null
  is_favorite?: boolean | null
}

/**
 * Poängsätter hur väl en produkt matchar söksträngen. Högre är bättre.
 *
 * Ordningen som eftersträvas: exakt namn > namnet börjar med söksträngen >
 * ett ORD i namnet börjar med den > artikelnummer > substräng var som helst.
 * Favoriter får en liten knuff, men slår aldrig en bättre textträff — annars
 * hamnar fel artikel överst så fort hantverkaren stjärnmärkt några.
 */
export function scoreProductMatch(product: RankableProduct, search: string): number {
  const q = search.trim().toLowerCase()
  if (!q) return 0

  const name = (product.name || '').toLowerCase()
  const sku = (product.sku || '').toLowerCase()

  let score = 0
  if (name === q) score = 100
  else if (name.startsWith(q)) score = 80
  else if (new RegExp(`\\b${escapeRegex(q)}`).test(name)) score = 60
  else if (sku && (sku === q || sku.startsWith(q))) score = 50
  else if (name.includes(q)) score = 30
  else if (sku.includes(q)) score = 20
  else {
    // Ingen sammanhängande träff — värdera hur många av orden som finns.
    const tokens = q.split(/\s+/).filter(Boolean)
    const hits = tokens.filter(t => name.includes(t)).length
    score = tokens.length > 0 ? Math.round((hits / tokens.length) * 15) : 0
  }

  if (product.is_favorite) score += 5
  return score
}

/**
 * Sorterar träffar efter matchkvalitet. Mutationsfri — returnerar en ny array.
 * Vid lika poäng behålls inbördes ordning (namnsorteringen från databasen).
 */
export function rankBySearchMatch<T extends RankableProduct>(products: T[], search: string): T[] {
  if (!search.trim()) return products
  return products
    .map((product, index) => ({ product, index, score: scoreProductMatch(product, search) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.product)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
