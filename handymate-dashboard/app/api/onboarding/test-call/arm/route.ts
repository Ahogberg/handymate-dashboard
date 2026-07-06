import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { ARM_WINDOW_MINUTES, writeTestCall } from '@/lib/onboarding/test-call'

/**
 * POST /api/onboarding/test-call/arm — armera ring-testet (10 min).
 * Endast under onboarding (completed → 409: testet är en onboarding-upplevelse;
 * post-completion skulle seedade regler dessutom kunna dubbel-SMS:a).
 * Re-armering tillåten (prova igen) — nollställer staten.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data: biz } = await supabase
    .from('business_config')
    .select('assigned_phone_number, onboarding_completed_at')
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (biz?.onboarding_completed_at) {
    return NextResponse.json({ available: false, reason: 'completed' }, { status: 409 })
  }
  // Riktigt nummer krävs (platshållaren '+46 76 000 00 00' går inte att ringa)
  if (!biz?.assigned_phone_number || !process.env.ELKS_API_USER) {
    return NextResponse.json({ available: false, reason: 'no_number' })
  }

  await writeTestCall(supabase, business.business_id, {
    armed_until: new Date(Date.now() + ARM_WINDOW_MINUTES * 60_000).toISOString(),
    called_at: null, sms_sent: false, sms_error: null,
    lead_id: null, customer_id: null, deal_id: null,
  }, { replace: true })

  return NextResponse.json({ available: true, phone_number: biz.assigned_phone_number })
}
