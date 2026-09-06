import type { SupabaseClient } from '@supabase/supabase-js'
import { QuoteSetupError, nextTemplateVersion } from './job-type-setup-server'
import { toSetupTemplate } from './job-type-setup'
import { getFeatureLimit, type PlanType } from '@/lib/feature-gates'
import { getAllDefaultTemplateNames } from '@/lib/quote-template-defaults'

export function validateStandardRows(value: unknown): { productId: string; quantity: number }[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new QuoteSetupError(400, 'Välj mellan 1 och 100 artikelrader.')
  return value.map(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).some(k => !['productId', 'quantity'].includes(k)) ||
      typeof row.productId !== 'string' || !row.productId || row.productId.length > 200 ||
      typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > 1000000) {
      throw new QuoteSetupError(400, 'Välj en artikel och en mängd större än noll.')
    }
    return { productId: row.productId, quantity: row.quantity }
  })
}

/** Server-owned article identity/unit/tax metadata. Template prices are never invented. */
async function productRows(db: SupabaseClient, businessId: string, value: unknown) {
  const rows = validateStandardRows(value)
  const { data, error } = await db.from('products').select('*').eq('business_id', businessId)
    .eq('is_active', true).in('id', Array.from(new Set(rows.map(r => r.productId))))
  if (error) throw new QuoteSetupError(503, 'Kunde inte läsa artiklarna.')
  return rows.map(row => {
    const product = data?.find(p => p.id === row.productId)
    if (!product || !product.unit) throw new QuoteSetupError(400, 'En artikel saknas, är inaktiv eller saknar enhet. Läs in artiklarna igen.')
    return { standard_product: true, item_type: 'item', description: product.name, quantity: row.quantity, unit: product.unit,
      unit_price: 0, linked_product_id: product.id, article_number: product.sku ?? null,
      is_rot_eligible: !!product.rot_eligible, is_rut_eligible: !!product.rut_eligible,
      discount_percent: 0 }
  })
}

export async function writeJobStandard(db: SupabaseClient, businessId: string, input: unknown, plan: PlanType = 'starter') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new QuoteSetupError(400, 'Ogiltigt upplägg.')
  const body = input as Record<string, any>
  if (Object.keys(body).some(k => !['operation', 'jobTypeSlug', 'templateId', 'updatedAt', 'itemIndex', 'quantity', 'rows'].includes(k)) ||
    !['create', 'append', 'quantity', 'remove', 'replace'].includes(body.operation) ||
    typeof body.jobTypeSlug !== 'string' || !body.jobTypeSlug || body.jobTypeSlug.length > 100) throw new QuoteSetupError(400, 'Ogiltigt upplägg.')
  const { data: job, error: jobError } = await db.from('job_types').select('id, slug, name').eq('business_id', businessId)
    .eq('slug', body.jobTypeSlug).eq('is_active', true).maybeSingle()
  if (jobError) throw new QuoteSetupError(503, 'Kunde inte läsa jobbtypen.')
  if (!job) throw new QuoteSetupError(404, 'Jobbtypen finns inte eller är arkiverad.')

  if (body.operation === 'create') {
    const { data: linked, error } = await db.from('quote_templates').select('*').eq('business_id', businessId).eq('job_type_slug', job.slug)
    if (error) throw new QuoteSetupError(503, 'Kunde inte läsa offertuppläggen. Kontrollera att jobbtypskopplingen är aktiverad.')
    if (linked?.length === 1) return toSetupTemplate(linked[0])
    if (linked?.length) throw new QuoteSetupError(409, 'Jobbet har flera upplägg. Välj vilket du vill ändra.')
    const limit = getFeatureLimit(plan, 'quote_templates')
    if (limit !== null) {
      const { data: names, error: countError } = await db.from('quote_templates').select('name').eq('business_id', businessId)
      if (countError) throw new QuoteSetupError(503, 'Kunde inte kontrollera antalet mallar.')
      const seeds = new Set(getAllDefaultTemplateNames())
      if ((names || []).filter(t => !seeds.has(t.name)).length >= limit) throw new QuoteSetupError(403, `Maxgränsen på ${limit} offertmallar är nådd. Använd en befintlig mall eller uppgradera.`)
    }
    // Same job, same id: concurrent requests cannot create duplicate standards.
    const id = `qstd_${job.id}`
    const { data: created, error: createError } = await db.from('quote_templates').insert({ id, business_id: businessId,
      name: `Standardrader · ${job.name}`, job_type_slug: job.slug, default_items: [], updated_at: new Date().toISOString() }).select('*').single()
    if (createError?.code === '23505') {
      const { data: existing, error: retryError } = await db.from('quote_templates').select('*').eq('business_id', businessId).eq('id', id).maybeSingle()
      if (!retryError && existing?.job_type_slug === job.slug) return toSetupTemplate(existing)
    }
    if (createError) throw new QuoteSetupError(503, 'Kunde inte skapa standardraderna.')
    return toSetupTemplate(created)
  }

  if (typeof body.templateId !== 'string' || !body.templateId || body.templateId.length > 200 ||
    !(body.updatedAt === null || typeof body.updatedAt === 'string')) throw new QuoteSetupError(400, 'Välj ett upplägg att ändra.')
  const { data: template, error } = await db.from('quote_templates').select('*').eq('business_id', businessId).eq('id', body.templateId).maybeSingle()
  if (error) throw new QuoteSetupError(503, 'Kunde inte läsa standardraderna.')
  if (!template || template.job_type_slug !== job.slug) throw new QuoteSetupError(404, 'Upplägget hör inte till jobbtypen.')
  if ((template.updated_at ?? null) !== body.updatedAt) throw new QuoteSetupError(409, 'Upplägget har ändrats. Läs in det igen innan du sparar.')
  const items: Record<string, any>[] = Array.isArray(template.default_items) ? template.default_items : []
  let next = [...items]
  if (body.operation === 'append' || body.operation === 'replace') {
    const rows = await productRows(db, businessId, body.rows)
    next = body.operation === 'replace' ? rows : [...items, ...rows]
    if (next.length > 200) throw new QuoteSetupError(400, 'Upplägget kan ha högst 200 rader.')
  } else {
    const index = body.itemIndex
    if (!Number.isInteger(index) || index < 0 || !items[index] || !['item', 'option'].includes(items[index].item_type || 'item')) throw new QuoteSetupError(400, 'Välj en artikelrad.')
    if (body.operation === 'quantity') {
      if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity <= 0 || body.quantity > 1000000) throw new QuoteSetupError(400, 'Mängden måste vara större än noll.')
      next[index] = { ...items[index], quantity: body.quantity }
    } else next.splice(index, 1)
  }
  let query = db.from('quote_templates').update({ default_items: next, updated_at: nextTemplateVersion(template.updated_at) }).eq('business_id', businessId).eq('id', template.id)
  query = body.updatedAt === null ? query.is('updated_at', null) : query.eq('updated_at', body.updatedAt)
  const { data: saved, error: saveError } = await query.select('*').maybeSingle()
  if (saveError) throw new QuoteSetupError(503, 'Kunde inte spara standardraderna.')
  if (!saved) throw new QuoteSetupError(409, 'Upplägget har ändrats. Läs in det igen innan du sparar.')
  return toSetupTemplate(saved)
}
