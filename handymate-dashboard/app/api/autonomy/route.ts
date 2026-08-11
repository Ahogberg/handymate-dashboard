import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  AUTONOMY_META, STREAK_TARGET, WINDOW_DAYS, computeStreak, autonomyKeyFromApproval,
  resolveAutonomyCap, type AutonomyKey, type AutonomyState,
} from '@/lib/autonomy/earned-autonomy'

/**
 * GET /api/autonomy — per-typ-status för Förtroendetrappan:
 * gatad (streak X/15) | autonom sedan {datum}. Streaks härleds live — även
 * för redan autonoma nycklar (tidigare hårdkodades streak=15 där, vilket
 * dolde att en nyckel med en färsk redigering/avvisning egentligen står på
 * 0 fram tills 15 nya godkännanden byggts upp).
 *
 * Förtroendebevis: handled_60d {approved, edited, failed} — hur de senaste
 * 60 dagarnas godkännanden faktiskt gick, inte bara en streak-siffra — och
 * cap_kr (beloppsgränsen som gäller för nyckeln). En pending_approvals-
 * query totalt för handled_60d, filtrerad per nyckel i minnet.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const keys = Object.keys(AUTONOMY_META) as AutonomyKey[]

  // Fail-safe: ett läsfel behandlas som "inget beviljat, ingen override" —
  // samma riktning som earned-autonomy.ts readState.
  const { data: settingsRow } = await supabase
    .from('v3_automation_settings')
    .select('earned_autonomy')
    .eq('business_id', business.business_id)
    .maybeSingle()
  const state = (settingsRow?.earned_autonomy as AutonomyState) || {}

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000).toISOString()
  const { data: handledRows } = await supabase
    .from('pending_approvals')
    .select('approval_type, status, payload, created_at')
    .eq('business_id', business.business_id)
    .eq('status', 'approved')
    .gte('created_at', sinceIso)
    .limit(500)

  const items = await Promise.all(keys.map(async (key) => {
    const autonomous = state[key]?.status === 'autonomous'
    const streak = await computeStreak(supabase, business.business_id, key)

    // approved/edited/failed är ömsesidigt uteslutande (prioritet: ett
    // misslyckat utförande väger tyngre än att det redigerades) så de tre
    // summerar till exakt handled_60d totalt.
    let approved = 0, edited = 0, failed = 0
    for (const row of handledRows || []) {
      if (autonomyKeyFromApproval(row as { approval_type: string; payload: Record<string, unknown> | null }) !== key) continue
      const payload = row.payload as Record<string, unknown> | null
      const outcome = (payload?.execution_result as Record<string, unknown> | undefined)?.outcome
      if (outcome === 'failed') failed++
      else if (payload?.edited === true) edited++
      else approved++
    }

    return {
      key,
      label: AUTONOMY_META[key].label,
      agent: AUTONOMY_META[key].agentName,
      status: autonomous ? 'autonomous' : 'gated',
      streak,
      target: STREAK_TARGET,
      handled_60d: { approved, edited, failed },
      cap_kr: resolveAutonomyCap(state, key),
    }
  }))

  return NextResponse.json({ items })
}
