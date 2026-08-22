import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { isTestCallArmed, readTestCall } from '@/lib/onboarding/test-call'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/** GET /api/onboarding/test-call/status — pollas varannan sekund av test-vyn. */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = await readTestCall(getServerSupabase(), business.business_id)
  return NextResponse.json({
    armed: isTestCallArmed(state, Date.now()),
    called_at: state.called_at || null,
    sms_sent: state.sms_sent === true,
    sms_error: state.sms_error || null,
    lead_id: state.lead_id || null,
  })
}
