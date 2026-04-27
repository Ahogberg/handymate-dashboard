/**
 * Gemensamt data-shape för alla faktura-mallar.
 * Speglar quote-templates/types.ts men med faktura-specifika fält
 * (status, OCR, förfallodatum, sen-notis, dröjsmålsränta).
 */

export interface InvoiceTemplateBusiness {
  name: string
  orgNumber: string
  address: string
  contactName: string
  phone: string
  email: string
  website?: string | null
  bankgiro?: string | null
  plusgiro?: string | null
  swish?: string | null
  fSkatt: boolean
  momsRegnr?: string | null
  accentColor: string
  logoUrl?: string | null
  tagline?: string | null
}

export interface InvoiceTemplateCustomer {
  name: string
  address?: string | null
  postalCode?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  personnummer?: string | null
  reference?: string | null
}

export interface InvoiceTemplateItem {
  name: string
  description?: string | null
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue' | 'reminder'

export interface InvoiceTemplateInvoice {
  number: string
  invoiceDate: string             // formatterad sv-SE
  dueDate: string                 // formatterad sv-SE
  paidDate?: string | null
  status: InvoiceStatus
  daysOverdue: number             // 0 om inte försenad
  ocrNumber: string

  title: string
  description?: string | null
  items: InvoiceTemplateItem[]

  subtotalExVat: number
  vatAmount: number
  vatRate: number
  totalIncVat: number
  rotDeduction?: number           // ROT-avdrag (om tillämpat)
  rutDeduction?: number           // RUT-avdrag (om tillämpat)
  rotRutType?: 'rot' | 'rut' | null

  // Försenade fakturor
  lateInterest?: number           // Dröjsmålsränta i SEK (beräknat)
  lateInterestRate?: number       // 8 (procent) typ
  reminderFee?: number            // 60 kr typ — bara om reminder skickad

  amountToPay: number             // Slutbelopp efter ROT + dröjsmålsränta + påminnelseavgift

  paymentTerms: string
  introductionText?: string | null
  conclusionText?: string | null

  // Extra refs
  quoteReference?: string | null  // Offert-nr om fakturan kommer från offert
  ourReference?: string | null
  yourReference?: string | null

  // Kreditfaktura
  isCreditNote?: boolean
}

export interface InvoiceTemplateData {
  business: InvoiceTemplateBusiness
  customer: InvoiceTemplateCustomer
  invoice: InvoiceTemplateInvoice
  swishQrDataUrl?: string | null  // base64 QR från /lib/swish-qr
}

export type InvoiceTemplateStyle = 'modern' | 'premium' | 'friendly'

export type InvoiceTemplateRenderFn = (data: InvoiceTemplateData) => string

export interface InvoiceTemplateMeta {
  id: InvoiceTemplateStyle
  name: string
  tagline: string
  bestFor: string
  previewBgColor: string
  previewAccentColor: string
}
