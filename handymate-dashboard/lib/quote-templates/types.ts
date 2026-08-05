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

/**
 * Speglar lib/types/quote.ts RotRutType — duplicerad lokalt (istället för
 * importerad) så mallpaketet (lib/quote-templates) förblir fristående från
 * app-lagrets typer, samma princip som resten av denna fil.
 */
export type QuoteTemplateRotRutType = 'rot' | 'rut' | 'gron_solceller' | 'gron_lagring' | 'gron_laddpunkt' | null

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
  /** ETAPP 2a (offert-masterplan.md): källrad-id (quote_items.id) — ENDAST
      satt/använt i edit-läge (dokumentmotorns id-baserade liveHandlers).
      Utelämnad i statisk rendering (PDF/kundvy) där den inte behövs. */
  id?: string
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
  /** Rå avdragstyp (inkl. grön teknik-varianter) — ETAPP 2a: dokumentmotorns
      klickbara ROT/RUT-badge behöver skilja "ingen avdragstyp" från "grön
      teknik" (isRotEligible/isRutEligible är båda false för grön teknik).
      Badgen cyklar bara null→rot→rut→null; grön teknik visas men redigeras
      endast i radeditorn (för många val för en badge). */
  rotRutType?: QuoteTemplateRotRutType
  /** Endast 'summary'-nivå: gruppsummerad rad (heading + belopp), ingen à-pris/antal.
      Renderas som en sektionsrad med summa till höger. */
  isGroup?: boolean
  /** Per-rad-override (show_components_to_customer): komponentspec som visas
      under raden i 'rows'/'full'. ALDRIG interna kostnader — bara beskrivning +
      mängd/enhet. Tomt/utelämnat → ingen spec. */
  components?: QuoteTemplateComponent[]
  /** ETAPP 6a (offert-masterplan.md, faktura-sprinten): vem som utförde
      arbetet (invoice_item.performed_by_name, multi-employee-parity-planet).
      Utelämnad för offertrader (fältet existerar bara på fakturasidan idag)
      och för äldre fakturarader/rader utan tidrapport-koppling. Renderas
      diskret (liten sekundärtext) under radens namn av QuoteDocumentRow —
      docType-agnostisk så samma radkomponent kan visa den oavsett om den
      körs i offert- eller fakturaläge. */
  performedByName?: string | null
  /** Dold för kunden (quote_items.is_hidden, v90): raden utelämnas ur ALL
      statisk rendering — PDF, kundvy, förhandsgranskning — men priset ingår
      i summan oförändrat. I edit-läge renderas raden ghostad med en
      "Dold"-markering så hantverkaren ser vad kunden inte ser.
      Filtreringen sker i respektive renderare, aldrig i beräkningarna. */
  isHidden?: boolean
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
  /** ISO-datum (yyyy-mm-dd) för validUntilDate — ENDAST satt av live-canvasens
      byggare (new/edit-sidorna) så dokumentmotorns EditableDate-fält har ett
      värde <input type="date"> kan binda till. validUntilDate förblir den
      formaterade texten som visas/renderas i static-läge/PDF. */
  validUntilDateISO?: string
  title: string
  description?: string | null
  items: QuoteTemplateItem[]
  subtotalExVat: number
  /** Global procentrabatt (utöver ev. 'discount'-radtyper) — ENDAST satt av
      live-canvasens byggare (new/edit-sidorna) så dokumentmotorns
      Rabatt-rad i summeringen kan visas/redigeras. Utelämnad → raden
      renderas inte (befintligt static/PDF-beteende oförändrat). */
  discountPercent?: number
  /** Beräknat rabattbelopp (kr) för discountPercent — visas i summeringens
      Rabatt-rad, beräknas aldrig av dokumentmotorn själv (samma princip som
      totalsumman i övrigt: alltid härledd av anroparen, aldrig av UI:t). */
  discountAmount?: number
  vatAmount: number
  totalIncVat: number
  rotDeduction?: number
  rutDeduction?: number
  /** Grön teknik-avdrag (Fas 1) — solceller/batteri/laddbox, se lib/quote-calculations.ts. */
  gronDeduction?: number
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
  /** "Vår referens" — offertens skapare (auto men redigerbar). Renderas i
      kunddokumentets avsändarblock. Utelämnad/null → raden visas ej (legacy). */
  referencePerson?: string | null
  /**
   * ETAPP 2a (offert-masterplan.md): styr signatur-CTA-sektionen (behövs
   * fullt ut av E4/E5). 'active' = "Godkänn offerten digitalt"-yta,
   * 'signed' = "Signerad {datum}"-kvitto, 'hidden' = sektionen renderas
   * inte alls. Utelämnad → dokumentmotorn väljer 'signed'/'active' utifrån
   * isSigned (generisk default). buildQuoteTemplateData sätter EXPLICIT
   * 'hidden' tills E5 aktiverar kundvyn — ingen beteendeförändring i
   * befintliga PDF:er/förhandsvisningar av den här etappen.
   */
  signatureCta?: 'active' | 'signed' | 'hidden'
  /** Datum för signering ("13 mars 2026"), formaterat — endast relevant när
      signatureCta är (eller resolvar till) 'signed'. */
  signedDate?: string | null
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
