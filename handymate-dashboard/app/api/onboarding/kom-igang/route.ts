import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { deriveKomIgangTasks, type KomIgangSignals, type KomIgangTask } from '@/lib/onboarding/kom-igang-tasks'

export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding/kom-igang — completion för "Kom igång"-railen
 * (docs/design/FORSTA-30-MINUTERNA.md, DEL 4). Ersätter gamla checklistans
 * statiska false med RIKTIG completion ur tre olika källor:
 *
 *   ring_test          — onboarding_data.test_call.called_at (satt av
 *                         app/api/voice/incoming/route.ts när ett riktigt
 *                         samtal matchar det armerade testfönstret — se
 *                         lib/onboarding/test-call.ts, "genomfört" snarare
 *                         än bara "armerat") ELLER minst en rad i
 *                         call_recording för kontot.
 *   forsta_artefakten  — minst ett meeting_job ELLER en quote-rad.
 *   pwa                — minst en push-prenumeration (push_subscriptions,
 *                         sql/v2_push_subscriptions.sql).
 *
 * Lager 3 / B7 (2026-08-27): svaret bär dessutom `tasks` — uppgifter
 * härledda ur kontots riktiga luckor (lib/onboarding/kom-igang-tasks.ts):
 * Lisa (testsamtal), Karin (Fortnox/faktura), Daniel (första offerten),
 * Matte (första uppdraget), Hanna (kundsegment), push (bara när ett riktigt
 * kort väntar). De tre booleanerna ovan finns kvar oförändrade.
 *
 * Fail-safe: går EN delfråga sönder faller den till false (aldrig ett kastat
 * fel som tar ner hela railen) — se catch-blocket.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    const [configRes, callRecRes, meetingRes, quoteRes, pushRes, invoiceRes, missionRes, customerRes, segmentedRes, pendingRes] = await Promise.all([
      supabase.from('business_config').select('onboarding_data, fortnox_connected').eq('business_id', businessId).maybeSingle(),
      supabase.from('call_recording').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('meeting_job').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('push_subscriptions').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('invoice').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('mission').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('customer').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('customer').select('*', { count: 'exact', head: true }).eq('business_id', businessId).not('segment_id', 'is', null),
      supabase.from('pending_approvals').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'pending').neq('approval_type', 'team_intro'),
    ])

    const testCall = (configRes.data?.onboarding_data as Record<string, unknown> | null | undefined)
      ?.test_call as { called_at?: string | null } | undefined

    const ring_test = Boolean(testCall?.called_at) || (callRecRes.count ?? 0) > 0
    const forsta_artefakten = (meetingRes.count ?? 0) > 0 || (quoteRes.count ?? 0) > 0
    const pwa = (pushRes.count ?? 0) > 0

    const signals: KomIgangSignals = {
      ring_test,
      karin_has_invoice_data: Boolean(configRes.data?.fortnox_connected) || (invoiceRes.count ?? 0) > 0,
      has_quote: (quoteRes.count ?? 0) > 0,
      has_mission: (missionRes.count ?? 0) > 0,
      customer_count: customerRes.count ?? 0,
      segmented_customer_count: segmentedRes.count ?? 0,
      pwa,
      pending_real_cards: pendingRes.count ?? 0,
    }
    const tasks: KomIgangTask[] = deriveKomIgangTasks(signals)

    return NextResponse.json({ ring_test, forsta_artefakten, pwa, tasks })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('GET /api/onboarding/kom-igang error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
