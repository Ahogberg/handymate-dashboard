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

  const { data: businesses, error: bizError } = await supabase
    .from('business_config')
    .select('business_id, business_name')

  if (bizError) {
    console.error(`[cron/agent-observations/${agentId}] business_config error:`, bizError)
    return NextResponse.json(
      { error: bizError.message, stage: 'business_config' },
      { status: 500 },
    )
  }

  const results: Array<Record<string, unknown>> = []

  for (const biz of businesses || []) {
    try {
      const result = await runner(
        supabase,
        biz.business_id,
        biz.business_name || 'företaget',
      )
      results.push({ business_id: biz.business_id, ...result })
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
