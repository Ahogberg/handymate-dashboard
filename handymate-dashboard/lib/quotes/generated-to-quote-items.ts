/**
 * Godkännande-kedjan (2026-08-04, "kritisk söm"-fixen): approvals/[id]/route.ts
 * POSTAR till /api/quotes/ai-generate vid godkännande av
 * create_quote_draft/quote_request/quote_addition/create_ata_draft — men
 * ai-generate SKAPAR ALDRIG en rad, den bara RETURNERAR ett genererat
 * offertobjekt (GeneratedQuote, lib/ai-quote-generator.ts). Hantverkaren
 * godkände, ingenting sparades. Denna fil bygger bron: en ren mappning från
 * GeneratedQuote-svarets rader (GeneratedQuoteItem[]) till strukturerade
 * QuoteItem[] enligt POST /api/quotes-kontraktet (app/api/quotes/route.ts,
 * `body.quote_items`), så exekveraren faktiskt kan POSTa och skapa utkastet.
 *
 * FAS 1 (offert-omtaget, 2026-08-31): den här filen är nu ÄVEN den enda
 * AI-item-konverteraren på klienten. `convertLegacyItems` i
 * app/dashboard/quotes/new/page.tsx (den ursprungliga klient-mappningen) är
 * borttagen — dess enda extra logik jämfört med denna fil (Kvittoprincipen
 * Fall 3: `ai_price_missing`/`save_to_products` när AI:n saknade pris,
 * `ai_uncertain`/`ai_note` när AI:ns självrapporterade träffsäkerhet
 * (`confidence`) ligger under tröskeln) har flyttats hit, styrd av den nya
 * `sourceIsAi`-parametern (default `false` så alla andra anropare —
 * legacy-mallrader, den server-sidiga godkännande-kedjan — är oförändrade).
 *
 * Samma semantik som den gamla klient-mappningen i övrigt:
 *  - Enhetsnormalisering (hour/timmar/h → tim, piece/styck → st).
 *  - Fältmappning (description/unitPrice vs name/unit_price) via den delade
 *    `resolveLegacyItemFields` (lib/quote-calculations.ts) — se den
 *    funktionens kommentar för NaN-buggen den fixar.
 *  - ROT/RUT per rad via legacyItemRotRutType(item.type, suggestedDeductionType)
 *    + setItemRotRut — EXAKT samma rena helpers (Fix 1+2, kodrevision
 *    2026-08-03), inte en egen omimplementation.
 *  - Tillval (quote.options) mappas till item_type 'option' via
 *    applyOptionRowDefaults — alltid avbockade, aldrig förvalda.
 */

import {
  generateItemId,
  setItemRotRut,
  legacyItemRotRutType,
  applyOptionRowDefaults,
  resolveLegacyItemFields,
} from '@/lib/quote-calculations'
import type { QuoteItem } from '@/lib/types/quote'

/** Formen på en rad i ai-generate-svarets `quote.items`/`quote.options`
    (GeneratedQuoteItem, lib/ai-quote-generator.ts) — `description`/
    `unitPrice` är vad ai-generate faktiskt sätter; `name`/`unit_price`
    tolereras som fallback om anroparen skickar en äldre/annan form. */
export interface GeneratedQuoteItemInput {
  description?: string | null
  name?: string | null
  quantity: number
  unit: string
  unitPrice?: number | null
  unit_price?: number | null
  type: 'labor' | 'material' | 'service'
  note?: string | null
  fromPriceList?: boolean
  /** Artikeln i produktbanken raden kopplats till (etapp B1, 2026-08-06).
      Null när ingen säker träff fanns — se lib/products/match-generated-items.ts. */
  linkedProductId?: string | null
  /** AI:ns självrapporterade träffsäkerhet (0-100) för raden. Saknas för
      mall-/legacy-rader — de har ingen AI-bedömning att rapportera. Används
      bara när `sourceIsAi` är true (Kvittoprincipen Fall 3). */
  confidence?: number | null
}

