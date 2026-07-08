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

/** Radtyp — speglar quote_items.item_type i databasen. */
export type QuoteTemplateItemType = 'item' | 'heading' | 'text' | 'subtotal' | 'discount' | 'option'

export interface QuoteTemplateItem {
  /**
   * Radtyp. Utelämnad tolkas som 'item' (bakåtkompatibelt med anropare
   * som bygger items utan typ, t.ex. live-preview i offert-byggaren).
   * - 'heading'/'text': endast `name` används (fullbreddsrad utan belopp)
   * - 'subtotal': `name` (etikett) + `total` (lagrad delsumma)
   * - 'discount': `total` är alltid NEGATIVT (normaliseras i data-builder),
   *   mallarna visar "−X kr" så att synliga rader summerar till delsumman
   */
  itemType?: QuoteTemplateItemType
  /** Endast itemType 'option': kundens val — true = ikryssat tillval (☑),
      false/utelämnad = bortvalt (☐). Speglar quote_items.option_selected. */
  optionSelected?: boolean
  name: string
  description?: string | null
  quantity: number
  unit: string
  unitPrice: number
  total: number
  isRotEligible?: boolean
  isRutEligible?: boolean
  /** Endast 'summary'-nivå: gruppsummerad rad (heading + belopp), ingen à-pris/antal.
      Renderas som en sektionsrad med summa till höger. */
  isGroup?: boolean
  /** Per-rad-override (show_components_to_customer): komponentspec som visas
      under raden i 'rows'/'full'. ALDRIG interna kostnader — bara beskrivning +
      mängd/enhet. Tomt/utelämnat → ingen spec. */
  components?: QuoteTemplateComponent[]
}

/** En komponentrad ur component_snapshot som får visas för kunden. */
export interface QuoteTemplateComponent {
  description: string
  quantityPerUnit: number
  unit: string
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
  /** Egen 'Villkor'-text per offert. Om satt, ersätter hardcoded default
      i templates (Offerten gäller till X. Tilläggsarbete debiteras...).
      Pilot-feedback 2026-05-20. */
  termsText?: string | null
}

/** Visningsnivå — speglar lib/quotes/display-level.ts DisplayLevel. */
export type QuoteDisplayLevel = 'summary' | 'rows' | 'full'

export interface QuoteTemplateData {
  business: QuoteTemplateBusiness
  customer: QuoteTemplateCustomer
  quote: QuoteTemplateQuote
  /** true när offerten är signerad/accepterad — mallarna döljer då
      "Välj dina tillval i kundportalen"-noten (valen är låsta). */
  isSigned?: boolean
  /** Kundens visningsnivå (Del C). Styr vilka kolumner mallarna renderar.
      'summary' → gruppsummor + tillval; 'rows' → rader utan antal/à-pris;
      'full' → allt. Utelämnad tolkas som 'full' (bakåtkompatibelt). */
  displayLevel?: QuoteDisplayLevel
  /** Kolumnflaggor härledda ur displayLevel via displayLevelToColumns. */
  showQuantities?: boolean
  showUnitPrices?: boolean
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
