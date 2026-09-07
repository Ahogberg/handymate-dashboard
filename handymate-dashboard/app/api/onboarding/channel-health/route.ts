import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { loadChannelHealth } from '@/lib/onboarding/channel-health-data'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Auth ligger kvar vid HTTP-gränsen. Samma bevisläsning används av cron. */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
  }
  try {
    return NextResponse.json(await loadChannelHealth(getServerSupabase(), business.business_id))
  } catch (error) {
    console.error('[onboarding/channel-health]', error)
    return NextResponse.json({ error: 'Kunde inte verifiera kundinflödets status' }, { status: 500 })
  }
}
