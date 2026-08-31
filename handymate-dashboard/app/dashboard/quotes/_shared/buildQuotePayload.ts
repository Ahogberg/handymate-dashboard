import { recalculateItems } from '@/lib/quote-calculations'
import { extractStoragePath } from '@/lib/storage-signing'
import type {
  DetailLevel,
  PaymentPlanEntry,
  QuoteItem,
} from '@/lib/types/quote'
import type { ReservationSnapshotEntry } from '@/lib/reservations/match'

/**
 * Alla fält som `POST /api/quotes` (create-läget) behöver, UTOM `items` —
 * items hanteras separat av `useQuoteBuilderSave` eftersom de kan mutera
 * (produktbanks-auto-länkning) precis innan payloaden byggs. Se den filens
 * docblock.
 *
 * Extraherad ur `new/page.tsx`s `saveQuote` (Fas 1, offert-omtaget
 * 2026-08-31) — ren funktion, inga fetch-anrop, inget state.
 */
export interface QuotePayloadContext {
  selectedCustomer: string
  title: string
  description: string
  vatRate: number
  discountPercent: number
  notIncluded: string
  ataTerms: string
  paymentTermsText: string
  termsText: string
  reservationsSnapshot: ReservationSnapshotEntry[]
  paymentPlan: PaymentPlanEntry[]
  paymentPlanValid: boolean
  calculatedPaymentPlan: PaymentPlanEntry[]
  referencePerson: string
  customerReference: string
  projectAddress: string
  detailLevel: DetailLevel
  showUnitPrices: boolean
  showQuantities: boolean
  hasRotItems: boolean
  hasRutItems: boolean
  personnummer: string
  fastighetsbeteckning: string
  validDays: number
  /** Create-läget-specifika AI-/mall-/koppling-fält — OPTIONELLA sedan Fas 2
      (offert-omtaget, 2026-08-31): edit-lägets getContext() sätter INGA av
      dem, och buildQuotePayload utelämnar dem HELT (inte bara `null`) ur
      PUT-bodyn när mode==='edit'. Anledningen är PUT-ruttens `if (body.field
      !== undefined)`-mönster (app/api/quotes/route.ts) — särskilt
      `deal_id`, som PUT FAKTISKT skriver om fältet finns i bodyn. Hade
      edit-payloaden skickat `deal_id: null` (som create gör) hade VARJE
      autospar av en befintlig offert nollat dess affärskoppling. */
  aiGenerated?: boolean
  aiConfidence?: number | null
  sourceTranscript?: string | null
  templateId?: string | undefined
  quoteJobType?: string | null
  dealId?: string | null
  leadId?: string | null
  templateStyle: 'modern' | 'premium' | 'friendly' | null
  attachments: Array<{ name: string; url: string; size?: number; path?: string }>
  /** 'draft' är default (create-läget). Edit-läget sätter detta till
      offertens LADDADE status (idempotent autospar) eller 'sent' explicit
      vid Skicka — se useQuoteBuilderSave.ts. */
  status?: string
}

export interface BuildQuotePayloadInput extends QuotePayloadContext {
  /** De redan (ev. produktbanks-)uppdaterade raderna — INTE nödvändigtvis
      samma referens som `items`-state, se useQuoteBuilderSave. */
  items: QuoteItem[]
  /** 'create' → POST /api/quotes (new/page.tsx via QuoteBuilder).
      'edit' → PUT /api/quotes (Fas 2, [id]/edit/page.tsx via QuoteBuilder) —
      kräver `quoteId`. */
  mode: 'create' | 'edit'
  /** Krävs när mode==='edit' — PUT-ruttens body.quote_id. */
  quoteId?: string
}

/**
 * Bygger POST-bodyn för `/api/quotes`. Ren funktion — samma indata ger alltid
 * samma utdata, inga side effects.
 *
 * Städar bort editor-interna flaggor (P4 + Kvittoprincipen Fall 3:
 * `ai_price_missing`/`save_to_products`/`ai_uncertain`/`ai_note`) från
 * raderna innan de skickas — de ska aldrig fastna i den sparade offerten.
 */
export function buildQuotePayload(input: BuildQuotePayloadInput) {
  const finalItems = recalculateItems(input.items)
    .map((item, idx) => ({ ...item, sort_order: idx }))
    .map(({ ai_price_missing, save_to_products, ai_uncertain, ai_note, ...rest }) => rest)

  const base = {
    ...(input.mode === 'edit' ? { quote_id: input.quoteId } : {}),
    customer_id: input.selectedCustomer || null,
    status: input.status || 'draft',
    title: input.title,
    description: input.description,
    quote_items: finalItems,
    vat_rate: input.vatRate,
    discount_percent: input.discountPercent,
    not_included: input.notIncluded || null,
    ata_terms: input.ataTerms || null,
    payment_terms_text: input.paymentTermsText || null,
    terms_text: input.termsText || null,
    reservations_snapshot: input.reservationsSnapshot.length > 0 ? input.reservationsSnapshot : null,
    payment_plan: input.paymentPlan.length > 0 ? input.calculatedPaymentPlan : null,
    reference_person: input.referencePerson || null,
    customer_reference: input.customerReference || null,
    project_address: input.projectAddress || null,
    detail_level: input.detailLevel,
    show_unit_prices: input.showUnitPrices,
    show_quantities: input.showQuantities,
    personnummer: input.hasRotItems || input.hasRutItems ? input.personnummer || null : null,
    fastighetsbeteckning: input.hasRotItems ? input.fastighetsbeteckning || null : null,
    valid_days: input.validDays,
    template_style: input.templateStyle,
    // Spara path, ALDRIG den kortlivade signerade visnings-URL:en (a.url) —
    // se lib/storage-signing.ts. a.path finns för nytt uppladdade/förifyllda
    // bilagor; extractStoragePath läker även en eventuell legacy publik URL
    // tillbaka till path.
    attachments: input.attachments.length > 0
      ? input.attachments.map(a => ({
          name: a.name,
          url: a.path || extractStoragePath(a.url, 'customer-documents') || a.url,
          size: a.size,
        }))
      : [],
  }

  // Create-läget-specifika fält utelämnas HELT ur edit-payloaden (inte bara
  // satta till null) — se QuotePayloadContext-docblocket ovan för varför
  // (PUT-ruttens `!== undefined`-mönster, särskilt deal_id).
  if (input.mode === 'create') {
    return {
      ...base,
      ai_generated: input.aiGenerated || false,
      ai_confidence: input.aiConfidence || null,
      source_transcript: input.sourceTranscript || null,
      template_id: input.templateId || null,
      job_type: input.quoteJobType,
      deal_id: input.dealId,
      lead_id: input.leadId,
    }
  }

  return base
}
