import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentFireAndForget, makeIdempotencyKey } from '@/lib/agent-trigger'
import { createHash } from 'crypto'
import { verifieraElksWebhook, larmaAvvisadElksWebhook, medElksHemlighet } from '@/lib/elks-webhook-auth'
import { sendSmsViaElks, parseOptOutCommand } from '@/lib/sms-send'
import { resolveSmsCustomer } from '@/lib/outbound/sms-gate'
import { isTeamPhone } from '@/lib/matte/owner-sender'
import { phoneCandidates, findCustomerByPhone } from '@/lib/voice/find-customer-by-phone'
import { hittaMissatSamtal, INGEN_KOPPLING } from '@/lib/sms/relatera-missat-samtal'

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
    const elksVerdikt = verifieraElksWebhook(request)
    if (!elksVerdikt.ok) {
      larmaAvvisadElksWebhook('sms/incoming', elksVerdikt)
      return new NextResponse('Unauthorized', { status: 401 })
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
      // Spår 1 (2026-09-18): uppslaget var `.eq('phone_number', from)` på
      // råvärdet. 46elks levererar E.164 (+4670…) medan kunder ofta är
      // sparade som "070-123 45 67" — fallbacken missade alltså just de
      // kunder den fanns för, och SMS:et föll som "okänt företag".
      // phoneCandidates ger samma kandidatlista som resten av kundminnet.
      const { data: kandidater } = await supabase
        .from('customer')
        .select('business_id')
        .in('phone_number', phoneCandidates(from))
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
      const resolution = await resolveSmsCustomer({
        supabase,
        businessId: business.business_id,
        phoneE164: from,
      })
      if (!resolution.ok) {
        if (resolution.code === 'guard_unavailable') {
          console.error('[SMS Incoming] STOPP/START kunde inte verifiera kundskyddet:', resolution.error)
          return new NextResponse('Temporary error', { status: 503 })
        }
        // Ett okänt nummer har ingen kundrad att spärra. Inget agentflöde
        // triggas, men retry hjälper inte och ska därför inte begäras.
        console.warn('[SMS Incoming] STOPP/START saknar entydig kund:', resolution.error)
        return new NextResponse('OK')
      }

      const matchedCustomer = resolution.customer
      // Spara samtyckesläget FÖRE kvittensen. Supabase kastar inte på query-
      // fel, därför läses både error och den returnerade raden uttryckligen.
      const { data: updatedCustomer, error: optOutUpdateError } = await supabase
        .from('customer')
        .update({
          sms_opt_out: isStopCommand,
          sms_opt_out_at: isStopCommand ? new Date().toISOString() : null,
          sms_opt_out_source: isStopCommand ? 'sms_stop' : null,
        })
        .eq('customer_id', matchedCustomer.customerId)
        .eq('business_id', business.business_id)
        .select('customer_id')
        .maybeSingle()

      if (optOutUpdateError || !updatedCustomer) {
        console.error(
          '[SMS Incoming] STOPP/START kunde inte sparas — begär webhook-retry:',
          optOutUpdateError?.message || 'kundraden uppdaterades inte',
        )
        return new NextResponse('Temporary error', { status: 503 })
      }

      const confirmMessage = isStopCommand
        ? 'Du får inga fler SMS från oss. Svara START för att ändra dig.'
        : 'Du får SMS från oss igen. Tack!'
      const confirmation = await sendSmsViaElks({
        supabase,
        businessId: business.business_id,
        businessName: business.business_name,
        to: from,
        message: confirmMessage,
        customerId: matchedCustomer.customerId,
        messageType: isStopCommand ? 'opt_out_confirm' : 'opt_in_confirm',
        recipient: 'customer',
        purpose: 'consent_confirmation',
      })
      if (!confirmation.success) {
        // Flaggan är redan sann och får aldrig rullas tillbaka för att själva
        // kvittensen misslyckades. Felet är synligt i sms_log och Vercel-logg.
        console.error('[SMS Incoming] STOPP/START-kvittens misslyckades:', confirmation.error)
      }
      return new NextResponse('OK')
    }

    // ── Ägare vs kund (kundminne-revisionen 2026-09-02, gap 4) ──────────────
    // En i teamet som SMS:ar till det tilldelade numret ska aldrig behandlas
    // som kund: inget resolveEntity, ingen intent-agent, inga Matte-actions,
    // inget automatiskt kundsvar — och meddelandet sparas inte i
    // sms_conversation som en kundrad. Ägarintag via SMS är ett senare steg;
    // det här stänger bara buggen att ägaren körde kundflödet.
    if (await isTeamPhone(supabase, business.business_id, from)) {
      console.info('[sms/incoming] avsändaren är en i teamet — kundflödet hoppas')
      return new NextResponse('OK')
    }

    // ── Identiteten löses EN gång, normaliserat (spår 1, 2026-09-18) ──
    // Raden i sms_conversation bar bara ett telefonnummer, så varje läsare
    // fick matcha om råsträngen — och missade då samma kund som här.
    // Kolumnerna customer_id/lead_id finns (v260) och fylls nu vid källan.
    let smsCustomerId: string | null = null
    let smsLeadId: string | null = null
    try {
      const träff = await findCustomerByPhone(supabase, business.business_id, from)
      if (träff) {
        smsCustomerId = träff.customer_id
      } else {
        const kandidatnummer = phoneCandidates(from)
        if (kandidatnummer.length > 0) {
          const { data: lead } = await supabase
            .from('leads')
            .select('lead_id')
            .eq('business_id', business.business_id)
            .in('phone', kandidatnummer)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (lead) smsLeadId = lead.lead_id
        }
      }
    } catch (identitetsFel) {
      // Ett uppslagsfel får aldrig kosta oss meddelandet.
      console.error('[SMS Incoming] identitetsuppslaget misslyckades (fail-soft):', identitetsFel)
    }

    // Svarar kunden på ett missat samtal? Kortet och Matte-kontexten ska
    // veta det — vi bad ju själva om svaret i fångst-SMS:et.
    const missatSamtal = await hittaMissatSamtal(supabase, business.business_id, from)
      .catch(() => INGEN_KOPPLING)

    // Store inbound message in sms_conversation
    const { data: sparadRad } = await supabase
      .from('sms_conversation')
      .insert({
        business_id: business.business_id,
        phone_number: from,
        customer_id: smsCustomerId,
        lead_id: smsLeadId,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

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
          // Spår 1: svaret på ett missat samtal ska bära samtalet med sig.
          relatedCallId: missatSamtal.related_call_id,
          svarPaMissatSamtal: missatSamtal.svar_pa_missat_samtal,
        }

        const businessConf = {
          businessName: config?.display_name || config?.business_name || 'Handymate',
          hourlyRate: (config?.pricing_settings as any)?.hourly_rate || config?.default_hourly_rate || 650,
          rotEnabled: config?.rot_enabled || false,
          workStart: '07:00',
          workEnd: '17:00',
        }

        const decision = await runIntentAgent(signal, entity, businessConf, availableSlots, businessId, supabase)

        // ── Ett kort, inte fem (spår 1, 2026-09-18) ──────────────────────
        // Klassningen ÄR decision.intent — inget andra modellanrop. Kortet
        // skapas FÖRE exekveraren så den vet vilka action-typer som redan
        // är täckta och kan hoppa över dem; annars får hantverkaren två
        // kort för samma SMS, och Mattes autonoma create_lead hade dessutom
        // skickat det andra "tack för din förfrågan"-SMS:et.
        const { svarBlirJobb } = await import('@/lib/sms/svar-blir-jobb')
        const jobbResultat = await svarBlirJobb({
          decision, entity, signal, businessId, supabase,
          missatSamtal,
          smsConversationId: sparadRad?.id ?? null,
        })

        await executeMatteActions(
          decision, entity, signal, businessId, supabase, availableSlots,
          new Set(jobbResultat.hanteradeTyper),
        )

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
