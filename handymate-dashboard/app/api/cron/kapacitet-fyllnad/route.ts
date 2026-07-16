import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { runCapacityFill } from '@/lib/agents/hanna/capacity-fill'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/kapacitet-fyllnad
 *
 * Hannas "tunn vecka"-trigger: när NÄSTA veckas bokade kapacitet är låg
 * föreslår Hanna — som en KÖAD pending_approval, ALDRIG autonomt — SMS
 * till kandidater ur hantverkarens EGEN CRM ("vi har tider nästa vecka").
 * Fyll den egna kalendern innan pengar spenderas på annonsplattformar.
 * Se lib/agents/hanna/capacity-fill.ts för all logik.
 *
 * Kill-switch: samma mönster som app/api/cron/nurture/route.ts — en
 * hantverkare som pausat sina agenter (agents_globally_paused) ska inte
 * få kapacitetsfyllnad-förslag köade. Hämtas i en batch-query, inte per
 * företag, och en paused business skippas utan att avbryta resten.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id, agents_globally_paused')

  if (error) {
    console.error('[kapacitet-fyllnad] business_config error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let businessesChecked = 0
  let thinWeeks = 0
  let approvalsCreated = 0
  let skippedPaused = 0

  for (const b of businesses || []) {
    if (b.agents_globally_paused === true) {
      skippedPaused++
      continue
    }

    businessesChecked++
    try {
      const result = await runCapacityFill(supabase, b.business_id)
      if (result.thin_week) thinWeeks++
      approvalsCreated += result.approvals_created
    } catch (err: any) {
      console.error('[kapacitet-fyllnad] business error:', b.business_id, err?.message || String(err))
    }
  }

  return NextResponse.json({
    businesses_checked: businessesChecked,
    thin_weeks: thinWeeks,
    approvals_created: approvalsCreated,
    skipped_paused: skippedPaused,
  })
}
