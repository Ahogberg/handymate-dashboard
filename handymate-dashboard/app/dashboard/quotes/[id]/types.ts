// Delade typer för offert-detaljvyn.

export interface QuoteItem {
  id: string
  item_type: 'item' | 'heading' | 'text' | 'subtotal' | 'discount'
  group_name?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  sort_order: number
}

export interface QuoteVersion {
  quote_id: string
  version_number: number
  version_label: string | null
  status: string
  total: number
  created_at: string
}

export interface PaymentPlanEntry {
  label: string
  percent: number
  amount: number
  due_description: string
}

export interface Quote {
  quote_id: string
  business_id: string
  customer_id: string
  status: string
  title: string
  description: string
  items: any[]
  labor_total: number
  material_total: number
  subtotal: number
  discount_percent: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  total: number
  rot_rut_type: string | null
  rot_rut_eligible: number
  rot_rut_deduction: number
  customer_pays: number
  valid_until: string
  sent_at: string | null
  opened_at: string | null
  accepted_at: string | null
  declined_at: string | null
  decline_reason: string | null
  pdf_url: string | null
  created_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string
  }
  quote_items?: QuoteItem[]
  introduction_text?: string
  conclusion_text?: string
  not_included?: string
  ata_terms?: string
  payment_terms_text?: string
  payment_plan?: PaymentPlanEntry[]
  reference_person?: string
  customer_reference?: string
  project_address?: string
  detail_level?: string
  show_unit_prices?: boolean
  show_quantities?: boolean
  rot_work_cost?: number
  rot_deduction?: number
  rot_customer_pays?: number
  rut_work_cost?: number
  rut_deduction?: number
  rut_customer_pays?: number
  quote_number?: string
  signature_data?: string
  signed_at?: string
  signed_by_name?: string
  version_number?: number
  parent_quote_id?: string
  version_label?: string
  sign_token?: string
}

export interface QuoteIntelligence {
  show_warning: boolean
  analysis: {
    similar_jobs: number
    overrun_percent: number
    suggested_price: number
    current_price: number
    confidence: string
    message: string
  } | null
}
