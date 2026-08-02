import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { suggestTimeEntriesForBusiness } from '@/lib/egenkontroll/suggest-time-entry'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/tidrapport-forslag
 *
 * Egenkontroll-agenten — Etapp 2a (tasks/easoft-gap-plan.md). Dagligt
 * svep som för varje business hittar gårdagens genomförda projektbokningar
 * utan matchande tidrapport och skapar ett godkänn-kort PER PROJEKT (inte
 * per person — se lib/egenkontroll/suggest-time-entry.ts för varför).
 *
 * Kill-switch: samma mönster som app/api/cron/service-bookings/route.ts —
 * en hantverkare som pausat sina agenter (agents_globally_paused) ska inte
 * få nya förslag skapade åt sig. Batch-query, inte per företag. Ingen
 * cost-guard (checkCostGuards) här — detta är ren DB-matchning, ingen
 * AI-modell anropas, så businessens dygns-cost-cap är inte relevant
 * (samma resonemang som lib/egenkontroll/suggest-checklist.ts, etapp 1d,
 * som av samma skäl inte har någon cost-guard).
 *
 * Auth: Bearer CRON_SECRET, samma mönster som app/api/cron/driftlarm.
 *
 * Registrerad i vercel.json: "5 7 * * *" (07:05 svensk normaltid/UTC+1 —
 * ledig lucka mellan check-overdue 07:00 och kapacitet-fyllnad/service-
 * bookings-klustret kring 06:00-07:00/08:00, se vercel.json för
 * fullständig lista över upptagna tider).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runTidrapportForslag()
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runTidrapportForslag()
}

async function runTidrapportForslag() {
  const supabase = getServerSupabase()

  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id, agents_globally_paused')

  if (error) {
    console.error('[tidrapport-forslag] business_config error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let businessesChecked = 0
  let skippedPaused = 0
  let errors = 0

  for (const b of businesses || []) {
    if (b.agents_globally_paused === true) {
      skippedPaused++
      continue
    }

    businessesChecked++
    try {
      // suggestTimeEntriesForBusiness är fail-safe (kastar aldrig) på egen
      // hand, men try/catch här ändå — en trasig business får aldrig
      // stoppa svepet för resten (samma dubbla skydd som andra crons i
      // repot som loopar business_config).
      await suggestTimeEntriesForBusiness(b.business_id)
    } catch (err: any) {
      console.error('[tidrapport-forslag] business error:', b.business_id, err?.message || String(err))
      errors++
    }
  }

  return NextResponse.json({
    success: true,
    businesses_checked: businessesChecked,
    skipped_paused: skippedPaused,
    errors,
  })
}
