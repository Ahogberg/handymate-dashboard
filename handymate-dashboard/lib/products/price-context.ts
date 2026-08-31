/**
 * Agenternas priskontext — EN källa (Prisslingan V2 pass 4, UX3a).
 *
 * Skillnaden mot lib/products/price-list-view.ts (kundvända ytor) är
 * MEDVETEN: den vyn filtrerar bort prislösa (en widget kan inte säga "Sätt
 * pris"), medan INTERNA agenter ska SE de prislösa — märkta — så de kan
 * använda artikelnamnet och länka raden utan att någonsin hitta på ett pris.
 * Samma princip som AI-promptens UX1d-block.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PriceContextProduct {
  id: string
  name: string
  sku: string | null
  unit: string
  sales_price: number
  category: string | null
}

/**
 * Exakt samma urval som app/api/quotes/ai-generate använder (favoriter
 * först, aktiva, limit 100) — refaktorerad hit så offert-AI:n och
 * agenterna aldrig kan glida isär om vilka artiklar som "finns".
 */
export async function fetchPriceContextProducts(
  supabase: SupabaseClient,
  businessId: string,
): Promise<PriceContextProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, unit, sales_price, category')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('is_favorite', { ascending: false })
    .order('name')
    .limit(100)
  if (error) throw error
  return (data || []) as PriceContextProduct[]
}

/**
 * Promptblock för agent-systemprompter (Matte-chatten, intent-agenten).
 * Prissatta med pris; prislösa listade MEN märkta — gissa aldrig.
 */
export function buildAgentPriceBlock(
  products: PriceContextProduct[],
  hourlyRate?: number | null,
): string {
  const rader: string[] = []
  const prissatta = products.filter(p => Number(p.sales_price) > 0)
  const prislosa = products.filter(p => !(Number(p.sales_price) > 0))

  rader.push('HANTVERKARENS PRISLISTA:')
  if (hourlyRate && hourlyRate > 0) rader.push(`Standard timpris: ${hourlyRate} kr/tim`)
  if (prissatta.length > 0) {
    for (const p of prissatta) rader.push(`- ${p.name}: ${p.sales_price} kr/${p.unit}`)
  } else {
    rader.push('(inga prissatta artiklar än)')
  }
  if (prislosa.length > 0) {
    rader.push('')
    rader.push('ARTIKLAR UTAN SATT PRIS (finns i registret — pris sätts av hantverkaren):')
    for (const p of prislosa) rader.push(`- ${p.name} (${p.unit}) — pris ej satt`)
  }
  rader.push('')
  rader.push('PRISREGEL: Ange ALDRIG ett pris som inte står i listan ovan. För artiklar utan satt pris: använd namnet men säg att priset sätts av hantverkaren — gissa aldrig.')
  return rader.join('\n')
}

/**
 * Exakt namnmatch (case-okänslig, trimmad) — för tool-routerns create_quote
 * så agentens rader får linked_product_id + article_number när namnet
 * träffar banken. Rör ALDRIG radens pris (hantverkaren granskar utkastet).
 */
export function matchProductByName(
  products: PriceContextProduct[],
  name: string | null | undefined,
): PriceContextProduct | null {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return null
  return products.find(p => p.name.trim().toLowerCase() === n) || null
}
