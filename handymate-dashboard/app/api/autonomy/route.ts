import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  AUTONOMY_META, STREAK_TARGET, computeStreak, isAutonomous, type AutonomyKey,
} from '@/lib/autonomy/earned-autonomy'

/**
 * GET /api/autonomy — per-typ-status för Förtroendetrappan:
 * gatad (streak X/15) | autonom sedan {datum}. Streaks härleds live.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const keys = Object.keys(AUTONOMY_META) as AutonomyKey[]

  const items = await Promise.all(keys.map(async (key) => {
    const autonomous = await isAutonomous(supabase, business.business_id, key)
    const streak = autonomous ? STREAK_TARGET : await computeStreak(supabase, business.business_id, key)
    return {
      key,
      label: AUTONOMY_META[key].label,
      agent: AUTONOMY_META[key].agentName,
      status: autonomous ? 'autonomous' : 'gated',
      streak,
      target: STREAK_TARGET,
    }
  }))

  return NextResponse.json({ items })
}
