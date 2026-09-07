import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { deriveKomIgangTasks, type KomIgangTask } from '@/lib/onboarding/kom-igang-tasks'
import { hamtaKomIgangSignals } from '@/lib/onboarding/kom-igang-signals'

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
 * Nödvändigt start-/kanalunderlag kan inte läsas: HTTP 500, så railen
 * visar återförsök i stället för att prioritera med ofullständiga bevis.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Basluckorna delas med livscykelmailen (lib/onboarding/kom-igang-signals.ts)
    // så startsidan och mailen aldrig kan säga olika saker om samma konto.
    const [baseSignals, meetingRes, quoteRes] = await Promise.all([
      hamtaKomIgangSignals(supabase, businessId),
      supabase.from('meeting_job').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
    ])

    const ring_test = baseSignals.ring_test
    const forsta_artefakten = (meetingRes.count ?? 0) > 0 || (quoteRes.count ?? 0) > 0
    const pwa = baseSignals.pwa

    const tasks: KomIgangTask[] = deriveKomIgangTasks(baseSignals)

    return NextResponse.json({ ring_test, forsta_artefakten, pwa, tasks })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('GET /api/onboarding/kom-igang error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
