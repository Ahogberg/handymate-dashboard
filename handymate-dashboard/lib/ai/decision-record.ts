/**
 * Beslutsposten — vad låg bakom ett AI-förslag (2026-08-06).
 *
 * ═══ VARFÖR ═══
 *
 * Vi kunde inte svara på den enda fråga som betyder något om vår AI:
 * **blir den bättre?**
 *
 * `learning_events` fångar redan vad agenten föreslog och vad hantverkaren
 * ändrade till. Men ingenting sparade vilken MODELL och vilken PROMPT som
 * producerade förslaget. Modellnamn är hårdkodade konstanter per fil och byts
 * vid deploy — så när man i efterhand vill veta varför förslagen blev sämre i
 * mars finns svaret inte längre någonstans.
 *
 * Det här är färskvara. Data vi inte stämplar när förslaget skapas går inte
 * att rekonstruera senare, hur mycket vi än bygger.
 *
 * ═══ VAD SOM STÄMPLAS, OCH VAD SOM MEDVETET INTE GÖR DET ═══
 *
 * Stämpeln bär modell, promptversion, tidpunkt och en HASH av indata — inte
 * indata självt. Skälet är att payloaden ligger i `pending_approvals` som
 * läses av gränssnittet: att baka in hela kundbeskrivningen där hade
 * dubbellagrat personuppgifter på ett ställe ingen städar. Hashen räcker för
 * det den ska svara på — "fick två förslag samma underlag?" — utan att bära
 * innehållet.
 *
 * Ren funktion. Facit-testad i tests/decision-record.spec.ts.
 */
import { createHash } from 'crypto'

/**
 * Promptversioner. Bumpa när prompten ändras på ett sätt som kan påverka
 * utfallet — ny instruktion, ändrat schema, annan radgräns.
 *
 * Poängen är inte versionsnumret i sig utan att kunna gruppera utfall per
 * version: "accept-graden föll när offertprompten gick till v3" är en
 * fråga man bara kan ställa om siffran finns på varje förslag.
 */
export const PROMPT_VERSIONS = {
  /** lib/ai-quote-generator.ts — offertgenerering. v3: produkthandtag [P1],
      radgräns 8→12, notIncludedSuggestions (etapp B, 2026-08-06). */
  quoteGeneration: 3,
  /** lib/quotes/suggest-quote-draft.ts — offertförslag ur lead. */
  quoteDraftSuggestion: 1,
  /** lib/ata/suggest-ata-draft.ts — ÄTA-utkast. */
  ataDraftSuggestion: 1,
  /** lib/egenkontroll/photo-assessment.ts — foto mot checklista. */
  photoAssessment: 1,
  /**
   * lib/agent/pricing-engine.ts — Haiku-klassificeringen av offerter till
   * jobbtyper. OBS: price_adjustment-KORTEN (lib/agent/price-analysis.ts) är
   * ren matematik över tidrapporter och stämplas medvetet INTE — en
   * beslutspost där vore ett påstående om ett AI-beslut som aldrig togs.
   * Klassificeringen skriver till pricing_intelligence som saknar payload;
   * stämpling kräver en kolumn och väntar tills tabellen ändå rörs.
   */
  pricingSuggestion: 1,
  /**
   * app/api/voice/analyze/route.ts — samtals-/mötesanalysen till
   * ai_suggestion. v1 = rollfördelningen (2026-08-09): enbart de fem typer
   * Lisa saknar verktyg för, mötesvinkel för source='site_visit'.
   */
  callAnalysis: 1,
} as const

export type PromptKey = keyof typeof PROMPT_VERSIONS

export interface DecisionRecord {
  /** Modellsträngen som FAKTISKT användes, inte den vi tror används. */
  model: string
  /** Vilken prompt, och vilken version av den. */
  prompt: PromptKey
  promptVersion: number
  /** Hash av indata — låter oss se om två förslag byggde på samma underlag. */
  inputHash: string
  /** ISO-tidpunkt. Sätts av anroparen så funktionen förblir ren och testbar. */
  decidedAt: string
}

/**
 * Hash av indata. Normaliserar whitespace först så att en omformatering inte
 * ser ut som ett nytt underlag — vi vill veta om INNEHÅLLET skilde sig.
 *
 * Kort hash: den ska gå att jämföra med ögat i en logg, inte vara
 * kryptografiskt bindande.
 */
export function hashInput(input: string | null | undefined): string {
  const normalized = (input || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return 'tom'
  return createHash('sha256').update(normalized).digest('hex').slice(0, 12)
}

export function buildDecisionRecord(opts: {
  model: string
  prompt: PromptKey
  input: string | null | undefined
  /** Skickas in i stället för att läsas här — håller funktionen ren. */
  now: Date
}): DecisionRecord {
  return {
    model: opts.model,
    prompt: opts.prompt,
    promptVersion: PROMPT_VERSIONS[opts.prompt],
    inputHash: hashInput(opts.input),
    decidedAt: opts.now.toISOString(),
  }
}

/**
 * Nyckeln beslutsposten bor under i en payload.
 *
 * Ett eget fält i stället för utspridda nycklar: gränssnittet renderar
 * payloaden fält för fält på flera ställen, och en samlad `_decision` är
 * lätt att hoppa över där — och lätt att hitta när man vill mäta.
 * Understrecket signalerar "metadata, inte innehåll".
 */
export const DECISION_KEY = '_decision' as const

/** Hänger beslutsposten på en payload utan att röra resten. */
export function withDecisionRecord<T extends Record<string, unknown>>(
  payload: T,
  record: DecisionRecord,
): T & { _decision: DecisionRecord } {
  return { ...payload, [DECISION_KEY]: record }
}

/** Läser tillbaka beslutsposten. Saknas den är förslaget skapat före
    2026-08-06 eller på en väg som ännu inte stämplar — båda är normala. */
export function readDecisionRecord(payload: unknown): DecisionRecord | null {
  if (!payload || typeof payload !== 'object') return null
  const record = (payload as Record<string, unknown>)[DECISION_KEY]
  if (!record || typeof record !== 'object') return null
  const r = record as Record<string, unknown>
  if (typeof r.model !== 'string' || typeof r.prompt !== 'string') return null
  return record as DecisionRecord
}
