import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getWeekCapacity, mondayOfWeek, currentWeekMonday } from '@/lib/capacity/week-capacity'
import { svDateStrPlusDays } from '@/lib/dates'

/**
 * GET /api/capacity/week — kapacitet-primitiv v1.
 *
 * Query-parametrar:
 * - week_start (valfri): YYYY-MM-DD. Snappas alltid till veckans måndag
 *   (även om ett datum mitt i veckan skickas in) så att svaret alltid
 *   representerar en hel vecka. Default: innevarande veckas måndag,
 *   svensk lokaltid.
 * - weeks (valfri): 1–8, default 1. Returnerar N på varandra följande
 *   veckor (för en framtida radar-liknande vy).
 *
 * Svar: en enskild WeekCapacity (weeks=1) eller { weeks: WeekCapacity[] }.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const weekStartParam = request.nextUrl.searchParams.get('week_start')
    const weekStart =
      weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
        ? mondayOfWeek(weekStartParam)
        : currentWeekMonday()

    const weeksParam = Number(request.nextUrl.searchParams.get('weeks') || '1')
    const weeks = Number.isFinite(weeksParam) ? Math.min(8, Math.max(1, Math.round(weeksParam))) : 1

    const anchor = new Date(`${weekStart}T12:00:00Z`)
    const results = []
    for (let i = 0; i < weeks; i++) {
      const ws = svDateStrPlusDays(i * 7, anchor)
      results.push(await getWeekCapacity(supabase, business.business_id, ws))
    }

    if (weeks === 1) {
      return NextResponse.json(results[0])
    }
    return NextResponse.json({ weeks: results })
  } catch (error) {
    console.error('[api/capacity/week] error', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500 })
  }
}
