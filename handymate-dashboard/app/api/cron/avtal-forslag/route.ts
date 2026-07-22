import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { checkCostGuards, logAgentRun } from '@/lib/agents/shared/cost-guard'
import { runAvtalForslagForBusiness } from '@/lib/agents/hanna/avtal-forslag'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/avtal-forslag
 *
 * Hannas förslagscron för serviceavtal (Motor 2, Etapp 2, lager 2). Körs
 * dagligen på en ledig tid (40 8 * * * — mellan quote-follow-up 08:00 och
 * hanna-outbound 08:30). Se lib/agents/hanna/avtal-forslag.ts för all logik:
 * completed-projekt senaste 7 dagarna → Haiku-matchning mot businessens
 * service_agreement_type-katalog (fallback: match_keys) → kö-kort
 * (approval_type 'send_sms') så hantverkaren godkänner innan kunden
 * kontaktas — AI:n väljer och personaliserar, hittar ALDRIG på pris/intervall.
 *
 * Cost-guard: samma mönster som app/api/cron/agent-observations/[agent]/route.ts
 * — kill-switch (agents_globally_paused) + dygns-cost-cap
 * (agent_cost_cap_usd_daily) via delad helper, pre-check per business +
 * post-log av faktisk Haiku-kostnad.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, agents_globally_paused, agent_cost_cap_usd_daily')

  if (error) {
    console.error('[cron/avtal-forslag] business_config error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []

  let businessesChecked = 0
  let approvalsCreated = 0
  let skippedGuard = 0

  for (const biz of (businesses || []) as Array<{
    business_id: string
    business_name: string | null
    agents_globally_paused: boolean | null
    agent_cost_cap_usd_daily: number | string | null
  }>) {
    const skip = await checkCostGuards(supabase, biz, 'avtal-forslag')
    if (skip) {
      skippedGuard++
      results.push({ business_id: biz.business_id, ...skip })
      continue
    }

    businessesChecked++
    try {
      const result = await runAvtalForslagForBusiness(supabase, biz.business_id, biz.business_name || null)
      approvalsCreated += result.approvals_created

      // Post-step: logga faktisk Haiku-kostnad för dagens cost-cap-summering
      // (samma helper som agent-observations-cronen, spegel-shape av dess
      // debug-objekt).
      if (result.cost_usd > 0) {
        await logAgentRun(supabase, biz.business_id, 'avtal-forslag', {
          debug: {
            usage: result.usage,
            estimated_cost_usd: result.cost_usd,
          },
        })
      }

      results.push({ ...result })
    } catch (err) {
      console.error('[cron/avtal-forslag] business error:', biz.business_id, err instanceof Error ? err.message : String(err))
      results.push({ business_id: biz.business_id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({
    ok: true,
    businesses_scanned: businesses?.length || 0,
    businesses_checked: businessesChecked,
    skipped_guard: skippedGuard,
    approvals_created: approvalsCreated,
    results,
  })
}
