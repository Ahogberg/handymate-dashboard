import type { QuoteTemplate } from '../types/quote'
import { resolveFirstQuoteSelection, toSetupTemplate, type FirstQuoteSelection, type QuoteSetupData } from './job-type-setup'
import type { TemplatePricingProduct } from './resolve-template-item-prices'

export interface JobTypeStart {
  selection: FirstQuoteSelection
  template: QuoteTemplate
  products: TemplatePricingProduct[]
}

export async function fetchQuoteSetup(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<QuoteSetupData> {
  const res = await fetcher('/api/job-types/quote-setup', { cache: 'no-store', signal })
  if (!res.ok) throw new Error('Kunde inte läsa ditt offertupplägg. Försök igen.')
  return res.json()
}

/** Omvaliderar både kopplingen och mallens version. URL/DTO levererar inga offertrader. */
export async function loadJobTypeStart(selection: FirstQuoteSelection, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<JobTypeStart> {
  const [setup, response] = await Promise.all([
    fetchQuoteSetup(signal, fetcher),
    fetcher('/api/quote-templates', { cache: 'no-store', signal }),
  ])
  if (!response.ok) throw new Error('Kunde inte läsa mallen. Försök igen.')
  const verified = resolveFirstQuoteSelection(setup, selection)
  if (!verified) throw new Error('Jobbtypen eller mallen har ändrats. Välj ett aktuellt underlag.')
  const { templates } = await response.json()
  const template = (templates as (QuoteTemplate & { job_type_slug?: string })[]).find(t => t.id === verified.templateId)
  const known = setup.templates.find(t => t.id === verified.templateId)!
  if (!template || template.job_type_slug !== verified.jobTypeSlug ||
    (template.updated_at ?? null) !== known.updatedAt || !Array.isArray(template.default_items) ||
    JSON.stringify(toSetupTemplate({ ...template }).items) !== JSON.stringify(known.items)) {
    throw new Error('Underlaget ändrades under laddningen. Försök igen.')
  }
  return { selection: verified, template, products: setup.products.map(p => ({
    id: p.id, name: p.name, unit: p.unit, sales_price: p.salesPrice,
  })) }
}

export interface QuoteStartSnapshot {
  items: readonly unknown[]
  jobType: string | null
  input: string
  mode: string | null
  busy: boolean
  formSignature?: string
}

/** Async-svaret är bara giltigt så länge användaren står kvar på samma tomma start. */
export function canApplyJobTypeStart(before: QuoteStartSnapshot, now: QuoteStartSnapshot): boolean {
  return !before.busy && !now.busy && before.items.length === 0 && now.items.length === 0 &&
    before.items === now.items && before.jobType === now.jobType && before.input === now.input && before.mode === now.mode &&
    before.formSignature === now.formSignature
}
