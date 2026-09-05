// Delade typer för fakturans detaljvy (ETAPP 6d, offert-masterplan.md).
// Speglar app/dashboard/quotes/[id]/types.ts:s uppdelning.

export interface InvoiceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: string
  item_type?: string
}

export interface InvoiceReminder {
  id: string
  reminder_number: number
  sent_at: string
  sent_method: string
  fee_amount: number
  penalty_interest_amount: number
  total_with_fees: number
  message: string
}

export interface Invoice {
  project_id?: string | null
  payment_plan_quote_id?: string | null
  payment_plan_work_completed_on?: string | null
  invoice_id: string
  invoice_number: string
  invoice_type?: string | null
  template_style?: 'modern' | 'premium' | 'friendly' | null
  status: 'draft' | 'sent' | 'customer_paid' | 'paid' | 'overdue' | 'cancelled' | 'credited'
  items: InvoiceItem[]
  description?: string | null
  introduction_text?: string | null
  conclusion_text?: string | null
  subtotal: number
  vat_rate: number
  vat_amount: number
  total: number
  discount_percent?: number | null
  discount_amount?: number | null
  rot_rut_type: string | null
  rot_rut_deduction: number | null
  customer_pays: number | null
  invoice_date: string
  due_date: string
  sent_at: string | null
  sent_method?: string | null
  viewed_at?: string | null
  paid_at: string | null
  paid_amount: number | null
  /** DB-kolumnen (sql/v170-kommentar). `payment_method` fanns aldrig i databasen. */
  paid_via: string | null
  /** Helt reglerad (inkl. Skatteverkets del vid ROT/RUT). */
  settled_at?: string | null
  cancelled_at?: string | null
  payment_reference?: string | null
  reminder_count: number
  reminder_fee: number | null
  penalty_interest: number | null
  last_reminder_at: string | null
  created_at: string
  is_credit_note?: boolean
  original_invoice_id?: string | null
  credit_reason?: string | null
  ocr_number?: string | null
  our_reference?: string | null
  your_reference?: string | null
  bankgiro_number?: string | null
  plusgiro_number?: string | null
  quote_number?: string | null
  fortnox_invoice_number?: string | null
  fortnox_document_number?: string | null
  fortnox_synced_at?: string | null
  fortnox_sync_status?: 'pending' | 'synced' | 'failed' | null
  fortnox_sync_attempted_at?: string | null
  fortnox_sync_error?: string | null
  rot_application_status?: string | null
  /** sql/v163 — kundleveransens tillstånd, skilt från fortnox_sync_status. */
  delivery_status?: 'pending' | 'delivered' | 'delivery_failed' | null
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string | null
    address_line: string | null
    personal_number?: string | null
    property_designation?: string | null
  }
  business_id: string
}
