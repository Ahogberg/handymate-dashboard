import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { runServiceBookings } from '@/lib/agents/lars/service-bookings'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/service-bookings
 *
 * Lars serie-cron för serviceavtal (Motor 2, Etapp 1, del 6). Se
 * lib/agents/lars/service-bookings.ts för all logik.
 *
 * Kill-switch: samma mönster som app/api/cron/kapacitet-fyllnad/route.ts —
 * en hantverkare som pausat sina agenter (agents_globally_paused) ska inte
 * få bokningar skapade autonomt. Batch-query, inte per företag.
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
    console.error('[service-bookings] business_config error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let businessesChecked = 0
  let skippedPaused = 0
  let agreementsChecked = 0
  let bookingsCreated = 0
  let fallbackUsed = 0
  let skippedAlreadyBooked = 0
  let errors = 0

  for (const b of businesses || []) {
    if (b.agents_globally_paused === true) {
      skippedPaused++
      continue
    }

    businessesChecked++
    try {
      const result = await runServiceBookings(supabase, b.business_id)
      agreementsChecked += result.agreements_checked
      bookingsCreated += result.bookings_created
      fallbackUsed += result.fallback_used
      skippedAlreadyBooked += result.skipped_already_booked
      errors += result.errors
    } catch (err: any) {
      console.error('[service-bookings] business error:', b.business_id, err?.message || String(err))
      errors++
    }
  }

  return NextResponse.json({
    businesses_checked: businessesChecked,
    skipped_paused: skippedPaused,
    agreements_checked: agreementsChecked,
    bookings_created: bookingsCreated,
    fallback_used: fallbackUsed,
    skipped_already_booked: skippedAlreadyBooked,
    errors,
  })
}
