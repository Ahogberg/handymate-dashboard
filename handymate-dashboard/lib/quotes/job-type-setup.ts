/**
 * Epic 2 — urval och beredskap, INTE en prismotor.
 * Priser kommer bara från aktiva bankartiklar. Mallbelopp läses aldrig.
 * Samma DTO används i onboarding och Inställningar → Jobbtyper.
 */
export interface SetupJobType {
  id: string
  slug: string
  name: string
}

export interface SetupItem {
  index: number
  description: string
  unit: string
  linkedProductId: string | null
}

export interface SetupTemplate {
  id: string
  name: string
  category: string | null
  jobTypeSlug: string | null
  updatedAt: string | null
  items: SetupItem[]
}

export interface SetupProduct {
  id: string
  name: string
  unit: string
  salesPrice: number | null
}

export interface QuoteSetupData {
  jobTypes: SetupJobType[]
  templates: SetupTemplate[]
  products: SetupProduct[]
  linkingAvailable: boolean
}

export interface FirstQuoteSelection {
  jobTypeSlug: string
  templateId: string
}

export interface SetupRow {
  item: SetupItem
  product: SetupProduct | null
  status: 'priced' | 'price_missing' | 'product_missing' | 'unit_mismatch'
}

export function sameUnit(a: string, b: string): boolean {
  // Bara exakta enheter. Ingen mängdomräkning, ingen gissning st↔paket.
  return typeof a === 'string' && typeof b === 'string' && a.trim().length > 0 && a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function templatesForJobType(templates: SetupTemplate[], slug: string): SetupTemplate[] {
  return templates.filter(t => t.jobTypeSlug === slug)
}

export function resolveFirstQuoteSelection(data: QuoteSetupData, value: unknown): FirstQuoteSelection | null {
  if (!value || typeof value !== 'object' || !data.linkingAvailable) return null
  const { jobTypeSlug, templateId } = value as Partial<FirstQuoteSelection>
  if (!data.jobTypes.some(j => j.slug === jobTypeSlug)) return null
  if (!data.templates.some(t => t.id === templateId && t.jobTypeSlug === jobTypeSlug && t.items.length > 0)) return null
  return { jobTypeSlug: jobTypeSlug!, templateId: templateId! }
}

export function inspectTemplate(template: SetupTemplate, products: SetupProduct[]): SetupRow[] {
  const byId = new Map(products.map(p => [p.id, p]))
  return template.items.map(item => {
    // En trasig länk faller aldrig tillbaka till en liknande produkt.
    const product = item.linkedProductId ? byId.get(item.linkedProductId) ?? null : null
    const status = !product ? 'product_missing'
      : !sameUnit(item.unit, product.unit) ? 'unit_mismatch'
      : typeof product.salesPrice === 'number' && Number.isFinite(product.salesPrice) && product.salesPrice > 0
        ? 'priced' : 'price_missing'
    return { item, product, status }
  })
}

/** Unika verkliga artiklar, inte de första tio arbetsartiklarna i alfabetet. */
export function relevantProducts(template: SetupTemplate, products: SetupProduct[]): SetupProduct[] {
  const seen = new Set<string>()
  return inspectTemplate(template, products).flatMap(row => {
    if (!row.product || row.status === 'unit_mismatch' || seen.has(row.product.id)) return []
    seen.add(row.product.id)
    return [row.product]
  })
}

export function setupSummary(rows: SetupRow[]): string {
  if (!rows.length) return 'Mallen har inga artikelrader ännu.'
  const priced = rows.filter(r => r.status === 'priced').length
  const missing = rows.filter(r => r.status === 'price_missing').length
  const unlinked = rows.length - priced - missing
  return [
    `${priced} av ${rows.length} rader har ett artikelpris`,
    missing > 0 ? `${missing} saknar pris` : '',
    unlinked > 0 ? `${unlinked} behöver artikelkoppling` : '',
  ].filter(Boolean).join(' · ')
}

/**
 * En begriplig startrekommendation, aldrig en grind. Vi räknar unika,
 * verkligt kopplade och prissatta artiklar — inte mallrader (samma artikel
 * kan förekomma flera gånger). Tre till fem räcker för att visa nyttan utan
 * att göra onboardingen till registeradministration.
 */
export function coreArticleGuidance(rows: SetupRow[]): string {
  const count = new Set(rows.flatMap(row => row.status === 'priced' && row.product ? [row.product.id] : [])).size
  if (count === 0) return 'Börja gärna med 3–5 återkommande nyckelartiklar för jobbtypen.'
  if (count < 3) return `${count} ${count === 1 ? 'nyckelartikel är' : 'nyckelartiklar är'} klar. Lägg gärna till några återkommande rader när de finns.`
  if (count <= 5) return `${count} nyckelartiklar är prissatta — en bra start för nästa offert.`
  return `${count} återkommande artiklar är prissatta för jobbtypen.`
}

/** Smal DTO: mallens gamla pris, kvantitet och totalsumma följer INTE med. */
export function toSetupTemplate(row: Record<string, unknown>): SetupTemplate {
  const rawItems = Array.isArray(row.default_items) ? row.default_items : []
  return {
    id: String(row.id), name: String(row.name),
    category: typeof row.category === 'string' ? row.category : null,
    jobTypeSlug: typeof row.job_type_slug === 'string' ? row.job_type_slug : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    items: rawItems.flatMap((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const type = item.item_type || 'item'
      if (type !== 'item' && type !== 'option') return []
      return [{ index, description: String(item.description || ''), unit: String(item.unit || ''),
        linkedProductId: typeof item.linked_product_id === 'string' ? item.linked_product_id : null }]
    }),
  }
}
