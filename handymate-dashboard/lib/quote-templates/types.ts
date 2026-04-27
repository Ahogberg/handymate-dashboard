/**
 * Gemensamt data-shape för alla offertmallar.
 * Render-funktionerna i modern.ts/premium.ts/friendly.ts tar denna typ
 * som input — så samma underlag kan rendera alla stilar.
 */

export interface QuoteTemplateBusiness {
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

export interface QuoteTemplateCustomer {
  name: string
  address?: string | null
  postalCode?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  personnummer?: string | null
  reference?: string | null
}

export interface QuoteTemplateItem {
  name: string
  description?: string | null
  quantity: number
  unit: string
  unitPrice: number
  total: number
  isRotEligible?: boolean
  isRutEligible?: boolean
}

export interface QuoteTemplateQuote {
  number: string
  /** Ärende-/dealreferens från säljtratten — visas som "Ärende #1003" på offerten */
  dealNumber?: string | null
  issuedDate: string
  validUntilDate: string
  title: string
  description?: string | null
  items: QuoteTemplateItem[]
  subtotalExVat: number
  vatAmount: number
  totalIncVat: number
  rotDeduction?: number
  rutDeduction?: number
  amountToPay: number
  paymentTerms: string
  warrantyText?: string | null
  introductionText?: string | null
  conclusionText?: string | null
  notIncluded?: string | null
}

export interface QuoteTemplateData {
  business: QuoteTemplateBusiness
  customer: QuoteTemplateCustomer
  quote: QuoteTemplateQuote
}

export type TemplateStyle = 'modern' | 'premium' | 'friendly'

export type TemplateRenderFn = (data: QuoteTemplateData) => string

export interface TemplateMeta {
  id: TemplateStyle
  name: string
  tagline: string
  bestFor: string
  previewBgColor: string
  previewAccentColor: string
}
