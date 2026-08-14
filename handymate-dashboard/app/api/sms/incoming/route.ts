import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentFireAndForget, makeIdempotencyKey } from '@/lib/agent-trigger'
import { createHash } from 'crypto'
import { verifyElksSignature } from '@/lib/elks-signature'
import { sendSmsViaElks, findCustomerByPhone, parseOptOutCommand } from '@/lib/sms-send'

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

    // Verifiera 46elks-signatur (kan inaktiveras via ELKS_SKIP_SIGNATURE i dev)
    if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
      // Skapa en klon med body för signaturvalidering
      const req = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: text })
      if (!verifyElksSignature(req, text)) {
        console.error('[SMS Incoming] Ogiltig 46elks-signatur, avvisar webhook')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

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
      // ═══ FALLBACKEN FICK INTE GISSA TENANT (2026-08-08) ═══
      //
      // Uppslaget var `.eq('phone_number', from).limit(1)` utan business-
      // filter. Ett nummer som finns som kund hos TVÅ företag routade alltså
      // SMS:et — och agentkörningen som följer — till vilken rad som råkade
      // returneras först. Hantverkare i samma bransch delar underleverantörer;
      // det är inget kantfall.
      //
      // Fallbacken behövs (numret kan vara lagrat i annat format än `to`), så
      // den finns kvar — men bara när svaret är ENTYDIGT. Är det tvetydigt
      // finns ingen tenant-evidens, och då gör vi ingenting.
      const { data: kandidater } = await supabase
        .from('customer')
        .select('business_id')
        .eq('phone_number', from)
        .limit(10)

      const företag = Array.from(new Set((kandidater || []).map(k => k.business_id)))
      if (företag.length === 0) {
        console.log('[SMS Incoming] No business found for', to)
        return NextResponse.json({ success: true, handled: false })
      }
      if (företag.length > 1) {
        console.warn(
          `[SMS Incoming] avsändaren ${from} finns hos ${företag.length} företag och "${to}" matchar inget tilldelat nummer — avstår i stället för att gissa tenant`
        )
        return NextResponse.json({ success: true, handled: false })
      }

      const { data: biz } = await supabase
        .from('business_config')
        .select('business_id, business_name')
        .eq('business_id', företag[0])
        .maybeSingle()

      if (!biz) {
        return NextResponse.json({ success: true, handled: false })
      }

      business = biz
    }

    if (!business) {
      return NextResponse.json({ success: true, handled: false })
    }

    // ── Opt-out/spärrlista (VP1, gap 7 — tasks/vilande-pengar-masterplan.md) ──
    // STOPP/STOP/SLUTA flaggar kunden så inga fler agent-SMS går ut
    // (sendSmsViaElks kollar flaggan vid varje utskick). START/STARTA häver
    // den. Rör INTE övrig inbound-logik — kommandot hanteras helt separat
    // och triggar aldrig AI-agenten eller loggas i sms_conversation (det är
    // ett systemkommando, inte en konversation att svara AI-mässigt på).
    const optOutCommand = parseOptOutCommand(message)
    const isStopCommand = optOutCommand === 'stop'
    const isStartCommand = optOutCommand === 'start'

    if (isStopCommand || isStartCommand) {
      try {
        const matchedCustomer = await findCustomerByPhone(supabase, business.business_id, from)
        if (matchedCustomer) {
          const confirmMessage = isStopCommand
            ? 'Du får inga fler SMS från oss. Svara START för att ändra dig.'
            : 'Du får SMS från oss igen. Tack!'

          // Skicka bekräftelsen FÖRE opt-out-flaggan sätts — annars
          // blockerar sendSmsViaElks:s egen opt-out-koll bekräftelsen
          // själv i STOPP-fallet (kunden hinner sättas som avböjd innan
          // "du får inga fler SMS"-svaret går ut).
          const { data: bizCfg } = await supabase
            .from('business_config')
            .select('business_name')
            .eq('business_id', business.business_id)
            .maybeSingle()

          await sendSmsViaElks({
            supabase,
            businessId: business.business_id,
            businessName: bizCfg?.business_name || business.business_name,
            to: from,
            message: confirmMessage,
            customerId: matchedCustomer.customer_id,
            messageType: isStopCommand ? 'opt_out_confirm' : 'opt_in_confirm',
          })

          await supabase
            .from('customer')
            .update({
              sms_opt_out: isStopCommand,
              sms_opt_out_at: isStopCommand ? new Date().toISOString() : null,
              sms_opt_out_source: isStopCommand ? 'sms_stop' : null,
            })
            .eq('customer_id', matchedCustomer.customer_id)
            .eq('business_id', business.business_id)
        }
      } catch (err) {
        // Tål att sql/v86 inte körts (kolumn saknas) eller andra DB-fel —
        // loggar men svarar ändå 200 så 46elks inte retryar i onödan.
        console.error('[SMS Incoming] STOPP/START-hantering misslyckades (icke-blockerande):', err)
      }
      return new NextResponse('OK')
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
    } catch (err) {
      console.error('[SMS Incoming] fireEvent sms_received failed (non-blocking):', business.business_id, from, err)
    }

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
        const { getAvailableSlots } = await import('@/lib/matte/calendar-slots')

        const { data: config } = await supabase
          .from('business_config')
          .select('display_name, business_name, default_hourly_rate, pricing_settings, rot_enabled')
          .eq('business_id', businessId)
          .single()

        const [entity, availableSlots] = await Promise.all([
          resolveEntity(from, businessId),
          getAvailableSlots(businessId, 2).catch(() => [] as import('@/lib/matte/calendar-slots').TimeSlot[]),
        ])

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

        const decision = await runIntentAgent(signal, entity, businessConf, availableSlots, businessId, supabase)
        await executeMatteActions(decision, entity, signal, businessId, supabase, availableSlots)

        // V34: Delegera till specialist-agent om Matte rekommenderar det
        if (decision.suggestedAgent && decision.suggestedAgent !== 'matte') {
          const { routeToAgentWithContext } = await import('@/lib/matte/agent-router')
          await routeToAgentWithContext(decision.suggestedAgent, signal, entity, decision, businessId, supabase)
        }
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
