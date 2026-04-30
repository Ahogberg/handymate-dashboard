// Delade typer för customers-vyns komponenter.
// Spegling av in-page-types i page.tsx — samma fält, samma valfria semantik.

export interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
  address_line: string | null
  created_at: string
  customer_type?: 'private' | 'company' | 'brf'
  org_number?: string | null
  contact_person?: string | null
  invoice_address?: string | null
  visit_address?: string | null
  reference?: string | null
  apartment_count?: number | null
  personal_number?: string | null
  property_designation?: string | null
  customer_number?: string | null
  lifetime_value?: number
  job_count?: number
  last_job_date?: string | null
}

export interface CustomerTag {
  tag_id: string
  name: string
  color: string
  customer_count: number
}

export interface DuplicateGroup {
  match_type: 'phone' | 'email' | 'name_address'
  match_value: string
  customers: Array<{
    customer_id: string
    name: string
    phone_number: string
    email: string | null
    created_at: string
  }>
}

export interface Campaign {
  campaign_id: string
  name: string
  message: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
  scheduled_at: string | null
  sent_at: string | null
  recipient_count: number
  delivered_count: number
  created_at: string
}

export interface CustomerForm {
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number: string
  property_designation: string
  customer_type: 'private' | 'company' | 'brf'
  org_number: string
  contact_person: string
  invoice_address: string
  visit_address: string
  reference: string
  apartment_count: string
  segment_id: string
  contract_type_id: string
  price_list_id: string
  default_payment_days: string
  invoice_email: boolean
}

export interface PricingOption {
  id: string
  name: string
  segment_id?: string | null
}
