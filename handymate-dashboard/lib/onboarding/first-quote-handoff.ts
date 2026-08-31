import { resolveFirstQuoteSelection, type FirstQuoteSelection, type QuoteSetupData } from '../quotes/job-type-setup'
import { fetchQuoteSetup } from '../quotes/job-type-start'

/** Bara referenser; mottagaren hämtar om, verifierar tenant och tillämpar sin prismotor. */
export function firstQuoteHref(data: QuoteSetupData, selection: unknown): string | null {
  const verified = resolveFirstQuoteSelection(data, selection)
  if (!verified) return null
  const params = new URLSearchParams({ first_quote: '1', job_type: verified.jobTypeSlug, template_id: verified.templateId })
  return `/dashboard/quotes/new?${params.toString()}`
}

/** Inga redirect-url:er eller belopp accepteras från URL/session-state. */
export function readFirstQuoteIntent(params: Pick<URLSearchParams, 'get'>): FirstQuoteSelection | null {
  if (params.get('first_quote') !== '1') return null
  const jobTypeSlug = params.get('job_type')
  const templateId = params.get('template_id')
  if (!jobTypeSlug || !templateId || jobTypeSlug.length > 100 || templateId.length > 200) return null
  return { jobTypeSlug, templateId }
}

/** Den befintliga onboarding-finaliseringen, men navigation först efter två
 * kvitterade skrivningar. Ett spar-/läsfel är inte en lyckad övergång. */
export async function completeFirstQuoteOnboarding(selection: FirstQuoteSelection, onboardingData: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<string> {
  const setup = await fetchQuoteSetup(undefined, fetcher)
  const href = firstQuoteHref(setup, selection)
  if (!href) throw new Error('Ditt offertunderlag behöver väljas på nytt.')
  const saved = await fetcher('/api/onboarding', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 7, data: { ...onboardingData, firstQuoteSelection: selection } }),
  })
  if (!saved.ok) throw new Error('Kunde inte spara dina val.')
  const finalized = await fetcher('/api/onboarding', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!finalized.ok) throw new Error('Kunde inte avsluta onboardingen.')
  return href
}

export type QuoteStartResolution =
  | { kind: 'preserve'; reason: 'editing' | 'existing_content' | 'context_conflict' }
  | { kind: 'unavailable' }
  | { kind: 'apply'; selection: FirstQuoteSelection }

/** För mottagaren: ett startförslag får aldrig skriva över ett påbörjat jobb. */
export function resolveQuoteStart(data: QuoteSetupData, intent: unknown, context: {
  mode: 'create' | 'edit'; hasItems: boolean; inheritedJobType?: string | null
}): QuoteStartResolution {
  if (context.mode === 'edit') return { kind: 'preserve', reason: 'editing' }
  if (context.hasItems) return { kind: 'preserve', reason: 'existing_content' }
  const selection = resolveFirstQuoteSelection(data, intent)
  if (!selection) return { kind: 'unavailable' }
  if (context.inheritedJobType && context.inheritedJobType !== selection.jobTypeSlug) {
    return { kind: 'preserve', reason: 'context_conflict' }
  }
  return { kind: 'apply', selection }
}
