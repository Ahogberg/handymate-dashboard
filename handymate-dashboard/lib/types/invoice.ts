// Invoice system types – used across editor, API, and PDF generation

export type InvoiceItemType = 'item' | 'heading' | 'text' | 'subtotal' | 'discount'
export type InvoiceType = 'standard' | 'credit' | 'partial' | 'final' | 'reminder'
/**
 * customer_paid (sql/v170, 2026-08-26) = ROT/RUT-faktura där kunden betalat
 * SIN del; skattereduktionen väntar på Skatteverket. paid = helt slutbetald
 * (settled_at). Fråga "har kunden gjort sitt?" via isCustomerSettled()
 * i lib/invoices/status.ts — inte med status === 'paid'.
 */
export type InvoiceStatus = 'draft' | 'sent' | 'customer_paid' | 'paid' | 'overdue' | 'cancelled' | 'credited'

export interface InvoiceItem {
  id: string
  invoice_id?: string
  business_id?: string
  item_type: InvoiceItemType
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
  sort_order: number
  // Backwards compatibility with old 'labor' | 'material' type
  type?: 'labor' | 'material'
  // Etapp 6 (multi-employee-parity-plan.md): vem som utförde arbetet, ärvt
  // från time_entry.business_user_id när raden byggs från tidrapporter.
  // Saknas (undefined/null) för äldre fakturor och för rader som inte
  // kommer från en tidrapport (material, manuellt tillagda rader).
  business_user_id?: string | null
  performed_by_name?: string | null
}

export interface InvoiceTotals {
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

export interface InvoiceReminder {
  id: string
  business_id: string
  invoice_id: string
  reminder_number: number
  sent_at: string
  sent_method?: string
  fee_amount: number
  penalty_interest_amount: number
  total_with_fees: number
  message?: string
  created_at: string
}

export interface Invoice {
  invoice_id: string
  business_id: string
  customer_id: string | null
  quote_id?: string | null

  // Invoice metadata
  invoice_number: string
  invoice_type: InvoiceType
  status: InvoiceStatus
  invoice_date: string
  due_date: string

  // Items & totals
  items: InvoiceItem[]
  subtotal: number
  discount_percent: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  total: number

  // Text blocks
  introduction_text?: string
  conclusion_text?: string
  internal_notes?: string

  // References
  our_reference?: string
  your_reference?: string

  // Credit
  credit_for_invoice_id?: string | null
  is_credit_note?: boolean
  credit_reason?: string | null

  // Partial
  partial_number?: number
  partial_total?: number

  // ROT/RUT legacy
  rot_rut_type?: string | null
  rot_rut_deduction?: number | null
  customer_pays?: number | null
  personnummer?: string | null
  fastighetsbeteckning?: string | null

  // ROT/RUT split
  rot_work_cost?: number
  rot_deduction?: number
  rot_customer_pays?: number
  rut_work_cost?: number
  rut_deduction?: number
  rut_customer_pays?: number
  rot_personal_number?: string
  rot_property_designation?: string

  // Payment. `paid_via` är DB-kolumnen (swish/bankgiro/card/cash/fortnox/
  // manual/customer_confirmed) — `payment_method` fanns aldrig i databasen.
  paid_via?: string | null
  /** När hela fakturan är reglerad (inkl. Skatteverkets del vid ROT/RUT). */
  settled_at?: string | null
  cancelled_at?: string | null
  bankgiro_number?: string
  plusgiro_number?: string
  bank_account?: string
  swish_number?: string
  ocr_number?: string
  penalty_interest?: number
  reminder_fee?: number

  // Tracking
  sent_at?: string | null
  sent_method?: string
  viewed_at?: string | null
  paid_at?: string | null
  paid_amount?: number | null
  payment_reference?: string

  // Reminders
  reminder_count: number
  last_reminder_at?: string | null

  // Fortnox
  fortnox_invoice_number?: string | null
  fortnox_synced_at?: string | null
  fortnox_sync_error?: string | null

  // Attachments
  attachments?: any[]

  // Metadata
  created_at: string
  updated_at?: string

  // Customer (enriched via join)
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string | null
    address_line: string | null
    personal_number?: string
    property_designation?: string
  }
}
