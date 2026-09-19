import type { ProductDefault } from '@/lib/product-defaults'
import type { DefaultQuoteTemplate } from '@/lib/quote-template-defaults'
import { slugifyJobType } from '@/lib/job-types'

/**
 * Artiklar härledda ur mallraderna (2026-09-17, beslut Andreas).
 *
 * ═══ PROBLEMET SOM MÄTTES ═══
 *
 * En nyseedad firma fick två saker som aldrig hade sett varandra: en startbank
 * på fyra prislösa artiklar (timartikeln, Framkörning, Bortforsling,
 * Deponiavgift) och branschens offertmallar med 22–35 rader. Mätning över alla
 * fyra branscher:
 *
 *   construction: 35 mallrader, 4 artiklar → 0 träffar
 *   electrician:  22 mallrader, 4 artiklar → 0 träffar
 *   plumber:      26 mallrader, 4 artiklar → 0 träffar
 *   painter:      22 mallrader, 4 artiklar → 0 träffar
 *
 * Noll, både på exakt namn+enhet och genom prisupplösningens fuzzy-matchare.
 * Konsekvensen: ingen mallrad bar `linked_product_id`, och frågeflödet per
 * jobbtyp kräver en artikelkoppling för att få röra en mängd
 * (`intakeRowTakesQuantity`). Frågeflödet var alltså dött för varje ny firma
 * tills någon kopplade rader för hand — precis den tvingande
 * artikeladministration före första värdet som inte ska finnas.
 *
 * ═══ LÖSNINGEN, OCH VARFÖR DEN INTE RÖR PRISET ═══
 *
 * Varje distinkt mallrad blir en artikel med radens namn och enhet men UTAN
 * pris. Mallens gissade kronor följer ALDRIG med: "bibliotekets branschpris är
 * orientering, inte företagets sanning" (lib/product-defaults.ts) och
 * "mallens belopp betyder ingenting för det här företaget"
 * (lib/quotes/resolve-template-item-prices.ts). Priset förblir firmans att sätta.
 *
 * Det gör ändringen prisneutral i praktiken: en rad kopplad till en PRISLÖS
 * artikel ger `unit_price: 0` och `ai_price_missing: true` ur
 * resolveTemplateItemPrices explicita gren — exakt vad den omatchade grenen
 * gav förut. Det enda som tillkommer är kopplingen, och det är den som låser
 * upp frågeflödet.
 *
 * ═══ TRE RADER SOM MEDVETET INTE HÄRLEDS ═══
 *
 * 1. `unit === 'tim'`. Timrader prissätts av FIRMANS timpris, och en explicit
 *    koppling prövas FÖRE timregeln i resolveTemplateItemPrices. En koppling
 *    till en prislös artikel hade därför tagit arbetsraden från firmans
 *    timpris till 0 kr. Det är en prisregression, inte en förbättring.
 *    Följden är att frågeflödet ännu inte kan fråga efter timmar — noterat
 *    som nästa steg, inte löst genom att riskera pengar.
 * 2. `unit_price <= 0`. Mallförfattarens avsiktliga nollrad ("material
 *    debiteras löpande med påslag") lämnas orörd av prisupplösningen i dag.
 *    En koppling hade skickat den genom den explicita grenen och flaggat den
 *    som prissaknad — den är inte prissaknad, den är prissatt till "senare".
 * 3. Rader som redan bär `linked_product_id`, och allt som inte är
 *    artikel- eller tillvalsrad.
 *
 * ═══ OCH DEN TREDJE LISTAN: JOBBTYPERNA ═══
 *
 * Samma mätning avslöjade att onboardingens jobbtyper aldrig mött mallbanken
 * heller. Onboardingen erbjuder 15–17 konkreta jobbtyper per bransch i
 * kundens språk ("Renovera badrum", "Installera laddbox", "Måla fasad",
 * app/onboarding/constants SPECIALTIES_BY_TRADE) medan mallarna bara bär två
 * grova ("Allmänt arbete" och branschens "<X>arbete"). Överlapp: 0 av 15–17,
 * i alla fyra branscher. I produktionen har 11 av 14 jobbtyper därför inget
 * upplägg alls.
 *
 * `jobTypeStarters` ger varje sådan jobbtyp branschens generella rader som
 * ett eget upplägg (beslut Andreas 2026-09-17). Arbetsraden prissätts av
 * firmans timpris som vanligt; materialraderna blir prislösa artiklar med
 * koppling, alltså mål för frågeflödet. Hantverkaren byter ut raderna under
 * "Vad brukar ingå?" när han vet bättre — men han börjar aldrig från tomt.
 */

/** Radformen den här modulen behöver ur `quote_templates.default_items`. */
export interface TemplateArticleRow {
  item_type?: string | null
  description?: string | null
  unit?: string | null
  unit_price?: number | null
  linked_product_id?: string | null
}

export interface TemplateLike<T extends TemplateArticleRow = TemplateArticleRow> {
  default_items?: T[] | null
}

/** Stabil nyckel för en artikel: namn + enhet, skiftlägesokänsligt. */
export function templateArticleKey(name: string, unit: string): string {
  return `${name.trim().toLocaleLowerCase('sv')}|${unit.trim().toLocaleLowerCase('sv')}`
}

