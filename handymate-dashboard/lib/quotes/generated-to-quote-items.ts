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
 * FACIT-KÄLLA: convertLegacyItems i app/dashboard/quotes/new/page.tsx är den
 * ursprungliga klient-mappningen (samma UI-knapp, samma ai-generate-svar) —
 * samma semantik återanvänds här:
 *  - Enhetsnormalisering (hour/timmar/h → tim, piece/styck → st).
 *  - ROT/RUT per rad via legacyItemRotRutType(item.type, suggestedDeductionType)
 *    + setItemRotRut — EXAKT samma rena helpers som klienten (Fix 1+2,
 *    kodrevision 2026-08-03), inte en egen omimplementation.
 *  - Tillval (quote.options) mappas till item_type 'option' via
 *    applyOptionRowDefaults — alltid avbockade, aldrig förvalda.
 *
 * AVVIKELSE FRÅN convertLegacyItems (medveten, inte en bugg här): den
 * klient-sidiga signaturen är typad mot ett legacy-fält-schema
 * (`item.name`, `item.unit_price`) som INTE matchar det faktiska
 * GeneratedQuoteItem-svaret (`description`, `unitPrice` — se
 * lib/ai-quote-generator.ts rad 503-513). I klienten döljs detta av `quote:
 * any`, så TypeScript fångar det aldrig — item.unit_price blir `undefined`
 * och `total` blir `NaN` för AI-genererade rader (endast maskerat i UI:t
 * genom att `recalculateItems`/editorns egna quantity×unit_price-omräkning
 * körs om innan visning). Den här servermappningen läser fälten som
 * ai-generate FAKTISKT skickar (`description`/`unitPrice`), med `name`/
 * `unit_price` som fallback för robusthet — INTE en blind kopiering av
 * klientens fältnamn. Rapporterat som separat, oåtgärdad brist i
 * quotes/new/page.tsx (utanför denna körnings scope).
 */

import { generateItemId, setItemRotRut, legacyItemRotRutType, applyOptionRowDefaults } from '@/lib/quote-calculations'
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
}

/** Samma enhetsnormalisering som convertLegacyItems (app/dashboard/quotes/new/page.tsx). */
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

/**
 * Mappar EN GeneratedQuoteItem → QuoteItem (item_type 'item' eller 'option').
 * ROT/RUT och option-defaults sätts via samma rena helpers som
 * convertLegacyItems använder — enda skillnaden är fältnamnen som läses in.
 */
export function mapGeneratedItemToQuoteItem(
  item: GeneratedQuoteItemInput,
  suggestedDeductionType: 'rot' | 'rut' | 'none' | null | undefined,
  itemType: 'item' | 'option',
  sortOrder: number,
): QuoteItem {
  const description = item.description || item.name || ''
  const quantity = item.quantity || 0
  const unitPrice = item.unitPrice ?? item.unit_price ?? 0

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
      },
      legacyItemRotRutType(item.type, suggestedDeductionType),
    ),
  )
}

/**
 * Mappar ett helt GeneratedQuote-svar (items + options) → QuoteItem[] redo
 * att POSTas som `quote_items` till POST /api/quotes. Tomma/saknade listor
 * ger tom array (ingen krasch) — POST /api/quotes hanterar redan tom
 * quote_items genom att falla tillbaka på legacy items-vägen, men
 * exekveraren (approvals/[id]/route.ts) ska aldrig anropa detta med ett
 * helt tomt AI-svar (se caller: fel returneras redan om ai-generate inte
 * gav några rader).
 */
export function generatedQuoteToQuoteItems(
  items: GeneratedQuoteItemInput[] | null | undefined,
  options: GeneratedQuoteItemInput[] | null | undefined,
  suggestedDeductionType: 'rot' | 'rut' | 'none' | null | undefined,
): QuoteItem[] {
  const baseItems = (items || []).map((it, idx) =>
    mapGeneratedItemToQuoteItem(it, suggestedDeductionType, 'item', idx),
  )
  const optionItems = (options || []).map((it, idx) =>
    mapGeneratedItemToQuoteItem(it, suggestedDeductionType, 'option', baseItems.length + idx),
  )
  return [...baseItems, ...optionItems]
}
