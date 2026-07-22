import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkCostGuards, logAgentRun } from '@/lib/agents/shared/cost-guard'
import { runKundbasSweepForBusiness, summarizeSweepResult } from '@/lib/agents/hanna/kundbas-svep'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/agreements/sweep
 *
 * "Väck kundbasen" — manuellt triggat engångssvep över HELA den
 * historiska kundbasen (Motor 2, Etapp 2.5). Skiljer sig från den dagliga
 * cronen (app/api/cron/avtal-forslag/route.ts) genom att INTE begränsa sig
 * till completed-projekt senaste 7 dagarna — hela kundhistoriken är
 * kandidatpoolen. Se lib/agents/hanna/kundbas-svep.ts för all logik.
 *
 * Körs synkront (max ~20 Haiku-anrop, går på sekunder) — ingen kö/webhook
 * behövs. Samma cost-guard-mönster som cronen: kill-switch
 * (agents_globally_paused) + dygns-cost-cap (agent_cost_cap_usd_daily).
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: bizGuards } = await supabase
    .from('business_config')
    .select('business_id, agents_globally_paused, agent_cost_cap_usd_daily')
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (bizGuards) {
    const skip = await checkCostGuards(supabase, bizGuards, 'kundbas-svep')
    if (skip) {
      const message =
        skip.skipped === 'agents_globally_paused'
          ? 'AI-agenterna är pausade för ditt konto just nu — kontakta support om det är oväntat.'
          : 'Dagens AI-budget är redan förbrukad — försök igen imorgon.'
      return NextResponse.json({
        ok: true,
        skipped: skip.skipped,
        message,
      })
    }
  }

  try {
    const result = await runKundbasSweepForBusiness(supabase, business.business_id, business.business_name || null)

    if (result.cost_usd > 0) {
      await logAgentRun(supabase, business.business_id, 'kundbas-svep', {
        debug: {
          usage: result.usage,
          estimated_cost_usd: result.cost_usd,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      result,
      message: result.created > 0 ? null : summarizeSweepResult(result),
    })
  } catch (err) {
    console.error('[agreements/sweep] error:', business.business_id, err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Något gick fel — försök igen' }, { status: 500 })
  }
}
