import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAgentRunner, SUPPORTED_AGENTS } from '@/lib/agents/registry'
import { checkCostGuards, logAgentRun } from '@/lib/agents/shared/cost-guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/agent-observations/test
 *
 * Triggar observation-generation för en specifik business direkt
 * utan att vänta på cron-schedule.
 *
 * Auth — TVÅ accepterade vägar:
 * a) Bearer CRON_SECRET-header (samma som riktiga cron)
 * b) Authenticated browser-session — använder då current users business_id default
 *
 * Query-params:
 * - business_id (krävs om CRON_SECRET, default current om session)
 * - agent_id (default 'karin', utökas allt eftersom Phase B/C/D registrerar fler)
 * - debug=true → returnerar full debug-info i result.debug
 * - dry_run=true → 501 v1 (kräver runKarinObservation-refactor)
 *
 * Returnerar full JSON: aggregate + observations + thinking_preview
 * + saved/approvals/insights counts (eller skip-reason).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const requestedBizId = url.searchParams.get('business_id')
  const agentId = (url.searchParams.get('agent_id') || 'karin').toLowerCase()
  const dryRun = url.searchParams.get('dry_run') === 'true'
  const debugMode = url.searchParams.get('debug') === 'true'

  const runner = getAgentRunner(agentId)
  if (!runner) {
    return NextResponse.json(
      {
        error: `agent_id '${agentId}' stöds inte ännu`,
        supported: SUPPORTED_AGENTS,
      },
      { status: 400 },
    )
  }

  // Auth: Bearer CRON_SECRET ELLER inloggad session
  const authHeader = request.headers.get('authorization')
  let businessId: string | null = null
  let businessName = 'företaget'

  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    if (!requestedBizId) {
      return NextResponse.json(
        { error: 'business_id query-param krävs när Bearer CRON_SECRET används' },
        { status: 400 },
      )
    }
    businessId = requestedBizId
    // Hämta business_name OCH cost-guard-fält så test-routen respekterar
    // samma skydd som riktiga cron (Steg 7 fix 2026-05-29).
    const supabase = getServerSupabase()
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name, agents_globally_paused, agent_cost_cap_usd_daily')
      .eq('business_id', businessId)
      .maybeSingle()
    businessName = biz?.business_name || 'företaget'
  } else {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json(
        { error: 'Unauthorized — kräver Bearer CRON_SECRET eller inloggad session' },
        { status: 401 },
      )
    }
    businessId = requestedBizId || business.business_id
    businessName = business.business_name || 'företaget'

    if (requestedBizId && requestedBizId !== business.business_id) {
      return NextResponse.json(
        { error: 'Du kan bara trigga agenter för ditt eget företag (eller använd CRON_SECRET)' },
        { status: 403 },
      )
    }
  }

  if (!businessId) {
    return NextResponse.json({ error: 'business_id kunde inte bestämmas' }, { status: 400 })
  }

  if (dryRun) {
    return NextResponse.json(
      {
        error: 'dry_run inte implementerat v1 — kör utan dry_run för full run',
        note: 'Du kan kolla aggregate via vanlig run och sedan dismissa observations via /api/observations/[id]',
      },
      { status: 501 },
    )
  }

  const supabase = getServerSupabase()

  // Steg 7 fix (2026-05-29): test-routen måste respektera samma cost-guards
  // som riktiga cron. Annars är test-routen en bakdörr förbi cap + pause.
  // Hämta business cost-guard-fält (re-fetch så vi alltid har färska värden
  // även om CRON_SECRET-grenen redan hämtade en del).
  const { data: bizGuards } = await supabase
    .from('business_config')
    .select('business_id, agents_globally_paused, agent_cost_cap_usd_daily')
    .eq('business_id', businessId)
    .maybeSingle()

  if (bizGuards) {
    const skip = await checkCostGuards(supabase, bizGuards, agentId)
    if (skip) {
      return NextResponse.json({
        ok: true,
        business_id: businessId,
        business_name: businessName,
        agent_id: agentId,
        debug_mode: debugMode,
        result: skip,
      })
    }
  }

  try {
    const result = await runner(supabase, businessId, businessName, {
      includeDebug: true,  // alltid debug i test-route så vi kan logga cost
    })

    // Post-step: skriv agent_runs-rad så cap-summan ökar för nästa körning.
    const costUsd = await logAgentRun(supabase, businessId, agentId, result)

    // Slim response: ta bort debug-payloaden om caller inte begärde det
    let returnedResult = result as Record<string, unknown>
    if (!debugMode) {
      returnedResult = { ...returnedResult }
      delete returnedResult.debug
    }

    return NextResponse.json({
      ok: true,
      business_id: businessId,
      business_name: businessName,
      agent_id: agentId,
      debug_mode: debugMode,
      run_cost_usd: Math.round(costUsd * 10000) / 10000,
      result: returnedResult,
    })
  } catch (err: any) {
    console.error(`[agent-observations/test] error for agent=${agentId}:`, err)
    return NextResponse.json(
      {
        ok: false,
        agent_id: agentId,
        error: err?.message || 'Okänt fel',
        stack: err?.stack?.slice(0, 500),
      },
      { status: 500 },
    )
  }
}
