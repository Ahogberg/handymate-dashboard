/**
 * Cross-run observation-dedup för agent-pipelinen.
 *
 * Förhindrar att samma observation (BRF Lindgården stale, badrum över budget)
 * sparas flera gånger när agenterna kör söndag + onsdag och tittar på samma
 * 90-180d data-fönster.
 *
 * Strategi v1:
 *   dedup_key = ${agent_id}:${knowledge_type}:${normalized_title}
 *   normalized_title = lowercase + strip siffror/datum
 *
 * Strategi v2 (TD-46): agenter prompt-instrueras sätta semantisk dedup_key
 * själva (t.ex. "stale_quote:${quote_id}") när härledd nyckel ger falsk
 * positiv på samma fenomen med olika title-formulering.
 *
 * Fönster per knowledge_type:
 *   - anomaly: 48h (akuta — OK påminna om snabbare)
 *   - default: 168h (7 dagar)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentObservation } from './normalize'

// ─────────────────────────────────────────────────────────────────
// Dedup-fönster per knowledge_type
// ─────────────────────────────────────────────────────────────────

const DEDUP_WINDOWS_HOURS: Record<string, number> = {
  anomaly: 48,
}

const DEFAULT_DEDUP_WINDOW_HOURS = 168 // 7 dagar

export function getDedupWindowHours(knowledgeType: string): number {
  return DEDUP_WINDOWS_HOURS[knowledgeType] ?? DEFAULT_DEDUP_WINDOW_HOURS
}

// ─────────────────────────────────────────────────────────────────
// Dedup-key-härledning
// ─────────────────────────────────────────────────────────────────

/**
 * Normalisera title för dedup: lowercase, ta bort siffror och datum-mönster,
 * kollapsa whitespace. Mål: "Badrum 27% över budget" och "Badrum 28% över
 * budget" får samma normaliserade form ("badrum % över budget" eller liknande)
 * så samma fenomen dedupas oavsett exakta tal.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, '') // ISO-datum
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '') // sv datum
    .replace(/\d+([.,]\d+)?\s*%?/g, '') // tal + ev. procent
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Härled dedup_key från observation. Använder observation.dedup_key om
 * agent satt den (v2-feature, ingen prompt-instruktion v1), annars
 * konstruerar från (agent_id, knowledge_type, normalized_title).
 */
export function computeDedupKey(
  agentId: string,
  observation: AgentObservation,
): string {
  if (observation.dedup_key && observation.dedup_key.length > 0) {
    return observation.dedup_key
  }
  const normalized = normalizeTitle(observation.title)
  return `${agentId}:${observation.knowledge_type}:${normalized}`
}

// ─────────────────────────────────────────────────────────────────
// Recent-duplicate-lookup
// ─────────────────────────────────────────────────────────────────

export interface DuplicateMatch {
  id: string
  created_at: string
}

/**
 * Slå upp om en observation med samma dedup_key existerar för samma business
 * + agent inom det givna fönstret. Returnerar senaste matchen eller null.
 *
 * Bara active-rader räknas (om en gammal observation manuellt markerats
 * 'dismissed' eller 'archived' → agent får generera den igen).
 */
export async function findRecentDuplicate(
  supabase: SupabaseClient,
  businessId: string,
  agentId: string,
  dedupKey: string,
  windowHours: number,
): Promise<DuplicateMatch | null> {
  const sinceIso = new Date(Date.now() - windowHours * 3600 * 1000).toISOString()

  const { data, error } = await supabase
    .from('business_knowledge')
    .select('id, created_at')
    .eq('business_id', businessId)
    .eq('agent_id', agentId)
    .eq('dedup_key', dedupKey)
    .eq('status', 'active')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[dedup/findRecentDuplicate] query error:', error)
    return null
  }

  return data ? { id: data.id, created_at: data.created_at } : null
}
