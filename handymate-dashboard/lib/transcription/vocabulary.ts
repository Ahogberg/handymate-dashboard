/**
 * Egennamn och fackord till transkriberingen — vår motsvarighet till en
 * svensk-finetunad modell.
 *
 * fltman/kundkoll mätte (docs/VERIFIERAD-STACK.md) att KB-Whisper medium slog
 * den STÖRRE Whisper large-v3-turbo på svenska egennamn: den större skrev
 * "britta ner" och "den äldre syskonet" där den svensktränade fick allt rätt.
 * De kör modellen lokalt på en Mac. Vi kör serverless och kan inte det.
 *
 * Men Whisper-API:t tar en `prompt` som styr stavning genom att agera
 * "tidigare kontext", och vi vet redan vad samtalet sannolikt innehåller:
 * firmans namn, orten, ägarens specialiteter, företagets egna jobbtyper och —
 * när samtalet är matchat — kundens namn. Det är samma problem KB-Whisper
 * löser med träning, löst med data vi redan har i raden.
 *
 * Ingen ny datakälla och inga nya queries i loopar: kontexten skickas in av
 * anroparen, som ändå läst business_config.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { branchCompanyNoun, branchLabel } from '@/lib/branch'
import { loadTradeContext, type TradeContext } from '@/lib/branch/trade-context'

/**
 * whisper-1 tar högst 224 token. Svensk text ligger kring 3–4 tecken per
 * token, så 700 tecken är en trygg gräns med marginal för ovanliga ord (som
 * egennamn ofta är — de kostar fler token).
 */
export const MAX_PROMPT_TECKEN = 700

export interface VocabularyInput {
  /** business_config.business_name */
  businessName?: string | null
  /** business_config.service_area — ortsnamn stavas ofta fel utan hjälp */
  serviceArea?: string | null
  /** Motpartens namn när samtalet är matchat mot en kund */
  customerName?: string | null
  /** Från lib/branch/trade-context.ts — bransch, specialiteter, jobbtyper */
  trade?: TradeContext | null
  /** Firmans egna artikelnamn (products.name), vanligast först */
  productNames?: string[] | null
}

function rensa(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Unika, icke-tomma termer i inmatningsordning. */
function unika(termer: Array<string | null | undefined>): string[] {
  const sedda = new Set<string>()
  const ut: string[] = []
  for (const t of termer) {
    const s = rensa(t)
    if (!s) continue
    const nyckel = s.toLowerCase()
    if (sedda.has(nyckel)) continue
    sedda.add(nyckel)
    ut.push(s)
  }
  return ut
}

/**
 * Termerna i prioritetsordning — det som kapas bort ska vara det minst
 * värdefulla. Egennamn (firma, ort, kund) först: de är omöjliga för modellen
 * att gissa. Fackord sist: de finns åtminstone i modellens ordförråd.
 */
export function buildVocabularyTerms(input: VocabularyInput): string[] {
  const trade = input.trade ?? null
  return unika([
    rensa(input.businessName),
    rensa(input.customerName),
    rensa(input.serviceArea),
    trade ? branchLabel(trade.primary) : null,
    trade ? branchCompanyNoun(trade.primary) : null,
    ...(trade?.specialties ?? []),
    ...(trade?.jobTypes ?? []),
    ...(input.productNames ?? []),
  ])
}

/**
 * Bygger prompten. Formen är en naturlig mening — Whisper behandlar prompten
 * som föregående tal, så en kommaseparerad ordlista fungerar sämre än text
 * som låter som samtalet den ska hjälpa.
 *
 * Tom inmatning ⇒ null, aldrig en tom eller påhittad prompt.
 */
export function buildTranscriptionPrompt(input: VocabularyInput): string | null {
  const termer = buildVocabularyTerms(input)
  if (termer.length === 0) return null

  const inledning = 'Samtal på svenska i byggbranschen. Namn och ord som förekommer: '
  let prompt = inledning
  const tagna: string[] = []

  for (const term of termer) {
    const kandidat = tagna.length === 0 ? term : `${tagna.join(', ')}, ${term}`
    if ((inledning + kandidat + '.').length > MAX_PROMPT_TECKEN) break
    tagna.push(term)
  }

  if (tagna.length === 0) return null
  prompt = `${inledning}${tagna.join(', ')}.`
  return prompt
}

/**
 * gpt-4o-transcribe tar utöver prompten en `keywords`-lista, som ger skarpare
 * styrning än fritext. Samma termer, annan form.
 */
export function buildKeywords(input: VocabularyInput, max = 40): string[] {
  return buildVocabularyTerms(input).slice(0, max)
}

/** Hur många artikelnamn som får plats innan prompten ändå kapas. */
const MAX_ARTIKLAR = 25

/**
 * Läser vokabuläret för ett företag. Fail-soft hela vägen: varje läsfel ger
 * bara ett tunnare vokabulär, aldrig ett kastat fel — en transkribering får
 * inte falla för att en artikellista inte gick att läsa.
 *
 * Anropas en gång per transkribering, aldrig i en loop.
 */
export async function laddaVokabular(
  supabase: SupabaseClient,
  businessId: string,
  customerId?: string | null,
): Promise<VocabularyInput> {
  const [bizRes, trade, kundRes, produktRes] = await Promise.all([
    supabase
      .from('business_config')
      .select('business_name, service_area')
      .eq('business_id', businessId)
      .maybeSingle()
      .then(r => r, () => ({ data: null })),
    loadTradeContext(supabase, businessId).catch(() => null),
    customerId
      ? supabase
          .from('customer')
          .select('name')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .maybeSingle()
          .then(r => r, () => ({ data: null }))
      : Promise.resolve({ data: null as { name?: string | null } | null }),
    supabase
      .from('products')
      .select('name')
      .eq('business_id', businessId)
      .limit(MAX_ARTIKLAR)
      .then(r => r, () => ({ data: null })),
  ])

  const biz = (bizRes as { data: { business_name?: string | null; service_area?: string | null } | null }).data
  const kund = (kundRes as { data: { name?: string | null } | null }).data
  const produkter = (produktRes as { data: Array<{ name?: string | null }> | null }).data

  return {
    businessName: biz?.business_name ?? null,
    serviceArea: biz?.service_area ?? null,
    customerName: kund?.name ?? null,
    trade,
    productNames: (produkter ?? []).map(p => p?.name ?? '').filter(Boolean),
  }
}