/** Sant för en rad som ska få en härledd artikel — se filens tre undantag. */
export function derivesArticle(row: TemplateArticleRow): boolean {
  const type = row.item_type ?? 'item'
  if (type !== 'item' && type !== 'option') return false
  if (typeof row.linked_product_id === 'string' && row.linked_product_id.length > 0) return false
  const name = typeof row.description === 'string' ? row.description.trim() : ''
  const unit = typeof row.unit === 'string' ? row.unit.trim() : ''
  if (!name || !unit) return false
  if (unit.toLocaleLowerCase('sv') === 'tim') return false
  return Number(row.unit_price ?? 0) > 0
}

/**
 * Artiklarna som saknas i startbanken, i mallordning och utan dubbletter.
 * Alltid prislösa (`unit_price: 0`) och alltid ren material: radens EGNA
 * ROT-flaggor följer med offertraden och rörs inte av kopplingen.
 */
export function deriveTemplateArticles(
  templates: readonly TemplateLike[],
  existing: readonly ProductDefault[],
): ProductDefault[] {
  const seen = new Set(existing.map(p => templateArticleKey(p.name, p.unit)))
  const derived: ProductDefault[] = []
  let index = 0
  for (const template of templates) {
    for (const row of template.default_items ?? []) {
      if (!derivesArticle(row)) continue
      const name = String(row.description).trim()
      const unit = String(row.unit).trim()
      const key = templateArticleKey(name, unit)
      if (seen.has(key)) continue
      seen.add(key)
      derived.push({
        sku: `MALL-${String(++index).padStart(3, '0')}`,
        name,
        unit,
        // Priset är firmans att sätta. Mallens gissning följer aldrig med.
        unit_price: 0,
        category: 'material',
        legacy_category: 'material',
        labor_share: 0,
        deduction: null,
      })
    }
  }
  return derived
}

/**
 * Stabilt artikel-id ur firman och artikelnyckeln. Oberoende av ordning och
 * av hur många mallar som råkar seedas i just den här körningen, så en
 * omkörning ger samma id och aldrig en dubblett.
 */
export function templateArticleId(businessId: string, key: string): string {
  let hash = 5381
  for (let i = 0; i < key.length; i++) hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0
  return `prod_${businessId}_m${hash.toString(36)}`
}

/** Artiklarnas id:n per nyckel — samma karta som `linkTemplateRowsToArticles` vill ha. */
export function templateArticleIds(businessId: string, articles: readonly ProductDefault[]): Map<string, string> {
  return new Map(articles.map(a => [templateArticleKey(a.name, a.unit), templateArticleId(businessId, templateArticleKey(a.name, a.unit))]))
}

/**
 * Sätter `linked_product_id` på de mallrader som har en artikel i kartan.
 * Ren funktion: returnerar nya mallar, rader utan träff är samma objekt.
 * Kartan går från `templateArticleKey` till artikelns id.
 */
export function linkTemplateRowsToArticles<R extends TemplateArticleRow, T extends TemplateLike<R>>(
  templates: readonly T[],
  productIdByKey: ReadonlyMap<string, string>,
): T[] {
  return templates.map(template => {
    const rows = template.default_items
    if (!Array.isArray(rows) || rows.length === 0) return template
    let changed = false
    const next = rows.map(row => {
      if (!derivesArticle(row)) return row
      const id = productIdByKey.get(templateArticleKey(String(row.description).trim(), String(row.unit).trim()))
      if (!id) return row
      changed = true
      return { ...row, linked_product_id: id }
    })
    return changed ? { ...template, default_items: next } : template
  })
}

/**
 * Branschens generella mall — den som inte hör till ett särskilt jobb.
 * `getDefaultQuoteTemplates` börjar alltid med "Enkel offert" under
 * jobbtypen "Allmänt arbete" (kontrollerat för alla sju branscher).
 */
export function genericTemplate(templates: readonly DefaultQuoteTemplate[]): DefaultQuoteTemplate | null {
  return templates.find(t => t.name === 'Enkel offert') ?? templates[0] ?? null
}

/**
 * Ett upplägg per jobbtyp som saknar ett. Rader ur branschens generella mall,
 * namngivet som standardradernas egen konvention (`job-standard-server.ts`)
 * så att "Vad brukar ingå?" känner igen det som jobbtypens upplägg.
 *
 * Jobbtyper som redan har ett upplägg hoppas — funktionen är idempotent och
 * skriver aldrig över det hantverkaren byggt.
 */
export function jobTypeStarters(
  templates: readonly DefaultQuoteTemplate[],
  jobTypes: ReadonlyArray<{ slug: string; name: string }>,
  slugsWithTemplate: ReadonlySet<string>,
): DefaultQuoteTemplate[] {
  const generic = genericTemplate(templates)
  if (!generic) return []
  const seen = new Set<string>()
  const starters: DefaultQuoteTemplate[] = []
  for (const job of jobTypes) {
    const slug = job.slug || slugifyJobType(job.name)
    if (!slug || seen.has(slug) || slugsWithTemplate.has(slug)) continue
    seen.add(slug)
    starters.push({
      ...generic,
      name: `Standardrader · ${job.name}`,
      description: generic.description,
      job_type_slug: slug,
      job_type_name: job.name,
      default_items: generic.default_items.map(item => ({ ...item })),
      default_payment_plan: generic.default_payment_plan.map(entry => ({ ...entry })),
    })
  }
  return starters
}
