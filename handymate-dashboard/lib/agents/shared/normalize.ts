/**
 * Delad observation-normalizer — räddar observations där Claude använt
 * fel fält-namn (message istället för observation, etc.). Återanvänd
 * av alla agenter.
 *
 * Tidigare definierad inline i lib/agents/karin/observation-prompt.ts (rad 747).
 * Extraherad 2026-05-18 vid kloning av Karin-pipeline.
 */

/**
 * Generisk observation-shape som matchar business_knowledge-tabellens
 * INSERT-kontrakt. Per-agent-types (KarinObservation, DanielObservation, etc.)
 * är alias för denna typ.
 */
export interface AgentObservation {
  knowledge_type: 'insight' | 'pattern' | 'anomaly' | 'recommendation'
  title: string
  observation: string
  suggestion: string | null
  confidence: number
  data_basis: Record<string, unknown>
  /**
   * Frivillig nyckel för cross-run dedup. Sätts inte av agenter i v1 —
   * härleds istället från (agent_id, knowledge_type, normalized_title) i
   * lib/agents/shared/dedup.ts. Reserverad för v2 där agenter kan sätta
   * semantisk nyckel (t.ex. "stale_quote:${quote_id}") för bättre dedup-
   * precision på samma fenomen över olika title-formuleringar.
   */
  dedup_key?: string
}

export const VALID_KNOWLEDGE_TYPES = new Set([
  'insight',
  'pattern',
  'anomaly',
  'recommendation',
])

/**
 * Försök rädda en raw-parsed observation till AgentObservation-shape.
 * Returnerar null om observation-värdet saknas helt (även under synonym-fält).
 *
 * `notes`-arrayen muteras med transformations som tillämpades — passas
 * tillbaka i debug-info så caller kan se varför observationen fick "räddas".
 */
export function normalizeObservation(
  raw: any,
  index: number,
  notes: string[],
): AgentObservation | null {
  if (!raw || typeof raw !== 'object') {
    notes.push(`obs[${index}]: not an object`)
    return null
  }

  // observation: acceptera synonyma fält
  let observation: string | undefined =
    raw.observation || raw.message || raw.text || raw.body || raw.description || raw.summary
  if (!observation || typeof observation !== 'string' || observation.trim().length === 0) {
    return null
  }
  observation = observation.trim()
  if (!raw.observation) {
    notes.push(`obs[${index}]: used fallback field for observation`)
  }

  // title: härled från observation om saknas
  let title: string = (raw.title || '').toString().trim()
  if (!title) {
    // Första meningen (period eller frågetecken eller utropstecken)
    const sentenceMatch = observation.match(/^[^.!?\n]+[.!?]?/)
    title = (sentenceMatch ? sentenceMatch[0] : observation).trim()
    if (title.length > 60) {
      title = title.slice(0, 57).trimEnd() + '…'
    }
    notes.push(`obs[${index}]: title härledd från observation`)
  } else if (title.length > 80) {
    title = title.slice(0, 77).trimEnd() + '…'
  }

  // knowledge_type: default 'insight'
  let knowledgeType = (raw.knowledge_type || raw.type || 'insight').toString().toLowerCase()
  if (!VALID_KNOWLEDGE_TYPES.has(knowledgeType)) {
    notes.push(`obs[${index}]: knowledge_type '${knowledgeType}' okänd, faller till 'insight'`)
    knowledgeType = 'insight'
  }

  // confidence: default 0.5 (medium-osäker)
  let confidence: number
  if (typeof raw.confidence === 'number') {
    confidence = Math.max(0, Math.min(1, raw.confidence))
  } else if (typeof raw.confidence === 'string' && !isNaN(parseFloat(raw.confidence))) {
    confidence = Math.max(0, Math.min(1, parseFloat(raw.confidence)))
    notes.push(`obs[${index}]: confidence string → number`)
  } else {
    confidence = 0.5
    notes.push(`obs[${index}]: confidence saknades, default 0.5`)
  }

  // suggestion: null tolereras, tomt sträng → null
  let suggestion: string | null = null
  const rawSugg = raw.suggestion ?? raw.action ?? raw.next_step
  if (typeof rawSugg === 'string' && rawSugg.trim().length > 0) {
    suggestion = rawSugg.trim()
  }

  // data_basis: tom object om saknas
  const dataBasis: Record<string, unknown> =
    raw.data_basis && typeof raw.data_basis === 'object' ? raw.data_basis : {}

  // dedup_key: frivilligt — agenten har möjlighet att sätta semantisk nyckel
  const dedupKey =
    typeof raw.dedup_key === 'string' && raw.dedup_key.trim().length > 0
      ? raw.dedup_key.trim()
      : undefined

  return {
    knowledge_type: knowledgeType as AgentObservation['knowledge_type'],
    title,
    observation,
    suggestion,
    confidence,
    data_basis: dataBasis,
    ...(dedupKey ? { dedup_key: dedupKey } : {}),
  }
}
