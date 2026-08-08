/**
 * Tre grindar för "Värt att veta" (Claude Design-granskningen, avsnitt 2c).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Fem Daniel-rader beskrev samma tio offerter med olika formulering. Etapp 2
 * tog bort merparten uppströms (schemat och dedup-nycklarna), men det som
 * ändå tar sig hit ska passera tre frågor innan det får göra anspråk på
 * hantverkarens uppmärksamhet mellan två jobb:
 *
 *   1. Har något hänt sedan du tittade sist?
 *      En sammanställning av samma siffror som igår är ingen händelse.
 *   2. Handlar den om en namngiven kund eller affär?
 *      Går det inte att öppna något konkret har raden inget ärende här.
 *   3. Säger den något högerspalten inte redan säger?
 *      "3 affärer i flödet" står redan i Verksamheten.
 *
 * ═══ VAD SOM MEDVETET INTE BYGGS ═══
 *
 * Grind 3 görs STRUKTURELLT, inte genom att jämföra texter. Högerspaltens
 * påståenden är tal (totalDeals, unpaidCount); nyhetsraden är fri prosa. En
 * textjämförelse mellan dem vore en gissning som ibland tar bort rätt rad.
 * Signalen är i stället `data_basis.metric`: sätter agenten en aggregatnyckel
 * har den sammanfattat, inte hittat.
 *
 * Bortgallrade rader är inte borta — de är samma analys, och den hör hemma
 * under Analys där man går för att gräva.
 *
 * Rena funktioner — ingen DB, ingen React, inget localStorage här.
 */

export interface NewsObservation {
  id: string
  agent_id: string
  observation: string
  suggestion: string | null
  data_basis?: Record<string, unknown> | null
  created_at: string
}

export type EntityRef = { typ: 'quote' | 'invoice' | 'project' | 'customer'; id: string }

/**
 * Plockar ut ett öppningsbart objekt ur data_basis.
 *
 * Fältet fylls redan av agentprompterna (quote_id, customer_id …) och
 * selectas redan av /api/observations — det var bara klientens typ som inte
 * tog emot det. Samma ändring återupplivar den döda grenen i
 * lib/jarvis/news-actions.ts som ger "Öppna offerten →".
 *
 * Ordningen är specifik → generell: en rad om en offert ska öppna offerten,
 * inte kunden som råkar stå i samma underlag.
 */
export function entityFrom(dataBasis: Record<string, unknown> | null | undefined): EntityRef | null {
  if (!dataBasis || typeof dataBasis !== 'object') return null
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v : null

  const quote = str(dataBasis.quote_id)
  if (quote) return { typ: 'quote', id: quote }
  const invoice = str(dataBasis.invoice_id)
  if (invoice) return { typ: 'invoice', id: invoice }
  const project = str(dataBasis.project_id)
  if (project) return { typ: 'project', id: project }
  const customer = str(dataBasis.customer_id)
  if (customer) return { typ: 'customer', id: customer }
  return null
}

/**
 * Grind 3: är raden en sammanfattning i stället för ett fynd?
 *
 * `data_basis.metric` sätts av prompterna när observationen bygger på ett
 * aggregat ("acceptance_rate_by_customer_type") snarare än ett enskilt
 * objekt. Det är den enda strukturerade signalen som finns för skillnaden.
 *
 * OBS: en rad som HAR ett entitets-id är per definition ett fynd, även om
 * den också bär en metric — då vinner objektet.
 */
export function arSammanfattning(obs: NewsObservation): boolean {
  if (entityFrom(obs.data_basis)) return false
  const metric = obs.data_basis?.metric
  return typeof metric === 'string' && metric.trim().length > 0
}

/**
 * Alla tre grindarna. `sedda` är id:n hantverkaren redan sett — samma
 * mekanik som momentlagret använder (stabila id:n i localStorage), så ingen
 * ny kolumn behövs.
 */
export function passerarGrindar(obs: NewsObservation, sedda: Set<string>): boolean {
  // 1. Har något hänt sedan sist?
  if (sedda.has(obs.id)) return false
  // 2. Namngiven kund eller affär?
  if (!entityFrom(obs.data_basis)) return false
  // 3. Säger den något högerspalten inte redan säger?
  if (arSammanfattning(obs)) return false
  return true
}

/**
 * Filtrerar och kortar ned. Grind 2 gör i praktiken jobbet för grind 3 i de
 * flesta fall — en rad som måste ha ett entitets-id kan inte vara "du har 12
 * affärer i flödet" — men båda står kvar utskrivna, för de fångar olika fel.
 */
export function grindaNyheter<T extends NewsObservation>(
  observationer: T[],
  sedda: Set<string>,
  max = 5,
): T[] {
  return observationer.filter(o => passerarGrindar(o, sedda)).slice(0, max)
}
