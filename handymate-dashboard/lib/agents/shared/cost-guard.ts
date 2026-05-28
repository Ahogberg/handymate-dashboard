/**
 * lib/agents/shared/cost-guard.ts (Steg 7-fix, 2026-05-29).
 *
 * Delad cost-guardrail-logik för agent-observation-routes.
 *
 * Två routes triggar agent-observation-runners:
 *   - app/api/cron/agent-observations/[agent]/route.ts (Vercel cron)
 *   - app/api/cron/agent-observations/test/route.ts (manuell trigger)
 *
 * Båda måste respektera samma skydd, annars är test-routen en blind
 * bakdörr förbi cost-cap och kill-switch. Helpern garanterar att
 * pre-check + post-log är identisk på båda vägar.
 *
 * Två funktioner:
 *   checkCostGuards()  — innan runner anropas. Returnerar SkipDecision
 *                        om businessen ska hoppas över (paused eller
 *                        cap-överstigen). null = kör vidare.
 *   logAgentRun()      — efter runner. Skriver agent_runs-rad med
 *                        usage + estimated_cost från callAgentWithThinking-
 *                        debug. Non-blocking på fel.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Beslut att skippa businessen — caller returnerar denna info direkt
    utan att anropa runner. */
export interface CostGuardSkip {
  skipped: 'agents_globally_paused' | 'cost_cap_exceeded'
  today_cost_usd?: number
  cap_usd?: number
}

/** Subset av business_config-fält som cost-guarden behöver. Caller
    ansvarar för att SELECT:a dessa i sin business_config-query. */
export interface CostGuardBusiness {
  business_id: string
  agents_globally_paused?: boolean | null
  agent_cost_cap_usd_daily?: number | string | null
}

const DEFAULT_CAP_USD = 5.0

/**
 * Start of today (UTC) ISO-sträng. Används som lower bound när vi
 * summerar dagens agent_runs.estimated_cost för cost-cap-check.
 */
export function startOfTodayIso(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Pre-check: ska denna business skippas helt?
 *
 * Returnerar:
 *   - { skipped: 'agents_globally_paused' } om kill-switch aktiv
 *   - { skipped: 'cost_cap_exceeded', today_cost_usd, cap_usd } om dagens
 *     summa redan överstiger cap
 *   - null om OK att köra
 *
 * Cost-summan beräknas defensivt — om agent_runs-query failar antar vi
 * 0 (loggar varning men hoppar inte över). Skadlig fail-open men billiga
 * fall fångas av rate-limit på saveAndPush istället.
 */
export async function checkCostGuards(
  supabase: SupabaseClient,
  business: CostGuardBusiness,
  agentId: string,
): Promise<CostGuardSkip | null> {
  // ── 1. Kill-switch ─────────────────────────────────────────────
  if (business.agents_globally_paused === true) {
    console.log(`[cost-guard/${agentId}] skip — agents_globally_paused`, {
      business_id: business.business_id,
    })
    return { skipped: 'agents_globally_paused' }
  }

  // ── 2. Cost-cap ────────────────────────────────────────────────
  const cap = business.agent_cost_cap_usd_daily != null
    ? Number(business.agent_cost_cap_usd_daily)
    : DEFAULT_CAP_USD

  let todayCostUsd = 0
  try {
    const { data: todayRuns } = await supabase
      .from('agent_runs')
      .select('estimated_cost')
      .eq('business_id', business.business_id)
      .gte('created_at', startOfTodayIso())
    todayCostUsd = (todayRuns || []).reduce((s, r) => s + Number(r.estimated_cost || 0), 0)
  } catch (sumErr) {
    console.warn(`[cost-guard/${agentId}] cost-summering failed:`, sumErr)
    return null
  }

  if (todayCostUsd >= cap) {
    console.log(`[cost-guard/${agentId}] skip — cost-cap`, {
      business_id: business.business_id,
      today_cost_usd: todayCostUsd,
      cap_usd: cap,
    })
    return {
      skipped: 'cost_cap_exceeded',
      today_cost_usd: Math.round(todayCostUsd * 10000) / 10000,
      cap_usd: cap,
    }
  }

  return null
}

/** AgentDebug-subset som logAgentRun behöver. Matchar AgentDebugInfo. */
export interface CostGuardDebug {
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  estimated_cost_usd?: number
}

/**
 * Post-step: logga agent_runs-rad med usage + cost från
 * callAgentWithThinking-debug. Non-blocking — fel loggas men kastas
 * inte (cron-resultat är viktigare än perfekt logging).
 *
 * Returnerar estimated_cost_usd eller 0 om ingen körning skedde.
 */
export async function logAgentRun(
  supabase: SupabaseClient,
  businessId: string,
  agentId: string,
  result: unknown,
): Promise<number> {
  const debug = (result as { debug?: CostGuardDebug })?.debug
  if (!debug?.usage || typeof debug.estimated_cost_usd !== 'number') {
    return 0
  }

  try {
    const runId = 'agentrun_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    await supabase.from('agent_runs').insert({
      run_id: runId,
      business_id: businessId,
      trigger_type: `agent_observation_cron:${agentId}`,
      tokens_used: (debug.usage.input_tokens || 0) + (debug.usage.output_tokens || 0),
      estimated_cost: debug.estimated_cost_usd,
      status: 'completed',
    })
  } catch (logErr) {
    console.warn(`[cost-guard/${agentId}] agent_runs insert failed:`, logErr)
  }

  return debug.estimated_cost_usd
}
