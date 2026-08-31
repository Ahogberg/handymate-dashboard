// Quote system types – used across editor, API, and PDF generation

export type QuoteItemType = 'item' | 'heading' | 'text' | 'subtotal' | 'discount' | 'option'
export type RotRutType = 'rot' | 'rut' | 'gron_solceller' | 'gron_lagring' | 'gron_laddpunkt' | null
export type DetailLevel = 'detailed' | 'subtotals_only' | 'total_only'
export type StandardTextType = 'introduction' | 'conclusion' | 'not_included' | 'ata_terms' | 'payment_terms'

export interface QuoteItem {
  id: string
  quote_id?: string
  business_id?: string
  item_type: QuoteItemType
  group_name?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  cost_price?: number
  article_number?: string
  category_slug?: string
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  rot_rut_type?: RotRutType
  /** Endast item_type 'option': kundens val — true = tillvalet är ikryssat
      och räknas i totalen (initieras från option_default; skrivs vid signering). */
  option_selected?: boolean
  /** Endast item_type 'option': hantverkarens "Förvald"-toggle —
      true = tillvalet är förikryssat när kunden öppnar offerten. */
  option_default?: boolean
  sort_order: number
  // Spårar om raden sparats till prislistan ("Spara i prislistan"-flödet).
  // Tomt = inte sparad. UUID = sparad och kopplad till products.id.
  linked_product_id?: string | null
  /** Produktbank (v67): kr av radens total som är arbete. AUKTORITATIV för
      ROT/RUT-basen när satt — 0 är GILTIGT (ren material, ger bas 0).
      null/undefined = ingen split → motorn använder radens total (legacy). */
  labor_amount?: number | null
  /** Härledd: total − labor_amount (aldrig egen beräkning). */
  material_amount?: number | null
  /** Kalkylerade timmar = quantity × Σ(arbetskomponenters quantity_per_unit). */
  estimated_hours?: number | null
  /** Fryst kopia av produktens komponenter + namn/sku/pris/labor_share vid
      infogningsögonblicket — offerten är juridiskt fristående från produktbanken. */
  component_snapshot?: any | null
  /** Per-rad-override: visa komponentbeskrivningarna för kunden (default false). */
  show_components_to_customer?: boolean
  /** Dold för kunden — raden syns INTE i kundens dokument (förhandsgranskning,
      PDF, kundvy) men PRISET INGÅR I SUMMAN oförändrat. Avsett för marginal-
      och detaljrader hantverkaren inte vill specificera utåt.
      Beräkningarna i lib/quote-calculations.ts rör den ALDRIG — hade raden
      exkluderats ur summan hade det bara varit "ta bort rad light", och
      kunden hade kunnat räkna ihop raderna och få en annan totalsumma.
      Beslut av Andreas 2026-08-05. */
  is_hidden?: boolean
  /** P4 (UX-revision 2026-08-03): true om raden kom från AI:n utan träff i
      produktbanken (unitPrice 0 eller note "PRIS SAKNAS" — se
      lib/ai-quote-generator.ts). Sätts vid AI-konvertering
      (convertLegacyItems i app/dashboard/quotes/new/page.tsx, sourceIsAi=true)
      och rörs aldrig av manuell radredigering.
      Fas 1.7 (offert-omtaget, 2026-08-31): ANDRA medvetna avsändaren är
      lib/quotes/resolve-template-item-prices.ts — en mallrad (bygg-/el-/
      VVS-mallarna i lib/quote-template-defaults.ts) vars gissade materialpris
      eller fasta paketpris inte kunde bekräftas mot en riktig artikel i
      produktbanken. Samma "prislös tills bekräftad"-princip, samma UI. Styr
      amber-markeringen på prisfältet i editorn (ItemRow) samt "Spara i
      produktbanken"-nudgen när användaren fyller i ett pris. Editor-internt —
      strippas innan quote_items POSTas (saveQuote). */
  ai_price_missing?: boolean
  /** Checkbox-state för samma nudge — default true på ai_price_missing-rader.
      Kryssade rader med unit_price > 0 POSTas till /api/products vid
      offert-spar, sedan strippas fältet innan quote_items skickas. */
  save_to_products?: boolean
  /** Kvittoprincipen Fall 3 (docs/design/SYNLIG-INTELLIGENS.md, 2026-08-13):
      AI:n var under säkerhetströskeln (70%) på just DENNA rad
      (GeneratedQuoteItem.confidence, lib/ai-quote-generator.ts). Samma
      livscykel som ai_price_missing — sätts endast vid AI-konvertering,
      editor-internt, strippas innan quote_items POSTas. Själva
      procenttalet visas medvetet aldrig per rad (falsk precision i en
      lista) — bara en "Osäker"-markör + modellens egen not. */
  ai_uncertain?: boolean
  /** Modellens egen fritext-motivering för osäkerheten (t.ex. "Mängden är
      svår att bedöma från fotot"). Tom/undefined på rader ≥ tröskeln —
      tystnad är normalläget. Samma strip-regel som ai_uncertain. */
  ai_note?: string | null
}

