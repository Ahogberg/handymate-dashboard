/**
 * Delad kontext-hämtning för offert-AI:n (Fas 3, offert-omtaget, 2026-08-31).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Tre ställen byggde exakt samma underlag till generateQuoteFromInput
 * (lib/ai-quote-generator.ts) med tre kopior av samma frågor:
 *   - app/api/quotes/ai-generate/route.ts   ("Bygg utkast"-knappen, UI:t)
 *   - lib/quotes/suggest-quote-draft.ts     (bakgrundsförslag från kvalificerad lead)
 *   - app/api/agent/trigger/tool-router.ts  (NY: create_quote_draft, Matte-chatten)
 *
 * price-context.ts:s egen kommentar sa redan "refaktorerad hit så offert-AI:n
 * och agenterna aldrig kan glida isär om vilka artiklar som finns" — men bara
 * PRISLISTAN själv hade fått den behandlingen. Mallarna och kundprislistan
 * dubblerades ändå. Den här filen är steget som gör HELA underlaget till EN
 * källa: fetchPriceContextProducts (redan den kanoniska urvalslogiken) +
 * quote_templates + resolveCustomerPriceList, ihopplockat en gång.
 *
 * Vad den INTE äger: branch/hourlyRate/vatRate. De tre anroparna har olika
 * åtkomst till business_config (UI:t har redan `business` från
 * getAuthenticatedBusiness, bakgrundsförslaget och agent-tool:et måste
 * fråga själva) OCH olika policy för vad som händer när timpriset saknas
 * (UI:t har en levande hantverkare som ser och kan rätta en gissning direkt;
 * bakgrundsförslaget och Matte-verktyget vägrar hellre än att citera ett
 * påhittat pris — se resp. anropare). Att tvinga in den skillnaden i en
 * delad helper hade gömt en medveten produktbeslut bakom en gemensam
 * default. Prislistan, mallarna och kundprislistan har däremot ALDRIG
 * skiljt sig åt mellan anroparna — den delen är den här filen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPriceContextProducts } from '@/lib/products/price-context'
import {
  resolveCustomerPriceList,
  type PriceListItem,
  type QuoteTemplate,
  type CustomerPriceList,
} from '@/lib/ai-quote-generator'

export interface QuoteGenerationContext {
  priceList: PriceListItem[]
  templates: QuoteTemplate[]
  customerPriceList: CustomerPriceList | undefined
}

/**
 * Hämtar prislista (produktbanken, favoriter→namn, limit 100 — samma urval
 * som fetchPriceContextProducts alltid haft), offertmallar (limit 5) och en
 * ev. kundspecifik prislista (price_lists_v2, om customerId anges) — parallellt.
 * Fail-soft ärvs av respektive underliggande hämtare (resolveCustomerPriceList
 * sväljer redan alla fel och returnerar undefined); en trasig produkt- eller
 * mallfråga kastar dock vidare — anroparna körde redan utan eget try/catch
 * runt sina motsvarande frågor, så beteendet är oförändrat.
 */
export async function buildQuoteGenerationContext(
  supabase: SupabaseClient,
  businessId: string,
  customerId?: string | null,
): Promise<QuoteGenerationContext> {
  const [produkter, templatesResult, customerPriceList] = await Promise.all([
    fetchPriceContextProducts(supabase, businessId),
    supabase
      .from('quote_templates')
      .select('name, default_items, category')
      .eq('business_id', businessId)
      .limit(5),
    resolveCustomerPriceList(businessId, customerId ?? undefined),
  ])

  return {
    priceList: produkter.map(p => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      unit_price: p.sales_price,
      // PriceListItem.category är icke-nullbar (arv från de ursprungliga
      // inline-frågorna, som var otypade och därför aldrig kolliderade med
      // detta) — buildPriceContext grupperar redan en tom sträng som
      // "Övrigt", så samma fallback här är korrekt, inte en gissning.
      category: p.category ?? '',
    })),
    templates: templatesResult.data || [],
    customerPriceList,
  }
}

/**
 * Ärlighetsregeln (samma tröskel som suggestQuoteDraftForLead,
 * QUOTE_DRAFT_MIN_NOTES_LENGTH i lib/quotes/suggest-quote-draft.ts): en
 * jobbeskrivning kortare än detta ger inget meningsfullt underlag för
 * AI-generatorn. Ren funktion, ingen I/O — testbar utan mock.
 */
export const QUOTE_DRAFT_MIN_DESCRIPTION_LENGTH = 15

export function hasEnoughDescriptionForAiDraft(description: string | null | undefined): boolean {
  return (description || '').trim().length >= QUOTE_DRAFT_MIN_DESCRIPTION_LENGTH
}
