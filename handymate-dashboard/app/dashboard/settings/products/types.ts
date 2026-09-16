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
  component_type: 'arbete' | 'material' | 'resa'
  description: string
  quantity_per_unit: number
  unit: string
  unit_cost: number
  article_number?: string | null
  unit_price?: number | null
  is_rot_eligible?: boolean
  linked_product_id?: string | null
  sort_order?: number
}

/** Payload-rad till PUT /api/products/[id]/components */
export interface ComponentPayload {
  component_type: 'arbete' | 'material' | 'resa'
  description: string
  quantity_per_unit: number
  unit: string
  unit_cost: number
  article_number?: string | null
  unit_price?: number | null
  is_rot_eligible: boolean
  linked_product_id?: string | null
}

/** Svarsraden från GET /api/reservations och GET /api/products/[id]/reservations */
export interface ProductReservation {
  id: string
  title: string
  content: string
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
  default_travel_share: number | null
  share_source: 'seed' | 'owner' | 'components' | 'import' | null
  share_confirmed_at: string | null
  /** Bifogas när listan hämtas med include=components */
  components?: ProductComponent[]
}
