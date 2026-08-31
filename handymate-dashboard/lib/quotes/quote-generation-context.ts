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
 * Jobbtypsstart (Codex): explicit kopplad mall + dess aktiva produkter
 * prioriteras framför generella topp-100. Kundprisfel stoppar, saknad
 * jobbtypskonfiguration redovisas. Ingen ny modell eller offertskrivare.
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
import { QuoteContextError, quotePriceUnit, type JobTypeGenerationContext } from './job-type-generation'
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
  jobTypeContext: JobTypeGenerationContext
}

/**
 * Delat urval för UI, Matte och bakgrundsförslag. Ingen kund = inget
 * kundavtal; LÄSFEL = stopp, inte ett godtyckligt generellt pris. Okörd
 * jobbtypsmigration kan degradera utan att låtsas att mallen användes.
 */
export async function buildQuoteGenerationContext(
  supabase: SupabaseClient,
  businessId: string,
  customerId?: string | null,
  selection: { jobType?: unknown; templateId?: unknown } = {},
): Promise<QuoteGenerationContext> {
  const jobType = readRef(selection.jobType, 100)
  const templateId = readRef(selection.templateId, 200)
  const verifiedCustomerId = readRef(customerId, 200)
  const [produkter, basis, customerPriceList] = await Promise.all([
    fetchPriceContextProducts(supabase, businessId).catch(() => { throw new QuoteContextError(503, 'Kunde inte läsa artikelpriserna. Försök igen.') }),
    loadBasis(supabase, businessId, jobType, templateId),
    resolveCustomerPriceList(businessId, verifiedCustomerId ?? undefined, { supabase, strict: true }),
  ])
  // Kopplade artiklar först, inklusive dem UTANFÖR vanliga topp-100.
  // Max 100 mallrader: inget tyst bortklipp av ägarens valda underlag.
  const linkedIds = Array.from(new Set(basis.context.rows.flatMap(r => r.linkedProductId ? [r.linkedProductId] : [])))
  let linked: typeof produkter = []
  if (linkedIds.length) {
    const { data, error } = await supabase.from('products').select('id, name, sku, unit, sales_price, category')
      .eq('business_id', businessId).eq('is_active', true).in('id', linkedIds).order('id').limit(100)
    if (error) throw new QuoteContextError(503, 'Kunde inte läsa artiklarna för jobbtypen. Försök igen.')
    linked = data || []
  }
  basis.context.rows = basis.context.rows.map(row => {
    const p = linked.find(p => p.id === row.linkedProductId && quotePriceUnit(p.unit) === quotePriceUnit(row.unit))
    return { ...row, linkedProductId: p?.id ?? null }
  })
  const merged = [...linked, ...produkter.filter(p => !linked.some(l => l.id === p.id))].slice(0, 100)
  return {
    priceList: merged.map(p => ({
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
    templates: basis.templates,
    customerPriceList,
    jobTypeContext: basis.context,
  }
}

function readRef(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new QuoteContextError(400, 'Ogiltig jobbtyp eller mall.')
  return value.trim()
}

async function loadBasis(db: SupabaseClient, businessId: string, jobType: string | null, templateId: string | null): Promise<{
  templates: QuoteTemplate[]; context: JobTypeGenerationContext
}> {
  const context: JobTypeGenerationContext = { status: 'not_requested', jobType, templateId: null, templateName: null, rows: [] }
  if (!jobType && !templateId) {
    const { data, error } = await db.from('quote_templates').select('name, default_items, category')
      .eq('business_id', businessId).order('id').limit(5)
    if (error) throw new QuoteContextError(503, 'Kunde inte läsa offertmallarna. Försök igen.')
    return { context, templates: data || [] }
  }
  if (jobType) {
    const { data, error } = await db.from('job_types').select('id, slug, name')
      .eq('business_id', businessId).eq('slug', jobType).eq('is_active', true).maybeSingle()
    if (error) throw new QuoteContextError(503, 'Kunde inte läsa jobbtypen. Försök igen.')
    if (!data) {
      if (templateId) throw new QuoteContextError(409, 'Jobbtypen finns inte eller är inaktiv. Välj ett aktuellt underlag.')
      return { context: { ...context, status: 'unconfigured' }, templates: [] }
    }
  }
  let q = db.from('quote_templates').select('id, name, default_items, category, job_type_slug')
    .eq('business_id', businessId).order('id').limit(21)
  if (templateId) q = q.eq('id', templateId)
  if (jobType) q = q.eq('job_type_slug', jobType)
  const { data, error } = await q
  if (error) {
    if (['42703', 'PGRST204'].includes(error.code) && /job_type_slug/.test(error.message)) {
      if (templateId) throw new QuoteContextError(409, 'Jobbtypskopplingen kunde inte verifieras. Välj ett underlag när den är aktiverad.')
      return { context: { ...context, status: 'unavailable' }, templates: [] }
    }
    throw new QuoteContextError(503, 'Kunde inte läsa jobbtypens offertmall. Försök igen.')
  }
  if (!data?.length) {
    if (templateId) throw new QuoteContextError(409, 'Mallen finns inte för vald jobbtyp. Välj ett aktuellt underlag.')
    return { context: { ...context, status: 'unconfigured' }, templates: [] }
  }
  if (data.length > 1) throw new QuoteContextError(409,
    'Flera offertmallar är kopplade till jobbtypen. Välj vilken mall som ska användas innan utkastet skapas.',
    data.slice(0, 20).map(t => ({ id: t.id, name: t.name })))
  const t = data[0]
  if (!jobType && t.job_type_slug) {
    const { data: job, error: jobError } = await db.from('job_types').select('id')
      .eq('business_id', businessId).eq('slug', t.job_type_slug).eq('is_active', true).maybeSingle()
    if (jobError) throw new QuoteContextError(503, 'Kunde inte kontrollera mallens jobbtyp.')
    if (!job) throw new QuoteContextError(409, 'Mallens jobbtyp är inaktiv. Välj ett aktuellt underlag.')
  }
  if (!Array.isArray(t.default_items) || t.default_items.length > 100) throw new QuoteContextError(409, 'Mallens rader behöver granskas innan de kan användas för ett utkast.')
  const rows: JobTypeGenerationContext['rows'] = []
  for (const row of t.default_items) {
    if (!row || typeof row !== 'object') throw new QuoteContextError(409, 'Mallen innehåller en ogiltig artikelrad.')
    if (row.is_hidden || !['item', 'option'].includes(row.item_type || 'item')) continue
    if (typeof row.description !== 'string' || !row.description.trim() || row.description.length > 2000 || !quotePriceUnit(row.unit)) {
      throw new QuoteContextError(409, 'En mallrad saknar beskrivning eller enhet. Komplettera mallen först.')
    }
    rows.push({ description: row.description, unit: row.unit,
      linkedProductId: typeof row.linked_product_id === 'string' && row.linked_product_id.length <= 200 ? row.linked_product_id : null,
      option: row.item_type === 'option' })
  }
  return { templates: [{ name: t.name, category: t.category, default_items: [] }],
    context: { status: 'selected', jobType: jobType || t.job_type_slug || null, templateId: t.id, templateName: t.name, rows } }
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
