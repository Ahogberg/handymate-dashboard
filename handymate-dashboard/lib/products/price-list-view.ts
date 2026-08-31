/**
 * Kanonisk prisliste-VY ovanpå `products` (Prisslingan V2 pass 2, B1).
 *
 * Bakgrund: legacy-tabellen `price_list` har ALDRIG innehållit en rad —
 * id-kolumnen är INTEGER med sequence medan alla insert-vägar skickade
 * TEXT-id:n, och felet svaldes tyst (sekvensen aldrig anropad, verifierat
 * i prod 2026-08-31). Widget-chatten, publika storefronten, storefront-
 * genereringen, ekonomi-agentens kontext och godkännandeköns AI-offert har
 * därför varit PRISLÖSA sedan dag ett. Tabellen droppas i pass 5 (v18x);
 * alla läsare går nu genom denna vy i stället.
 *
 * Regler:
 * - `sales_price > 0` är OBLIGATORISKT här: 74,6 % av artiklarna är
 *   designat prislösa ("osatt", lib/products/pricing-state.ts) och får
 *   ALDRIG visas som "0 kr" i kundvända ytor. Interna agent-ytor som vill
 *   se prislösa (märkta) använder INTE denna vy.
 * - Kategorimappning till legacy-formen (labor/material/service) görs här,
 *   EN gång, för konsumenter byggda mot price_list-formen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PublicPriceRow {
  id: string
  name: string
  unit: string
  unit_price: number
  /** Legacy-kategoriform: 'labor' | 'material' | 'service'. */
  category: string
}

/** products.category (kanonisk, v88) → legacy price_list-kategori. */
export function toLegacyCategory(category: string | null | undefined): 'labor' | 'material' | 'service' {
  if (category === 'arbete') return 'labor'
  if (category === 'material') return 'material'
  return 'service' // hyra/övrigt/okänt
}

export async function getPublicPriceList(
  supabase: SupabaseClient,
  businessId: string,
  opts: {
    limit?: number
    /** true → bara arbete (storefrontens "Priser"-sektion). */
    onlyLabor?: boolean
  } = {},
): Promise<PublicPriceRow[]> {
  let query = supabase
    .from('products')
    .select('id, name, unit, sales_price, category')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .gt('sales_price', 0)
  if (opts.onlyLabor) query = query.eq('category', 'arbete')
  const { data, error } = await query
    .order('is_favorite', { ascending: false })
    .order('name')
    .limit(opts.limit ?? 50)

  if (error) throw error
  return (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    unit_price: Number(p.sales_price),
    category: toLegacyCategory(p.category),
  }))
}
