/**
 * Gemensamt data-shape för alla faktura-mallar.
 * Speglar quote-templates/types.ts men med faktura-specifika fält
 * (status, OCR, förfallodatum, sen-notis, dröjsmålsränta).
 *
 * ETAPP 6a (offert-masterplan.md, faktura-sprinten): InvoiceTemplateItem
 * ÄTERANVÄNDER nu QuoteTemplateItem rakt av (samma fält-shape: itemType,
 * id, name, description, quantity, unit, unitPrice, total, performedByName
 * m.fl.) istället för en egen smalare flat item-typ. Det är vad som gör det
 * möjligt för dokumentmotorn (components/quotes/document/QuoteDocument.tsx
 * + QuoteDocumentRow.tsx) att rendera BÅDE offert- och fakturarader genom
 * SAMMA radkomponent utan typcasting — 'option' är fortfarande giltigt i
 * unionen (QuoteTemplateItemType) men produceras aldrig av
 * buildInvoiceTemplateData, och isRotEligible/rotRutType/components/
 * optionSelected är helt enkelt outnyttjade på fakturasidan (harmlöst).
 */
import type { QuoteTemplateItem, QuoteTemplateItemType } from '@/lib/quote-templates/types'
import type { Attribution } from '@/lib/branding/attribution'

export type InvoiceTemplateItemType = Exclude<QuoteTemplateItemType, 'option'>
export type InvoiceTemplateItem = QuoteTemplateItem

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

export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue' | 'reminder'

export interface InvoiceTemplateInvoice {
  number: string
  invoiceDate: string             // formatterad sv-SE
  dueDate: string                 // formatterad sv-SE
  /** ETAPP 6c (offert-masterplan.md, faktura-sprinten): ISO-datum
      (yyyy-mm-dd) för EditableDate-fältet i dokumentmotorns edit-läge —
      speglar quote.validUntilDateISO. Utelämnad av buildInvoiceTemplateData
      (statisk rendering/PDF behöver aldrig ett redigerbart datumfält) —
      satt bara av fakturaskaparens klientbyggda liveTemplateData. */
  dueDateISO?: string
  paidDate?: string | null
  status: InvoiceStatus
  daysOverdue: number             // 0 om inte försenad
  ocrNumber: string

  title: string
  description?: string | null
  items: InvoiceTemplateItem[]

  subtotalExVat: number
  /** Global procentrabatt — ETAPP 6a: fakturan kan ärva discount_percent/
      discount_amount från invoice-raden (samma fält som offertens
      discountPercent/discountAmount). Utelämnad → raden renderas inte
      (samma princip som QuoteTemplateQuote). */
  discountPercent?: number
  discountAmount?: number
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

  // Betalinstruktioner (ETAPP 6a: OCR-raden + bankgiro/plusgiro renderas
  // av InvoicePaymentSection.tsx i dokumentmotorn — samma fält som
  // Swish-blocket redan använde via business.bankgiro/plusgiro).
  bankgiro?: string | null
  plusgiro?: string | null

  // Kreditfaktura — ETAPP 6a: facit är den döda koden i den gamla
  // app/api/invoices/pdf/route.ts (generateInvoiceHTML/renderInvoiceItems,
  // nu raderad) som läste invoice.credit_reason för notisen bredvid
  // titeln. originalInvoiceId speglar invoice.original_invoice_id (INTE
  // credit_for_invoice_id — se datab-builder-kommentaren för varför den
  // kolumnen valdes) men renderas idag inte som en uppslagen fakturareferens
  // (kräver en extra join som data-builder medvetet INTE gör — se rapporten).
  isCreditNote?: boolean
  creditReason?: string | null
  originalInvoiceId?: string | null
}

export interface InvoiceTemplateData {
  business: InvoiceTemplateBusiness
  customer: InvoiceTemplateCustomer
  invoice: InvoiceTemplateInvoice
  swishQrDataUrl?: string | null  // base64 QR från /lib/swish-qr
  /** Handymate-stämpeln (lib/branding/attribution.ts) — sist
      på sista sidan i alla mallar. Utelämnad → texten utan länk. */
  attribution?: Attribution
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
