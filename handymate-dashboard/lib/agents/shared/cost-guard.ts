/**
 * lib/agents/shared/cost-guard.ts (Steg 7-fix, 2026-05-29; marginalstyrda
 * plan-tak Andreas-beslut 2026-07-31).
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
 *
 * DEGRADERA-INTE-STOPPA-SEMANTIK (Andreas-beslut 2026-07-31):
 * Taket är byggt för att skydda marginal på BAKGRUNDS-observationer — de
 * schemalagda agent-observation-körningarna (karin/daniel/lars/hanna) som
 * cron:ar två gånger i veckan och proaktivt letar upp saker att flagga.
 * Om taket nås för dagen skippas EN DAGS körning för den businessen; nästa
 * cron-körning (nästa schemalagda dag) summerar om från noll och kör igen.
 * Inget går förlorat permanent — det är senarelagt, inte bortglömt.
 *
 * Detta ska ALDRIG påverka en pågående kundkontakt eller en hantverkare
 * som aktivt använder produkten. Verifierat 2026-07-31:
 *   - app/api/matte/chat/route.ts (Mattes chatt, webb+mobil) anropar INTE
 *     checkCostGuards någonstans — chatten är helt okopplad från taket.
 *   - app/api/agent/trigger/route.ts anropar DÄREMOT checkCostGuards för
 *     ALLA trigger_types (se kommentar vid TD-52 i den filen, rad ~136-139:
 *     "Gäller ALLA triggers (SMS/samtal/chat/cron)") — INKLUSIVE 'manual',
 *     'phone_call', 'incoming_sms' och 'email_received', som routens EGEN
 *     kommentar klassar som användarinitierade/konversationella triggers.
 *     Det betyder att taket i praktiken KAN stoppa en pågående kundkontakt
 *     eller ett hantverkar-initierat anrop via den routen — vilket INTE
 *     stämmer med degradera-inte-stoppa-löftet ovan. Detta är en verklig
 *     avvikelse, flaggad för Andreas 2026-07-31 — INTE ändrad här (ingår
 *     inte i detta uppdrag, och en beteendeändring i den routen kräver ett
 *     eget beslut om vad som ska hända istället när taket nås mitt i ett
 *     kundsamtal).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { recordCost } from '@/lib/costs/record'
import { usdToOre } from '@/lib/costs/meter'

/** Beslut att skippa businessen — caller returnerar denna info direkt
    utan att anropa runner. */
export interface CostGuardSkip {
  skipped: 'agents_globally_paused' | 'cost_cap_exceeded'
  today_cost_usd?: number
  cap_usd?: number
}

/** Subset av business_config-fält som cost-guarden behöver. Caller
    ansvarar för att SELECT:a dessa i sin business_config-query.
    subscription_plan är valfri — utan den faller cap-resolutionen tillbaka
    på DEFAULT_CAP_USD precis som innan planbaserade tak infördes (bakåt-
    kompatibelt för anropare som inte SELECT:ar fältet ännu). */
export interface CostGuardBusiness {
  business_id: string
  agents_globally_paused?: boolean | null
  agent_cost_cap_usd_daily?: number | string | null
  subscription_plan?: string | null
}

const DEFAULT_CAP_USD = 5.0

/**
 * Per-plan default-tak i USD/dygn för bakgrunds-agentkörningar.
 *
 * Andreas-beslut 2026-07-31: nivåerna är satta för att skydda 85–90 %
 * bruttomarginal vid full nyttjande av respektive plan (baserat på
 * Anthropic-kostnad per observation-körning vs. planens abonnemangspris).
 * Ett explicit värde i business_config.agent_cost_cap_usd_daily VINNER
 * ALLTID över plan-defaulten — se resolveCostCapUsd().
 */
export const PLAN_COST_CAPS_USD: Record<string, number> = {
  starter: 1.5,
  professional: 3.0,
  business: 8.0,
}

/**
 * Cap-resolution, delad av checkCostGuards() och driftlarm-svepet
 * (app/api/cron/driftlarm/route.ts) så de aldrig kan divergera.
 *
 * Prioritet: 1) explicit agent_cost_cap_usd_daily på businessen,
 *            2) PLAN_COST_CAPS_USD[subscription_plan],
 *            3) DEFAULT_CAP_USD (5.0) som sista fallback.
 */
export function resolveCostCapUsd(business: {
  agent_cost_cap_usd_daily?: number | string | null
  subscription_plan?: string | null
}): number {
  if (business.agent_cost_cap_usd_daily != null) {
    return Number(business.agent_cost_cap_usd_daily)
  }
  const plan = business.subscription_plan
  if (plan && PLAN_COST_CAPS_USD[plan] != null) {
    return PLAN_COST_CAPS_USD[plan]
  }
  return DEFAULT_CAP_USD
}

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
  const cap = resolveCostCapUsd(business)

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

  const runId = 'agentrun_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)

  try {
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

  // ═══ SAMMA VÄRDE, TVÅ MOTTAGARE (COGS-mätaren, 2026-08-08) ═══
  //
  // agent_runs.estimated_cost är GOVERNORN — dygnstaket som checkCostGuards
  // läser, i USD. cost_event är BOKEN — vår totala COGS per kund, i öre.
  // Båda skrivs här, från samma `debug.estimated_cost_usd`, i samma funktion.
  // Det är härledning, inte en kopia: det finns ingen väg där de kan glida
  // isär, och facit i tests/cogs-matare.spec.ts kontrollerar att ingen annan
  // fil skriver resource:'llm'.
  //
  // usdToOre är enda valutabryggan — dollar får aldrig hamna i cost_ore.
  await recordCost({
    supabase,
    businessId,
    resource: 'llm',
    units: (debug.usage.input_tokens || 0) + (debug.usage.output_tokens || 0),
    costOre: usdToOre(debug.estimated_cost_usd),
    refType: 'agent_run',
    refId: runId,
    meta: { agent: agentId },
  })

  return debug.estimated_cost_usd
}
