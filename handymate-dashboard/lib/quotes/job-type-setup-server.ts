import type { SupabaseClient } from '@supabase/supabase-js'
import { sameUnit, toSetupTemplate, type QuoteSetupData } from './job-type-setup'

export class QuoteSetupError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function missingLinkColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && ['42703', 'PGRST204'].includes(error.code || '') && /job_type_slug/.test(error.message || '')
}

/** Ingen tyst PostgREST-kapning: alla sidor, stabil primärnyckelordning. */
async function readAll(db: SupabaseClient, table: 'products' | 'quote_templates' | 'job_types', businessId: string) {
  const result: Record<string, any>[] = []
  for (let offset = 0; offset < 10000; offset += 500) {
    let q = db.from(table).select('*').eq('business_id', businessId).order('id').range(offset, offset + 499)
    if (table !== 'quote_templates') q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) throw new QuoteSetupError(503, 'Kunde inte läsa offertunderlaget. Försök igen.')
    result.push(...(data || []))
    if ((data || []).length < 500) return result
  }
  throw new QuoteSetupError(503, 'Underlaget är för stort för att visas här. Kontakta supporten.')
}

export async function loadQuoteSetup(db: SupabaseClient, businessId: string): Promise<QuoteSetupData> {
  // En tom tabell säger inget om kolumnens existens. Nollradsproben gör det.
  const { error: probeError } = await db.from('quote_templates').select('job_type_slug')
    .eq('business_id', businessId).limit(0)
  if (probeError && !missingLinkColumn(probeError)) throw new QuoteSetupError(503, 'Kunde inte läsa offertunderlaget.')
  const [jobs, templates, products] = await Promise.all([
    readAll(db, 'job_types', businessId), readAll(db, 'quote_templates', businessId), readAll(db, 'products', businessId),
  ])
  return {
    linkingAvailable: !probeError,
    jobTypes: jobs.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'sv'))
      .map(j => ({ id: j.id, slug: j.slug, name: j.name })),
    templates: templates.map(toSetupTemplate).sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    products: products.map(p => ({ id: p.id, name: String(p.name || ''), unit: typeof p.unit === 'string' ? p.unit : '',
      salesPrice: Number.isFinite(Number(p.sales_price)) && p.sales_price !== null ? Number(p.sales_price) : null })),
  }
}

/** Ägarskap valideras före första skrivning; CAS skyddar parallell mallredigering. */
export async function linkTemplateToJobType(db: SupabaseClient, businessId: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new QuoteSetupError(400, 'Ogiltigt val.')
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(k => !['templateId', 'jobTypeSlug', 'updatedAt'].includes(k)) ||
      typeof body.templateId !== 'string' || body.templateId.length > 200 ||
      !(body.jobTypeSlug === null || (typeof body.jobTypeSlug === 'string' && body.jobTypeSlug.length > 0 && body.jobTypeSlug.length <= 100)) ||
      !(body.updatedAt === null || typeof body.updatedAt === 'string')) throw new QuoteSetupError(400, 'Ogiltigt val.')

  const { data: template, error: templateError } = await db.from('quote_templates').select('*')
    .eq('business_id', businessId).eq('id', body.templateId).maybeSingle()
  if (templateError) throw new QuoteSetupError(503, 'Kunde inte läsa mallen.')
  if (!template) throw new QuoteSetupError(404, 'Mallen finns inte.')
  if (!Object.prototype.hasOwnProperty.call(template, 'job_type_slug')) {
    throw new QuoteSetupError(503, 'Jobbtypskopplingen är inte aktiverad ännu. Dina mallar finns kvar.')
  }
  if (body.jobTypeSlug !== null) {
    const { data: job, error } = await db.from('job_types').select('id')
      .eq('business_id', businessId).eq('slug', body.jobTypeSlug).eq('is_active', true).maybeSingle()
    if (error) throw new QuoteSetupError(503, 'Kunde inte kontrollera jobbtypen.')
    if (!job) throw new QuoteSetupError(404, 'Jobbtypen finns inte eller är arkiverad.')
  }
  if ((template.updated_at ?? null) !== body.updatedAt) throw new QuoteSetupError(409, 'Mallen har ändrats. Läs in den igen.')
  let q = db.from('quote_templates').update({ job_type_slug: body.jobTypeSlug, updated_at: new Date().toISOString() })
    .eq('business_id', businessId).eq('id', body.templateId)
  q = body.updatedAt === null ? q.is('updated_at', null) : q.eq('updated_at', body.updatedAt)
  const { data, error } = await q.select('*').maybeSingle()
  if (error) throw new QuoteSetupError(503, 'Kopplingen kunde inte sparas. Försök igen.')
  if (!data) throw new QuoteSetupError(409, 'Mallen har ändrats. Läs in den igen.')
  return toSetupTemplate(data)
}

/** Ändrar endast artikelreferensen i EN mallrad, aldrig mallpris eller offert. */
export async function linkTemplateItem(db: SupabaseClient, businessId: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new QuoteSetupError(400, 'Ogiltigt val.')
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(k => !['templateId', 'itemIndex', 'productId', 'updatedAt'].includes(k)) ||
      typeof body.templateId !== 'string' || body.templateId.length > 200 ||
      typeof body.productId !== 'string' || body.productId.length > 200 ||
      !Number.isInteger(body.itemIndex) || Number(body.itemIndex) < 0 ||
      !(body.updatedAt === null || typeof body.updatedAt === 'string')) throw new QuoteSetupError(400, 'Ogiltigt val.')
  const { data: template, error } = await db.from('quote_templates').select('*')
    .eq('business_id', businessId).eq('id', body.templateId).maybeSingle()
  if (error) throw new QuoteSetupError(503, 'Kunde inte läsa mallen.')
  if (!template) throw new QuoteSetupError(404, 'Mallen finns inte.')
  if ((template.updated_at ?? null) !== body.updatedAt) throw new QuoteSetupError(409, 'Mallen har ändrats. Läs in den igen.')
  const items = template.default_items
  const item = Array.isArray(items) ? items[Number(body.itemIndex)] : null
  if (!item || typeof item !== 'object' || !['item', 'option'].includes(item.item_type || 'item')) {
    throw new QuoteSetupError(400, 'Välj en artikelrad.')
  }
  const { data: product, error: productError } = await db.from('products').select('id, unit, sku')
    .eq('business_id', businessId).eq('id', body.productId).eq('is_active', true).maybeSingle()
  if (productError) throw new QuoteSetupError(503, 'Kunde inte kontrollera artikeln.')
  if (!product) throw new QuoteSetupError(404, 'Artikeln finns inte eller är inaktiv.')
  if (!sameUnit(String(item.unit || ''), typeof product.unit === 'string' ? product.unit : '')) throw new QuoteSetupError(400, 'Enheterna skiljer sig. Ändra mängd och enhet i offertmallen först.')
  const updatedItems = items.map((row: unknown, index: number) => index === body.itemIndex
    ? { ...item, linked_product_id: product.id, article_number: product.sku ?? null } : row)
  let q = db.from('quote_templates').update({ default_items: updatedItems, updated_at: new Date().toISOString() })
    .eq('business_id', businessId).eq('id', body.templateId)
  q = body.updatedAt === null ? q.is('updated_at', null) : q.eq('updated_at', body.updatedAt)
  const { data, error: writeError } = await q.select('*').maybeSingle()
  if (writeError) throw new QuoteSetupError(503, 'Artikelkopplingen kunde inte sparas.')
  if (!data) throw new QuoteSetupError(409, 'Mallen har ändrats. Läs in den igen.')
  return toSetupTemplate(data)
}
