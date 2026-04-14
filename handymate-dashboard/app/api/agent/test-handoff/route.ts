import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { routeToAgent } from '@/lib/agents/personalities'

/**
 * POST /api/agent/test-handoff
 *
 * Verifierar hela agent-teamets inter-kommunikation i produktion.
 *
 * Scenario: Lisa får en inkommande SMS med en faktureringsfråga.
 * Förväntat flöde:
 *   1. routeToAgent('incoming_sms', 'invoice_question') → Lisa
 *   2. Lisa anropar send_agent_message(to=karin, type=handoff) med reason+context
 *   3. Karin triggas automatiskt via /api/agent/trigger
 *   4. Karin svarar kunden med fakturainformation
 *
 * Returnerar en diagnostisk kedja som visar om varje steg lyckades.
 *
 * Kräver inloggad användare (auth via cookie).
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const businessId = business.business_id
    const supabase = getServerSupabase()

    const diagnostics: Record<string, unknown> = {}

    // Steg 1 — verifiera routing
    const routed = routeToAgent('incoming_sms', 'invoice_question')
    diagnostics.step1_routing = {
      trigger_type: 'incoming_sms',
      event_name: 'invoice_question',
      expected: 'lisa',
      actual: routed,
      passed: routed === 'lisa',
    }

    // Steg 2 — kör en riktig agent-trigger (Lisa får faktureringsfråga)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    const testMessageId = 'test_' + Math.random().toString(36).substring(2, 10)

    const triggerRes = await fetch(`${appUrl}/api/agent/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({
        business_id: businessId,
        trigger_type: 'incoming_sms',
        idempotency_key: testMessageId,
        trigger_data: {
          event_name: 'invoice_question',
          test_mode: true,
          sms_body: 'Hej, jag har en fråga om min faktura F-2026-031 — när förfaller den?',
          customer_phone: '+46700000000',
        },
      }),
    })

    const rawText = await triggerRes.text()
    let triggerResult: any = {}
    try { triggerResult = JSON.parse(rawText) } catch { triggerResult = { parse_error: true, raw: rawText.slice(0, 500) } }

    diagnostics.step2_lisa_trigger = {
      status: triggerRes.status,
      ok: triggerRes.ok,
      agent_id: triggerResult.agent_id,
      tool_calls: triggerResult.tool_calls,
      final_response: (triggerResult.final_response || '').slice(0, 200),
      error: triggerResult.error || null,
      raw_if_parse_failed: triggerResult.raw || null,
    }

    // Steg 3 — leta efter handoff i agent_messages (senaste 2 min)
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const { data: recentHandoffs } = await supabase
      .from('agent_messages')
      .select('from_agent, to_agent, message_type, content, metadata, created_at')
      .eq('business_id', businessId)
      .eq('message_type', 'handoff')
      .gte('created_at', twoMinAgo)
      .order('created_at', { ascending: false })
      .limit(5)

    diagnostics.step3_handoff_logged = {
      count: recentHandoffs?.length || 0,
      handoffs: recentHandoffs || [],
    }

    // Steg 4 — leta efter en Karin-körning (samma tidsfönster)
    const { data: recentKarinRuns } = await supabase
      .from('agent_runs')
      .select('run_id, trigger_type, final_response, created_at')
      .eq('business_id', businessId)
      .eq('agent_id', 'karin')
      .gte('created_at', twoMinAgo)
      .order('created_at', { ascending: false })
      .limit(3)

    diagnostics.step4_karin_responded = {
      count: recentKarinRuns?.length || 0,
      runs: recentKarinRuns || [],
    }

    const allPassed =
      (diagnostics.step1_routing as any).passed &&
      triggerRes.ok &&
      (diagnostics.step3_handoff_logged as any).count > 0

    return NextResponse.json({
      ok: allPassed,
      summary: allPassed
        ? 'Handoff-kedjan fungerar ✓'
        : 'Något steg misslyckades — se diagnostik',
      diagnostics,
    })
  } catch (error: any) {
    console.error('[test-handoff] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