/** Same unit map as the original client-side converter. */
export function normalizeUnit(unit: string | null | undefined): string {
  const map: Record<string, string> = {
    hour: 'tim',
    timmar: 'tim',
    h: 'tim',
    piece: 'st',
    styck: 'st',
  }
  const u = (unit || '').toLowerCase()
  return map[u] || unit || 'st'
}

// Kvittoprincipen Fall 3 (docs/design/SYNLIG-INTELLIGENS.md): samma tröskel
// som strategin föreslår — under den visas "Osäker", över den visas
// ingenting (tystnad är normalläget, ingen grön bock på varje rad).
const AI_ITEM_CONFIDENCE_THRESHOLD = 70

/**
 * Mappar EN GeneratedQuoteItem → QuoteItem (item_type 'item' eller 'option').
 * ROT/RUT och option-defaults sätts via samma rena helpers som den gamla
 * convertLegacyItems använde — enda skillnaden är fältnamnen som läses in.
 *
 * `sourceIsAi` (default false): styr `ai_price_missing`/`ai_uncertain` —
 * ENDAST relevant för genuina AI-förslag. En avsiktligt $0-radad mallrad
 * ("Framkörning ingår") ska INTE amber-markeras som "AI gissade fel pris".
 */
export function mapGeneratedItemToQuoteItem(
  item: GeneratedQuoteItemInput,
  suggestedDeductionType: 'rot' | 'rut' | 'none' | null | undefined,
  itemType: 'item' | 'option',
  sortOrder: number,
  sourceIsAi: boolean = false,
): QuoteItem {
  const { description, quantity, unitPrice } = resolveLegacyItemFields(item)
  const priceMissing =
    sourceIsAi && (unitPrice === 0 || !!(item.note && item.note.includes('PRIS SAKNAS')))
  // Under tröskeln OCH inte redan täckt av "PRIS SAKNAS" (den markeringen
  // säger redan mer, ska inte dubbla).
  const uncertain =
    sourceIsAi && !priceMissing && typeof item.confidence === 'number' && item.confidence < AI_ITEM_CONFIDENCE_THRESHOLD

  return applyOptionRowDefaults(
    setItemRotRut(
      {
        id: generateItemId(),
        item_type: itemType,
        description,
        quantity,
        unit: normalizeUnit(item.unit),
        unit_price: unitPrice,
        total: quantity * unitPrice,
        is_rot_eligible: false,
        is_rut_eligible: false,
        sort_order: sortOrder,
        // ETAPP B1: kopplingen till produktbanken följer med in i den sparade
        // raden. Utan den blir en godkänd AI-offert lika tom under ytan som
        // före B1 — ingen arbetsandel, inget inköpspris, inga produkttriggers
        // för reservationsmotorn.
        ...(item.linkedProductId ? { linked_product_id: item.linkedProductId } : {}),
        ...(priceMissing ? { ai_price_missing: true, save_to_products: true } : {}),
        ...(uncertain ? { ai_uncertain: true, ai_note: item.note || null } : {}),
      },
      legacyItemRotRutType(item.type, suggestedDeductionType),
    ),
  )
}

/**
 * Mappar ett helt GeneratedQuote-svar (items + options) → QuoteItem[] redo
 * att POSTas som `quote_items` till POST /api/quotes, eller att sättas
 * direkt som editorns `items`-state (klientvägen, sourceIsAi=true). Tomma/
 * saknade listor ger tom array (ingen krasch).
 */
export function generatedQuoteToQuoteItems(
  items: GeneratedQuoteItemInput[] | null | undefined,
  options: GeneratedQuoteItemInput[] | null | undefined,
  suggestedDeductionType: 'rot' | 'rut' | 'none' | null | undefined,
  sourceIsAi: boolean = false,
): QuoteItem[] {
  const baseItems = (items || []).map((it, idx) =>
    mapGeneratedItemToQuoteItem(it, suggestedDeductionType, 'item', idx, sourceIsAi),
  )
  const optionItems = (options || []).map((it, idx) =>
    mapGeneratedItemToQuoteItem(it, suggestedDeductionType, 'option', baseItems.length + idx, sourceIsAi),
  )
  return [...baseItems, ...optionItems]
}
