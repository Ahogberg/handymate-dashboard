import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentFireAndForget, makeIdempotencyKey } from '@/lib/agent-trigger'
import { createHash } from 'crypto'

/**
 * Incoming SMS webhook from 46elks.
 *
 * Flow: 46elks POST → store message → trigger AI agent → return 200 OK
 * Agent handles response via send_sms tool (no standalone Claude here).
 *
 * Dedup: If the Supabase sms-webhook also fires for the same message,
 * the idempotency_key on agent_runs prevents double processing.
 */

// Never cache this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Log immediately before any parsing so Vercel always records the hit
  console.log('[SMS Incoming] POST received, content-type:', request.headers.get('content-type'))

  try {
    const supabase = getServerSupabase()

    // 46elks sends application/x-www-form-urlencoded.
    // request.formData() can fail silently when Content-Type includes a
    // charset suffix ("…; charset=UTF-8"). Parsing via URLSearchParams is
    // reliable regardless of Content-Type variant.
    const text = await request.text()
    const params = new URLSearchParams(text)
    const from = params.get('from') ?? ''
    const to = params.get('to') ?? ''
    const message = params.get('message') ?? ''

    console.log('[SMS Incoming]', { from, to, message: message.substring(0, 50) })

    if (!from || !message) {
      return new NextResponse('Missing data', { status: 400 })
    }

    // Find business by assigned phone number
    let business: { business_id: string; business_name: string } | null = null

    const { data: directBusiness } = await supabase
      .from('business_config')
      .select('business_id, business_name')
      .eq('assigned_phone_number', to)
      .maybeSingle()

    if (directBusiness) {
      business = directBusiness
    } else {
      // Fallback: find via sender's phone number → customer → business
      const { data: customerData } = await supabase
        .from('customer')
        .select('business_id')
        .eq('phone_number', from)
        .limit(1)
        .maybeSingle()

      if (!customerData) {
        console.log('[SMS Incoming] No business found for', to)
        return NextResponse.json({ success: true, handled: false })
      }

      const { data: biz } = await supabase
        .from('business_config')
        .select('business_id, business_name')
        .eq('business_id', customerData.business_id)
        .maybeSingle()

      if (!biz) {
        return NextResponse.json({ success: true, handled: false })
      }

      business = biz
    }

    if (!business) {
      return NextResponse.json({ success: true, handled: false })
    }

    // Store inbound message in sms_conversation
    await supabase
      .from('sms_conversation')
      .insert({
        business_id: business.business_id,
        phone_number: from,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      })

    // V3 Automation Engine: fire sms_received event
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'sms_received', business.business_id, {
        phone: from, message, customer_name: null,
      })
    } catch { /* non-blocking */ }

    // Build conversation history for agent context
    const { data: history } = await supabase
      .from('sms_conversation')
      .select('role, content, created_at')
      .eq('business_id', business.business_id)
      .eq('phone_number', from)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = (history || [])
      .reverse()
      .map((m: any) => `[${m.role}] ${m.content}`)
      .join('\n')

    // Generate idempotency key from message content
    const msgHash = createHash('sha256')
      .update(`${from}:${to}:${message}:${Math.floor(Date.now() / 60000)}`)
      .digest('hex')
      .substring(0, 16)

    // ── Matte Konversationsintelligens (fire-and-forget) ──
    const businessId = business.business_id
    ;(async () => {
      try {
        const { resolveEntity } = await import('@/lib/matte/resolver')
        const { runIntentAgent } = await import('@/lib/matte/intent-agent')
        const { executeMatteActions } = await import('@/lib/matte/action-executor')

        const { data: config } = await supabase
          .from('business_config')
          .select('display_name, business_name, default_hourly_rate, pricing_settings, rot_enabled')
          .eq('business_id', businessId)
          .single()

        const entity = await resolveEntity(from, businessId)

        const signal = {
          channel: 'sms' as const,
          from,
          body: message,
          receivedAt: new Date().toISOString(),
        }

        const businessConf = {
          businessName: config?.display_name || config?.business_name || 'Handymate',
          hourlyRate: (config?.pricing_settings as any)?.hourly_rate || config?.default_hourly_rate || 650,
          rotEnabled: config?.rot_enabled || false,
          workStart: '07:00',
          workEnd: '17:00',
        }

        const decision = await runIntentAgent(signal, entity, businessConf)
        await executeMatteActions(decision, entity, signal, businessId, supabase)
      } catch (err) {
        console.error('[Matte SMS Intelligence] Error:', err)
      }
    })()

    // Trigger the AI agent — it will respond via send_sms tool
    triggerAgentFireAndForget(
      business.business_id,
      'incoming_sms',
      {
        phone_number: from,
        message,
        conversation_history: conversationHistory,
      },
      makeIdempotencyKey('sms', msgHash)
    )

    // Return 200 immediately — agent handles response asynchronously
    // 46elks expects plain-text "OK" (or any 200), not JSON
    return new NextResponse('OK')

  } catch (error: any) {
    console.error('[SMS Incoming] Error:', error)
    return new NextResponse('Internal error', { status: 500 })
  }
}
