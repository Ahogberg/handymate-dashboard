/**
 * Delade typer för kundportalen.
 * Extraherade från page.tsx vid komponent-splitten — INGEN logik-ändring.
 */

export interface PortalData {
  customer: { name: string; email: string; phone: string; customerId: string }
  business: { name: string; contactName: string; email: string; phone: string; googleReviewUrl?: string | null }
  unreadMessages: number
}

export interface PortalAta {
  change_id: string
  ata_number: number
  change_type: string
  description: string
  items: Array<{ name: string; quantity: number; unit: string; unit_price: number }>
  total: number
  status: string
  sign_token: string | null
  signed_at: string | null
  signed_by_name: string | null
  created_at: string
}

export interface TrackerStage {
  stage: string
  label: string
  completed_at: string | null
  completed_by: string | null
  note: string | null
}

export interface ProjectPhoto {
  id: string
  url: string
  caption: string | null
  type: string
  uploaded_at: string
}

export interface Project {
  project_id: string
  name: string
  status: string
  description: string
  progress: number
  created_at: string
  updated_at: string
  milestones: Array<{ name: string; status: string; sort_order: number }>
  latestLog: { description: string; created_at: string } | null
  nextVisit: { title: string; start_time: string; end_time: string } | null
  atas: PortalAta[]
  tracker_stages?: TrackerStage[]
  photos?: ProjectPhoto[]
}

export interface Quote {
  quote_id: string
  title: string
  status: string
  total: number
  customer_pays: number
  rot_rut_type: string | null
  rot_rut_deduction: number
  valid_until: string
  created_at: string
  sent_at: string | null
  accepted_at: string | null
  sign_token: string | null
}

export interface Invoice {
  invoice_id: string
  invoice_number: string
  invoice_type?: string
  status: string
  items?: any[]
  subtotal?: number
  vat_rate?: number
  vat_amount?: number
  total: number
  rot_rut_type: string | null
  rot_rut_deduction?: number | null
  customer_pays?: number | null
  invoice_date?: string
  due_date: string
  paid_at: string | null
  created_at: string
  ocr_number?: string
  our_reference?: string | null
  your_reference?: string | null
  is_credit_note?: boolean
  reminder_count?: number
  introduction_text?: string | null
  conclusion_text?: string | null
}

export interface PaymentInfo {
  bankgiro: string | null
  plusgiro: string | null
  swish: string | null
  bank_account: string | null
  penalty_interest: number
  reminder_fee: number
}

export interface BusinessInfo {
  name: string
  org_number: string
  f_skatt: boolean
}

export interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  message: string
  read_at: string | null
  created_at: string
}

export type Tab = 'projects' | 'quotes' | 'invoices' | 'messages' | 'review' | 'changes' | 'reports'

export interface FieldReport {
  id: string
  report_number: string | null
  title: string
  work_performed: string | null
  materials_used: string | null
  status: string
  signature_token: string | null
  signed_at: string | null
  signed_by: string | null
  created_at: string
  project_id: string | null
}
