/**
 * Grossist Integration - Type Definitions
 */

export interface CredentialField {
  key: string
  label: string
  type: 'text' | 'password'
  required: boolean
  placeholder?: string
}

export interface SupplierDefinition {
  key: string
  name: string
  description: string
  authType: 'api_key' | 'oauth2' | 'credentials'
  credentialFields: CredentialField[]
  available: boolean
}

export interface SupplierProduct {
  external_id: string
  sku?: string
  ean?: string
  rsk_number?: string
  e_number?: string
  name: string
  description?: string
  category?: string
  unit: string
  purchase_price: number | null
  recommended_price?: number | null
  image_url?: string
  in_stock: boolean
  stock_quantity?: number
  raw_data?: Record<string, unknown>
}

export interface ProductSearchParams {
  query: string
  category?: string
  limit?: number
  offset?: number
}

export interface ProductSearchResult {
  products: SupplierProduct[]
  total: number
  hasMore: boolean
}

export interface PriceLookupResult {
  product: SupplierProduct
  price: number | null
  currency: string
  validUntil?: string
}

export interface SupplierAdapter {
  readonly key: string
  testConnection(credentials: Record<string, string>): Promise<{ success: boolean; error?: string }>
  searchProducts(credentials: Record<string, string>, params: ProductSearchParams): Promise<ProductSearchResult>
  getProduct(credentials: Record<string, string>, productId: string): Promise<SupplierProduct | null>
  getPrice(credentials: Record<string, string>, productId: string): Promise<PriceLookupResult | null>
  getCategories(credentials: Record<string, string>): Promise<string[]>
}

export interface SupplierConnection {
  connection_id: string
  business_id: string
  supplier_key: string
  supplier_name: string
  credentials: Record<string, string>
  is_connected: boolean
  connected_at: string | null
  last_sync_at: string | null
  sync_error: string | null
  settings: Record<string, unknown>
}

export interface SelectedProduct {
  source: 'grossist' | 'manual'
  grossist_product_id?: string
  supplier_product_id?: string
  name: string
  sku?: string
  supplier_name: string
  unit: string
  purchase_price: number
  recommended_price?: number
  markup_percent: number
  sell_price: number
  image_url?: string
}
