// Quote system types – used across editor, API, and PDF generation

export type QuoteItemType = 'item' | 'heading' | 'text' | 'subtotal' | 'discount'
export type RotRutType = 'rot' | 'rut' | null
export type DetailLevel = 'detailed' | 'subtotals_only' | 'total_only'
export type StandardTextType = 'introduction' | 'conclusion' | 'not_included' | 'ata_terms' | 'payment_terms'

export interface QuoteItem {
  id: string
  quote_id?: string
  business_id?: string
  item_type: QuoteItemType
  group_name?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  cost_price?: number
  article_number?: string
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  rot_rut_type?: RotRutType
  sort_order: number
}

export interface QuoteTemplate {
  id: string
  business_id: string
  name: string
  description?: string
  branch?: string
  category?: string
  introduction_text?: string
  conclusion_text?: string
  not_included?: string
  ata_terms?: string
  payment_terms_text?: string
  default_items: QuoteItem[]
  default_payment_plan: PaymentPlanEntry[]
  detail_level: DetailLevel
  show_unit_prices: boolean
  show_quantities: boolean
  rot_enabled: boolean
  rut_enabled: boolean
  is_favorite: boolean
  usage_count: number
  created_at?: string
  updated_at?: string
}

export interface QuoteStandardText {
  id: string
  business_id: string
  text_type: StandardTextType
  name: string
  content: string
  is_default: boolean
  created_at?: string
  updated_at?: string
}

export interface PaymentPlanEntry {
  label: string
  percent: number
  amount: number
  due_description: string
}

export interface QuoteTotals {
  laborTotal: number
  materialTotal: number
  serviceTotal: number
  subtotal: number
  discountAmount: number
  afterDiscount: number
  vat: number
  total: number
  rotWorkCost: number
  rotDeduction: number
  rotCustomerPays: number
  rutWorkCost: number
  rutDeduction: number
  rutCustomerPays: number
}

// Extended quote object with all new fields
export interface EnhancedQuote {
  quote_id: string
  business_id: string
  customer_id: string | null
  quote_number?: string
  status: string
  title: string
  description?: string

  // Legacy JSONB items (backwards compat)
  items?: any[]
  // New structured items
  quote_items?: QuoteItem[]

  // Texts
  introduction_text?: string
  conclusion_text?: string
  not_included?: string
  ata_terms?: string
  payment_terms_text?: string

  // Payment plan
  payment_plan?: PaymentPlanEntry[]

  // References
  reference_person?: string
  customer_reference?: string
  project_address?: string

  // Display settings
  detail_level: DetailLevel
  show_unit_prices: boolean
  show_quantities: boolean

  // Financial
  labor_total: number
  material_total: number
  subtotal: number
  discount_percent: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  total: number

  // ROT/RUT legacy
  rot_rut_type?: string | null
  rot_rut_eligible?: number
  rot_rut_deduction?: number
  customer_pays?: number

  // ROT/RUT new split
  rot_work_cost?: number
  rot_deduction?: number
  rot_customer_pays?: number
  rut_work_cost?: number
  rut_deduction?: number
  rut_customer_pays?: number

  // Personal info for ROT/RUT
  personnummer?: string
  fastighetsbeteckning?: string

  // Attachments
  attachments?: any[]

  // Metadata
  valid_until?: string
  sent_at?: string | null
  opened_at?: string | null
  accepted_at?: string | null
  declined_at?: string | null
  decline_reason?: string | null
  created_at?: string
  updated_at?: string

  // AI
  ai_generated?: boolean
  ai_confidence?: number
  source_transcript?: string
  template_id?: string

  // Versioning
  version_number?: number
  parent_quote_id?: string | null
  version_label?: string | null

  // Signature
  signature_data?: string
  signed_at?: string
  signed_by_name?: string

  // Customer (enriched)
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string
    personal_number?: string
    property_designation?: string
  }
}
