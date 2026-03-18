export interface LeadOutbound {
  id: string
  business_id: string
  property_address: string
  property_type: string | null
  built_year: number | null
  energy_class: string | null
  purchase_date: string | null
  owner_name: string | null
  letter_content: string
  letter_edited: boolean
  status: 'draft' | 'approved' | 'sent' | 'delivered'
  sent_at: string | null
  cost_sek: number | null
  postnord_tracking_id: string | null
  converted: boolean
  batch_id: string | null
  created_at: string
}

export interface LeadMonthlyUsage {
  id: string
  business_id: string
  month: string
  letters_sent: number
  letters_quota: number
  extra_letters: number
  extra_cost_sek: number
}

export interface PropertyLead {
  address: string
  propertyType: string
  builtYear: number | null
  energyClass: string | null
  purchaseDate: string | null
  ownerName: string | null
}
