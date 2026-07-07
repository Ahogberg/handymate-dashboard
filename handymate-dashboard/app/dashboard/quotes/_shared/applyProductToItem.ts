import type { QuoteItem, RotRutType } from '@/lib/types/quote'
import {
  buildItemSnapshot,
  type SnapshotComponent,
} from '@/lib/products/build-item-snapshot'

/**
 * Delad förfyllnings-väg för produktbanken (tasks/produktbank-spec.md §Snabbsök):
 * ALLA vägar in i offertraden (inline-combobox, sökmodal, snabbval) går genom
 * applyProductToItem så att snapshot/split/timmar alltid byggs identiskt.
 *
 * `??` (nullish), ALDRIG `||` — default_labor_share = 0 är GILTIGT (ren material).
 */

/** Komponentrad som API:t returnerar (product_components-rad, v67). */
export interface ProductComponentRow {
  component_type: string
  description: string
  quantity_per_unit: number
  unit: string
  unit_cost: number
}

/**
 * Produkt så som offert-ytorna ser den — GET /api/products-raden, eventuellt
 * med `components` bifogat (include=components). ProductSearchResult är en
 * strukturell delmängd och passerar direkt.
 */
export interface ProductWithComponents {
  id: string
  name: string
  sku?: string | null
  unit: string
  sales_price: number
  purchase_price?: number | null
  rot_eligible?: boolean
  rut_eligible?: boolean
  is_favorite?: boolean
  default_labor_share?: number | null
  category_id?: string | null
  components?: ProductComponentRow[]
}

/** Normalize legacy unit values to the new set */
export function normalizeUnit(unit: string): string {
  const map: Record<string, string> = {
    hour: 'tim',
    timmar: 'tim',
    h: 'tim',
    piece: 'st',
    styck: 'st',
  }
  return map[unit.toLowerCase()] || unit
}

/**
 * Förfyller en offertrad från en produkt: beskrivning, enhet, à-pris,
 * artikelnr, ROT/RUT, linked_product_id + fryst component_snapshot med
 * labor_share → labor_amount/material_amount/estimated_hours.
 *
 * Radens id/sort_order/item_type/kategori bevaras (spread) — raden byter
 * innehåll, inte identitet.
 */
export function applyProductToItem(
  item: QuoteItem,
  product: ProductWithComponents,
  quantity?: number,
): QuoteItem {
  const qty = quantity ?? item.quantity
  const unitPrice = product.sales_price
  const total = qty * unitPrice

  const components: SnapshotComponent[] = (product.components ?? []).map(c => ({
    component_type: c.component_type === 'arbete' ? 'arbete' : 'material',
    description: c.description,
    quantity_per_unit: c.quantity_per_unit,
    unit: c.unit,
    unit_cost: c.unit_cost,
  }))

  const snapshot = buildItemSnapshot(
    {
      id: product.id,
      name: product.name,
      sku: product.sku ?? null,
      sales_price: product.sales_price,
      default_labor_share: product.default_labor_share ?? null,
    },
    components,
    qty,
    total,
  )

  const rotRutType: RotRutType = product.rot_eligible
    ? 'rot'
    : product.rut_eligible
      ? 'rut'
      : null

  return {
    ...item,
    description: product.name,
    quantity: qty,
    unit: normalizeUnit(product.unit),
    unit_price: unitPrice,
    total,
    article_number: product.sku ?? undefined,
    cost_price: product.purchase_price ?? undefined,
    is_rot_eligible: !!product.rot_eligible,
    is_rut_eligible: !!product.rut_eligible,
    rot_rut_type: rotRutType,
    linked_product_id: product.id,
    component_snapshot: snapshot.component_snapshot,
    labor_amount: snapshot.labor_amount,
    material_amount: snapshot.material_amount,
    estimated_hours: snapshot.estimated_hours,
  }
}

/**
 * Säkerställer att produkten har sin komponentlista — hämtar lazily via
 * GET /api/products/[id]/components när `components` saknas (t.ex. snabbvals-
 * knapparna vars produkter laddas utan komponenter). Redan hämtade
 * komponenter (include=components) passerar orörda.
 */
export async function ensureProductComponents(
  product: ProductWithComponents,
): Promise<ProductWithComponents> {
  if (product.components) return product
  try {
    const res = await fetch(`/api/products/${product.id}/components`)
    if (res.ok) {
      const data = await res.json()
      return { ...product, components: data.components ?? [] }
    }
  } catch {
    // tyst — produkten förfylls ändå, bara utan komponentsplit
  }
  return { ...product, components: [] }
}
