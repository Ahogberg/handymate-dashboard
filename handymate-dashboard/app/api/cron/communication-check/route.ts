import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/communication-check - Daily communication check via AI agent.
 * Keeps: Finding active businesses.
 * Delegates: Customer communication evaluation to AI agent.
 */
export async function GET(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const today = new Date().toISOString().split('T')[0]

    // Find explicitly disabled businesses
    // AV-KNAPPEN FANNS INTE (2026-09-02). Den här cronen bad agenten
    // "Skicka lämpliga uppföljningar via SMS eller email" för VARJE företag,
    // och den enda spärren var communication_settings.auto_enabled = false.
    // Tabellen communication_settings har aldrig skapats i produktionen —
    // felet swäljdes (bara `data` lästes, aldrig `error`), disabledBusinesses
    // blev tom, och alla behandlades som påslagna. Fail-open på en utgående
    // automation, precis den sort som stängdes av i 46c9f7d; den här överlevde
    // för att grinden bodde i en tabell som inte fanns.
    //
    // Nu: samma grind som resten (agents_globally_paused, se
    // app/api/cron/agent-context/route.ts) OCH den ursprungliga per-företags-
    // inställningen när tabellen väl finns. Saknas tabellen ⇒ FAIL-CLOSED:
    // ingen får utgående uppföljningar automatiskt. Tystnad är rätt default
    // för något som skickar SMS till hantverkarens kunder.
    // 2026-09-05: av-listan läses ur automation_settings (sms_auto_enabled =
    // false) — samma sanning som quote-follow-up och Kommunikation-sidan.
    // communication_settings fanns aldrig; gårdagens fail-closed-spärr på den
    // gjorde att den här cronen inte gjorde något alls. Fortsatt fail-closed:
    // kan listan inte läsas körs inget utgående.
    const { data: disabledSettings, error: settingsError } = await supabase
      .from('automation_settings')
      .select('business_id')
      .eq('sms_auto_enabled', false)

    if (settingsError) {
      console.warn('[cron/communication-check] automation_settings kunde inte läsas — hoppar över allt utgående:', settingsError.message)
      return NextResponse.json({
        success: true,
        businesses: 0,
        agent_triggered: 0,
        skipped: 'automation_settings kunde inte läsas — fail-closed',
      })
    }

    const disabledBusinesses = new Set((disabledSettings || []).map((d: any) => d.business_id))

    // Get all active businesses (excluding disabled and globally paused)
    const { data: allBusinesses } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused')
      .limit(100)

    const activeBusinessIds = (allBusinesses || [])
      .filter((b: any) => b.agents_globally_paused !== true)
      .map((b: any) => b.business_id)
      .filter((id: string) => !disabledBusinesses.has(id))

    let agentTriggered = 0
    for (const businessId of activeBusinessIds) {
      const result = await triggerAgentInternal(
        businessId,
        'cron',
        {
          cron_type: 'communication_check',
          instruction: 'Kör daglig kommunikationskontroll. Identifiera kunder som inte kontaktats på länge, offerter utan svar, och bokningar som behöver bekräftelse. Skicka lämpliga uppföljningar via SMS eller email.',
        },
        makeIdempotencyKey('comm', businessId, today)
      )
      if (result.success) agentTriggered++
    }

    return NextResponse.json({
      success: true,
      businesses: activeBusinessIds.length,
      agent_triggered: agentTriggered,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
