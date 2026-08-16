import type { SupabaseClient } from '@supabase/supabase-js'

export interface PriceListSyncFields {
  name?: string
  unit?: string
  unit_price?: number
  is_active?: boolean
}

/**
 * Skriver-igenom en produktändring till dess price_list-motsvarighet
 * (sql/v137_price_list_product_link.sql). Best-effort: loggar men kastar
 * ALDRIG — anroparen (PUT/DELETE /api/products) får aldrig ett trasigt
 * sparande på grund av en price_list-miss.
 *
 * Matchar i första hand på product_id (seedat från och med v137). Rader
 * seedade FÖRE migrationen har product_id=NULL — faller tillbaka på
 * (business_id, name)-matchning när ett `matchNameFallback` skickas in
 * (bara PUT gör det, se anropet i app/api/products/route.ts). Ändras
 * produktens NAMN i samma anrop matchar fallbacken inte längre mot den
 * gamla price_list-raden — ett känt, accepterat gap för konton som
 * seedades innan länken fanns (ingen retroaktiv backfill, se planen).
 *
 * Synkar aldrig products.category → price_list.category: mappningen är
 * inte 1:1 (samma products-kategori kan vara olika legacy_category
 * beroende på artikel, se lib/product-defaults.ts) — kategorin sätts en
 * gång vid seedning och rörs inte här.
 */
export async function syncPriceListRow(
  supabase: SupabaseClient,
  businessId: string,
  productId: string,
  updates: PriceListSyncFields,
  matchNameFallback?: string,
): Promise<void> {
  if (Object.keys(updates).length === 0) return

  try {
    const { data: byId, error: byIdError } = await supabase
      .from('price_list')
      .update(updates)
      .eq('business_id', businessId)
      .eq('product_id', productId)
      .select('id')

    if (byIdError) {
      console.error('[sync-price-list] product_id-matchning misslyckades:', businessId, productId, byIdError.message)
      return
    }
    if ((byId && byId.length > 0) || !matchNameFallback) return

    const { error: byNameError } = await supabase
      .from('price_list')
      .update(updates)
      .eq('business_id', businessId)
      .is('product_id', null)
      .eq('name', matchNameFallback)

    if (byNameError) {
      console.error('[sync-price-list] namnmatchning misslyckades:', businessId, matchNameFallback, byNameError.message)
    }
  } catch (err) {
    console.error('[sync-price-list] oväntat fel:', businessId, productId, err)
  }
}
