/**
 * Delade typer för produktbanks-UI:t (Inställningar → Produkter & priser).
 * Speglar svaren från /api/products, /api/products/categories och
 * /api/products/[id]/components.
 */

export interface ProductCategory {
  id: string
  business_id: string
  parent_id: string | null
  name: string
  sort_order: number
  created_at: string
  children: ProductCategory[]
}

export interface ProductComponent {
  id?: string
  component_type: 'arbete' | 'material'
  description: string
  quantity_per_unit: number
  unit: string
  unit_cost: number
  sort_order?: number
}

/** Payload-rad till PUT /api/products/[id]/components */
export interface ComponentPayload {
  component_type: 'arbete' | 'material'
  description: string
  quantity_per_unit: number
  unit: string
  unit_cost: number
}

export interface ProductRow {
  id: string
  name: string
  description: string | null
  /** Legacy-TEXT-kolumnen ('material'/'arbete'/...) — rörs inte av UI:t */
  category: string
  sku: string | null
  unit: string
  purchase_price: number | null
  sales_price: number
  markup_percent: number | null
  rot_eligible: boolean
  rut_eligible: boolean
  vat_rate: number
  is_active: boolean
  is_favorite: boolean
  category_id: string | null
  default_labor_share: number | null
  /** Bifogas när listan hämtas med include=components */
  components?: ProductComponent[]
}
