import type { SupabaseClient } from '@supabase/supabase-js'
import { sameUnit } from './job-type-setup'
import { applyProductToItem } from '@/app/dashboard/quotes/_shared/applyProductToItem'

/** New standard rows use the same full product snapshot as manual article selection.
 * Hydration is read-only; stored quotes and ordinary legacy templates are untouched.
 */
export async function hydrateStandardProducts(db: SupabaseClient, businessId: string, templates: any[]) {
  const ids = Array.from(new Set<string>(templates.flatMap(t => (Array.isArray(t.default_items) ? t.default_items : [])
    .filter((r: any) => r.standard_product === true && typeof r.linked_product_id === 'string').map((r: any) => r.linked_product_id))))
  if (!ids.length) return templates
  const products: any[] = [], components: any[] = []
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100)
    const { data, error } = await db.from('products').select('*').eq('business_id', businessId).eq('is_active', true).in('id', batch)
    if (error) throw new Error('Kunde inte läsa standardradernas artiklar.')
    products.push(...(data || []))
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: componentError } = await db.from('product_components').select('*').eq('business_id', businessId)
        .in('product_id', batch).order('id').range(offset, offset + 499)
      if (componentError) throw new Error('Kunde inte läsa artiklarnas kalkylunderlag.')
      components.push(...(rows || []))
      if ((rows || []).length < 500) break
      if (offset >= 9500) throw new Error('Kalkylunderlaget är för stort. Kontakta supporten.')
    }
  }
  return templates.map(template => ({ ...template, default_items: (Array.isArray(template.default_items) ? template.default_items : []).map((item: any) => {
    if (item.standard_product !== true) return item
    const product = products.find(p => p.id === item.linked_product_id)
    // Keep identity/unit for the ordinary resolver's missing/incompatible warning.
    if (!product || !sameUnit(product.unit, item.unit)) return { ...item, unit_price: 0, total: 0, component_snapshot: null,
      labor_amount: null, material_amount: null, estimated_hours: null, is_rot_eligible: false, is_rut_eligible: false, rot_rut_type: null }
    const hydrated = applyProductToItem({ ...item, unit_price: 0 }, { ...product,
      sales_price: Number(product.sales_price) > 0 ? Number(product.sales_price) : 0,
      components: components.filter(c => c.product_id === product.id) }, item.quantity)
    // Preserve the template's exact unit: no conversion of quantities in a standard.
    return { ...hydrated, description: item.description, unit: item.unit }
  }) }))
}
