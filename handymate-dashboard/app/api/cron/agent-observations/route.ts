import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { runKarinObservation } from '@/lib/agents/karin/observation-prompt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/agent-observations
 *
 * Vecko-cron (söndag + onsdag 06 UTC) som låter agenter (Karin v1)
 * göra "riktiga anställda"-observationer av hantverkarens verksamhet.
 *
 * v1: ENBART Karin. Övriga agenter följer när Karin-prompten har
 * validerats mot Christoffer-feedback.
 *
 * Karin-logiken finns i lib/agents/karin/observation-prompt.ts:
 * - buildAggregate (90d invoice + trender + per-customer-type + sent-pending)
 * - callKarinWithThinking (raw Anthropic API med extended-thinking,
 *   Sonnet 4)
 * - saveAndPush (business_knowledge + pending_approvals + sendApprovalPush)
 *
 * Cron-routen är tunn wrapper: hämtar businesses, iterearar
 * runKarinObservation, returnerar summary per business.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: businesses, error: bizError } = await supabase
    .from('business_config')
    .select('business_id, business_name')

  if (bizError) {
    console.error('[cron/agent-observations] business_config error:', bizError)
    return NextResponse.json(
      { error: bizError.message, stage: 'business_config' },
      { status: 500 },
    )
  }

  const results: Array<Record<string, unknown>> = []

  for (const biz of businesses || []) {
    try {
      const result = await runKarinObservation(
        supabase,
        biz.business_id,
        biz.business_name || 'företaget',
      )
      results.push({ business_id: biz.business_id, ...result })
    } catch (err) {
      console.error('[cron/agent-observations] business error:', {
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
    businesses_processed: results.length,
    results,
  })
}
