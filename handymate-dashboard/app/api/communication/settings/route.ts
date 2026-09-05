import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAutomationSettings, updateAutomationSettings, syncCommunicationSettings, type AutomationSettings } from '@/lib/automations'

// force-dynamic: läser auth via en helper som läser request.headers direkt
// (se CLAUDE.md, kända fallgropar) — annars cachas svaret statiskt.
export const dynamic = 'force-dynamic'

/**
 * GET/PUT /api/communication/settings
 *
 * 2026-09-05: tabellen `communication_settings` har ALDRIG funnits i
 * produktionen (verifierat mot information_schema). Läsningen svalde felet
 * och visade defaultvärden där allt såg påslaget ut; skrivningen gav 500 och
 * reglaget slog tillbaka. Varje reglage på Kommunikation-sidan var dött.
 *
 * Sanningen bor i `automation_settings` — det är den cronerna läser
 * (app/api/cron/quote-follow-up m.fl.). Den här rutten är nu en ren adapter:
 * samma svarsform som förr (så sidan behöver inte byggas om), men
 * läsning och skrivning går mot den tabell som faktiskt styr utskicken.
 * Ingen egen tabell, ingen spegling, ingen andra sanning.
 */

/** Legacy-nyckel → automation_settings-kolumn (inversen av syncCommunicationSettings). */
const TILL_AUTOMATION: Record<string, keyof AutomationSettings> = {
  auto_enabled: 'sms_auto_enabled',
  send_booking_confirmation: 'sms_booking_confirmation',
  send_day_before_reminder: 'sms_day_before_reminder',
  send_on_the_way: 'sms_on_the_way',
  send_quote_followup: 'sms_quote_followup',
  send_job_completed: 'sms_job_completed',
  send_invoice_reminder: 'sms_invoice_reminder',
  send_review_request: 'sms_review_request',
  quiet_hours_start: 'sms_quiet_hours_start',
  quiet_hours_end: 'sms_quiet_hours_end',
  max_sms_per_customer_per_week: 'sms_max_per_customer_week',
}

function svarsform(businessId: string, settings: AutomationSettings) {
  return { business_id: businessId, ...syncCommunicationSettings(settings) }
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const settings = await getAutomationSettings(business.business_id)
    return NextResponse.json(svarsform(business.business_id, settings))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ogiltig begäran' }, { status: 400 })
    }

    const updates: Partial<AutomationSettings> = {}
    for (const [legacy, kolumn] of Object.entries(TILL_AUTOMATION)) {
      if (body[legacy] !== undefined) (updates as any)[kolumn] = body[legacy]
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
    }

    const settings = await updateAutomationSettings(business.business_id, updates)
    return NextResponse.json(svarsform(business.business_id, settings))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