export interface QuoteTemplate {
  id: string
  business_id: string
  name: string
  description?: string
  branch?: string
  category?: string
  introduction_text?: string
  conclusion_text?: string
  not_included?: string
  ata_terms?: string
  payment_terms_text?: string
  /** Fria "övriga villkor" — separat fält från de fem StandardTextType-
      kategorierna (v72-migrationen). Nullable tills sql/v72_quote_template_terms.sql
      körts manuellt; koden måste tåla att kolumnen saknas i databasen. */
  terms_text?: string
  default_items: QuoteItem[]
  default_payment_plan: PaymentPlanEntry[]
  detail_level: DetailLevel
  show_unit_prices: boolean
  show_quantities: boolean
  rot_enabled: boolean
  rut_enabled: boolean
  is_favorite: boolean
  usage_count: number
  created_at?: string
  updated_at?: string
}

export interface QuoteStandardText {
  id: string
  business_id: string
  text_type: StandardTextType
  name: string
  content: string
  is_default: boolean
  created_at?: string
  updated_at?: string
}

export interface PaymentPlanEntry {
  label: string
  percent: number
  amount: number
  due_description: string
}

export interface QuoteTotals {
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
  /** Grön teknik (Fas 1): bas = FULL radtotal (arbete + material), ej bara arbete. */
  gronBase: number
  gronDeduction: number
  gronCustomerPays: number
  /** Summan av rot/rut/grön-avdrag — för blandade offerter med flera avdragstyper. */
  totalDeduction: number
  /** total − totalDeduction — vad kunden faktiskt betalar när flera avdragstyper förekommer. */
  customerPaysAfterDeductions: number
}

// Extended quote object with all new fields
export interface EnhancedQuote {
  quote_id: string
  business_id: string
  customer_id: string | null
  quote_number?: string
  status: string
  title: string
  description?: string

  // Legacy JSONB items (backwards compat)
  items?: any[]
  // New structured items
  quote_items?: QuoteItem[]

  // Texts
  introduction_text?: string
  conclusion_text?: string
  not_included?: string
  ata_terms?: string
  payment_terms_text?: string

  // Payment plan
  payment_plan?: PaymentPlanEntry[]

  // References
  reference_person?: string
  customer_reference?: string
  project_address?: string

  // Display settings
  detail_level: DetailLevel
  show_unit_prices: boolean
  show_quantities: boolean

  // Financial
  labor_total: number
  material_total: number
  subtotal: number
  discount_percent: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  total: number

  // ROT/RUT legacy
  rot_rut_type?: string | null
  rot_rut_eligible?: number
  rot_rut_deduction?: number
  customer_pays?: number

  // ROT/RUT new split
  rot_work_cost?: number
  rot_deduction?: number
  rot_customer_pays?: number
  rut_work_cost?: number
  rut_deduction?: number
  rut_customer_pays?: number

  // Personal info for ROT/RUT
  personnummer?: string
  fastighetsbeteckning?: string

  // Attachments
  attachments?: any[]

  // Metadata
  valid_until?: string
  sent_at?: string | null
  opened_at?: string | null
  accepted_at?: string | null
  declined_at?: string | null
  decline_reason?: string | null
  created_at?: string
  updated_at?: string

  // AI
  ai_generated?: boolean
  ai_confidence?: number
  source_transcript?: string
  template_id?: string

  // Versioning
  version_number?: number
  parent_quote_id?: string | null
  version_label?: string | null

  // Signature
  signature_data?: string
  signed_at?: string
  signed_by_name?: string

  // Customer (enriched)
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string
    personal_number?: string
    property_designation?: string
  }
}
