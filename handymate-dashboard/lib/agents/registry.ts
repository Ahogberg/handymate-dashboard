/**
 * Agent-runner registry.
 *
 * Centraliserad mapping från agent_id → runObservation-funktion. Används av
 * (a) dynamisk cron-route `app/api/cron/agent-observations/[agent]/route.ts`
 * och (b) test-endpoint `app/api/cron/agent-observations/test/route.ts`.
 *
 * Lägga till en agent: registrera dess `runXObservation` i `AGENT_RUNNERS`-
 * objektet nedan + lägg till en cron-entry i `vercel.json`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { runKarinObservation } from './karin/observation-prompt'
import { runDanielObservation } from './daniel/observation-prompt'

export type AgentObservationRunner = (
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  options?: { includeDebug?: boolean },
) => Promise<Record<string, unknown>>

export const AGENT_RUNNERS: Record<string, AgentObservationRunner> = {
  karin: runKarinObservation as AgentObservationRunner,
  daniel: runDanielObservation as AgentObservationRunner,
  // lars:   tillkommer i Phase C1
  // hanna:  tillkommer i Phase D1
}

export const SUPPORTED_AGENTS = Object.keys(AGENT_RUNNERS)

export function isSupportedAgent(agentId: string): boolean {
  return agentId in AGENT_RUNNERS
}

export function getAgentRunner(agentId: string): AgentObservationRunner | null {
  return AGENT_RUNNERS[agentId] || null
}
