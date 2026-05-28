import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAgentRunner, SUPPORTED_AGENTS } from '@/lib/agents/registry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/agent-observations/[agent]
 *
 * Per-agent cron-route. Vercel cron triggar denna med agent-id i path
 * (Vercel cron stödjer inte query-params). Varje agent har sin egen
 * schedule i vercel.json så de inte överbelastar Anthropic API
 * samtidigt:
 *
 *   karin:  0 6 * * 0,3 (06:00 UTC söndag + onsdag)
 *   daniel: 5 6 * * 0,3 (06:05 UTC)
 *   lars:   10 6 * * 0,3 (06:10 UTC)
 *   hanna:  15 6 * * 0,3 (06:15 UTC)
 *
 * Auth: Bearer CRON_SECRET (samma som övriga cron-routes).
 *
 * Per business:
 * 1. Iterar alla rader i business_config
 * 2. Anropa AGENT_RUNNERS[agentId] för varje
 * 3. Samla resultat per business (skipped / observations_total / saved /
 *    approvals_created / insights_pushed / error)
 *
 * Felhantering: per-business try/catch — ett fel stoppar inte resten.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { agent: string } },
) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agentId = (params.agent || '').toLowerCase()
  const runner = getAgentRunner(agentId)

  if (!runner) {
    return NextResponse.json(
      {
        error: `Unknown agent_id '${agentId}'`,
        supported: SUPPORTED_AGENTS,
      },
      { status: 400 },
    )
  }

  const supabase = getServerSupabase()

  // Filtrera ut dött/test-konton (pilot-fix-plan Steg 2, audit 2 2026-05-20).
  // Karin-buggen: agenter körde mot biz_6wunctak49 (dubblett-konto). Default
  // för is_active är true så alla befintliga businesses fortsätter ingå.
  // För att stänga av en business från cron: UPDATE business_config SET
  // is_active=false WHERE business_id=...
  //
  // Steg 7 (2026-05-29): två extra cost-guardrails:
  //   - agents_globally_paused: kill-switch per business
  //   - agent_cost_cap_usd_daily: dygnsmax i USD, summerat från agent_runs
  const { data: businesses, error: bizError } = await supabase
    .from('business_config')
    .select('business_id, business_name, agents_globally_paused, agent_cost_cap_usd_daily')
    .eq('is_active', true)

  if (bizError) {
    console.error(`[cron/agent-observations/${agentId}] business_config error:`, bizError)
    return NextResponse.json(
      { error: bizError.message, stage: 'business_config' },
      { status: 500 },
    )
  }

  // Start of today (UTC) — används för dagens cost-summa och agent_runs-rad.
  const startOfTodayIso = (() => {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    return d.toISOString()
  })()

  const results: Array<Record<string, unknown>> = []

  for (const biz of (businesses || []) as Array<{
    business_id: string
    business_name: string | null
    agents_globally_paused: boolean | null
    agent_cost_cap_usd_daily: number | string | null
  }>) {
    // ── Pre-check 1: kill-switch ────────────────────────────────
    if (biz.agents_globally_paused === true) {
      console.log(`[cron/agent-observations/${agentId}] skip business — agents_globally_paused`, {
        business_id: biz.business_id,
      })
      results.push({
        business_id: biz.business_id,
        skipped: 'agents_globally_paused',
      })
      continue
    }

    // ── Pre-check 2: cost-cap. Summera dagens estimated_cost för business. ──
    const cap = biz.agent_cost_cap_usd_daily != null
      ? Number(biz.agent_cost_cap_usd_daily)
      : 5.0
    let todayCostUsd = 0
    try {
      const { data: todayRuns } = await supabase
        .from('agent_runs')
        .select('estimated_cost')
        .eq('business_id', biz.business_id)
        .gte('created_at', startOfTodayIso)
      todayCostUsd = (todayRuns || []).reduce((s, r) => s + Number(r.estimated_cost || 0), 0)
    } catch (sumErr) {
      console.warn(`[cron/agent-observations/${agentId}] cost-summering failed (fortsätter ändå):`, sumErr)
    }

    if (todayCostUsd >= cap) {
      console.log(`[cron/agent-observations/${agentId}] skip business — cost-cap`, {
        business_id: biz.business_id,
        today_cost_usd: todayCostUsd,
        cap_usd: cap,
      })
      results.push({
        business_id: biz.business_id,
        skipped: 'cost_cap_exceeded',
        today_cost_usd: Math.round(todayCostUsd * 10000) / 10000,
        cap_usd: cap,
      })
      continue
    }

    // ── Kör agent ───────────────────────────────────────────────
    try {
      const result = await runner(
        supabase,
        biz.business_id,
        biz.business_name || 'företaget',
        { includeDebug: true },
      )

      // ── Post-step: logga agent_runs-rad med usage + cost ──────
      const debug = (result as { debug?: { usage?: { input_tokens: number; output_tokens: number }; estimated_cost_usd?: number } }).debug
      if (debug?.usage && typeof debug.estimated_cost_usd === 'number') {
        try {
          const runId = 'agentrun_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
          await supabase.from('agent_runs').insert({
            run_id: runId,
            business_id: biz.business_id,
            trigger_type: `agent_observation_cron:${agentId}`,
            tokens_used: (debug.usage.input_tokens || 0) + (debug.usage.output_tokens || 0),
            estimated_cost: debug.estimated_cost_usd,
            status: 'completed',
          })
        } catch (logErr) {
          // Non-blocking — cron-resultat är viktigare än perfekt logging
          console.warn(`[cron/agent-observations/${agentId}] agent_runs insert failed:`, logErr)
        }
      }

      // Inkludera inte hela debug-payloaden i response (kan vara tung)
      const slim = { ...(result as Record<string, unknown>) }
      delete slim.debug
      results.push({
        business_id: biz.business_id,
        ...slim,
        today_cost_usd_after: Math.round((todayCostUsd + (debug?.estimated_cost_usd || 0)) * 10000) / 10000,
      })
    } catch (err) {
      console.error(`[cron/agent-observations/${agentId}] business error:`, {
        business_id: biz.business_id,
        error: err instanceof Error ? err.message : String(err),
      })
      results.push({
        business_id: biz.business_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    agent_id: agentId,
    businesses_processed: results.length,
    results,
  })
}
