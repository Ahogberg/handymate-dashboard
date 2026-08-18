import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentFireAndForget, makeIdempotencyKey } from '@/lib/agent-trigger'
import { createHash } from 'crypto'
import { verifyElksSignature } from '@/lib/elks-signature'
import { sendSmsViaElks, parseOptOutCommand } from '@/lib/sms-send'
import { resolveSmsCustomer } from '@/lib/outbound/sms-gate'
import { isMissingColumnError } from '@/lib/agents/memory'
import { createLeadAndDeal } from '@/lib/leads/golden-path'

/**
 * Incoming SMS webhook from 46elks.
 *
 * Flow: 46elks POST → store message → dispatch AI agent(s) → return 200 OK
 * Agent(s) handle the response via the send_sms tool (no standalone Claude
 * reply here).
 *
 * Etapp 1 ("en väg in", 2026-08-18): en firma körs genom EN av två vägar,
 * växlat via business_config.inbound_single_brain:
 *
 *   - AV (default/legacy): Matte kör i skuggläge (dryRun — muterar
 *     ingenting, bara loggar vad han hade gjort) parallellt med att Lisa
 *     dispatchas via triggerAgentFireAndForget. Lisa är den enda som
 *     faktiskt svarar kunden.
 *   - PÅ (pilot): ingen Matte alls. Deterministisk kontext (kund/lead-
 *     uppslag, lediga tider, lead-skapande för okända avsändare) förbereds
 *     i den här routen och skickas med i EN dispatch till Lisa.
 *
 * Dedup: idempotency_key på agent_runs är en LÅS-insert (claim-before-run,
 * se app/api/agent/trigger/route.ts), inte bara en kvittens efteråt — en
 * webhook-retry kan alltså aldrig trigga en andra kundkontakt.
 */

// Never cache this route
export const dynamic = 'force-dynamic'

interface BusinessRow {
  business_id: string
  business_name: string
  inbound_single_brain: boolean
}

/**
 * Slår upp företaget på en kolumn (assigned_phone_number ELLER business_id)
 * och läser samtidigt pilotflaggan inbound_single_brain. Fail-soft: har
 * sql/v153 inte körts än (kolumnen saknas) görs samma uppslag om utan
 * flaggan — AV är alltid ett säkert default (legacy-beteendet, oförändrat).
 */
async function lookupBusiness(
  supabase: ReturnType<typeof getServerSupabase>,
  column: 'assigned_phone_number' | 'business_id',
  value: string
): Promise<BusinessRow | null> {
  const { data, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, inbound_single_brain')
    .eq(column, value)
    .maybeSingle()

  if (error && isMissingColumnError(error)) {
    const { data: fallback } = await supabase
      .from('business_config')
      .select('business_id, business_name')
      .eq(column, value)
      .maybeSingle()
    return fallback ? { ...fallback, inbound_single_brain: false } : null
  }

  if (!data) return null
  return { ...data, inbound_single_brain: data.inbound_single_brain === true }
}

/** YYYY-MM-DD i Stockholm-tid — en garanterat ISO-sorterbar datumstämpel utan att lita på lokalens formatordning. */
function stockholmDateStamp(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(d)
}

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
    // 46elks-meddelandets eget id (formfält "id") — stabilt över webhook-
    // retries, till skillnad från en tidsbucketad hash. Saknas det (äldre
    // avsändare/testtrafik) faller vi tillbaka på en dygnsstabil hash nedan.
    const elksMessageId = params.get('id') || null

    console.log('[SMS Incoming]', { from, to, message: message.substring(0, 50) })

    if (!from || !message) {
      return new NextResponse('Missing data', { status: 400 })
    }

    // Find business by assigned phone number
    let business: BusinessRow | null = await lookupBusiness(supabase, 'assigned_phone_number', to)

    if (!business) {
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

      business = await lookupBusiness(supabase, 'business_id', företag[0])
      if (!business) {
        return NextResponse.json({ success: true, handled: false })
      }
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

    // Store inbound message in sms_conversation. provider_message_id (46elks
    // "id") ger dedup mot webhook-retries via en unik partiell index (v154) —
    // upsert med ignoreDuplicates gör en retry till en no-op istället för en
    // andra rad som förgiftar konversationshistoriken agenten läser nedan.
    // Saknas id (eller v154 ej körd) skrivs raden precis som förut.
    if (elksMessageId) {
      const { error: convError } = await supabase
        .from('sms_conversation')
        .upsert(
          {
            business_id: business.business_id,
            phone_number: from,
            role: 'user',
            content: message,
            created_at: new Date().toISOString(),
            provider_message_id: elksMessageId,
          },
          { onConflict: 'business_id,provider_message_id', ignoreDuplicates: true }
        )
      if (convError) {
        if (isMissingColumnError(convError)) {
          // sql/v154 ej körd ännu — provider_message_id-kolumnen saknas.
          // Samma toleransmönster som v86/sms_opt_out: spara utan dedup
          // istället för att fälla hela webhooken.
          await supabase.from('sms_conversation').insert({
            business_id: business.business_id,
            phone_number: from,
            role: 'user',
            content: message,
            created_at: new Date().toISOString(),
          })
        } else {
          console.error('[SMS Incoming] sms_conversation upsert failed:', convError.message)
        }
      }
    } else {
      await supabase
        .from('sms_conversation')
        .insert({
          business_id: business.business_id,
          phone_number: from,
          role: 'user',
          content: message,
          created_at: new Date().toISOString(),
        })
    }

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

    // ── Idempotensnyckel: bär elks-id, inte klockan ──
    //
    // Den gamla nyckeln bucketade på Math.floor(Date.now()/60000) — en
    // 46elks-retry som kom mer än en minut senare fick en NY nyckel, alltså
    // en NY agentkörning och ett andra SMS-svar till kunden. 46elks-
    // meddelandet har ett eget stabilt id (elksMessageId ovan); saknas det
    // faller vi tillbaka på en dygnsstabil (inte minutstabil) hash av
    // innehållet, så en retry samma dygn fortfarande dedupas.
    const stableIdempotencyKey = elksMessageId
      ? makeIdempotencyKey('sms', elksMessageId)
      : makeIdempotencyKey(
          'sms',
          `${stockholmDateStamp(new Date())}:${createHash('sha256')
            .update(`${from}:${to}:${message}`)
            .digest('hex')
            .substring(0, 16)}`
        )

    const businessId = business.business_id

    if (business.inbound_single_brain) {
      // ═══ EN VÄG IN — pilotläge (etapp 1) ═══════════════════════════
      //
      // Ingen Matte. Ingen routeToAgentWithContext (den körde en ANDRA,
      // olåst agentkörning ovanpå Lisas — indefensibelt i båda lägena).
      // Kontexten Matte tidigare byggde åt sig själv (vem skriver, lediga
      // tider) förbereds här deterministiskt och skickas med i EN dispatch,
      // så Lisa aldrig behöver GISSA rätt verktyg för att fånga en lead.
      const { resolveEntity } = await import('@/lib/matte/resolver')
      const { getAvailableSlots } = await import('@/lib/matte/calendar-slots')

      const [entity, availableSlots] = await Promise.all([
        resolveEntity(from, businessId),
        getAvailableSlots(businessId, 2).catch(() => [] as import('@/lib/matte/calendar-slots').TimeSlot[]),
      ])

      // Deterministisk lead-fångst för okända avsändare — körs INNAN
      // dispatchen så lead-skapandet aldrig beror på att modellen väljer
      // rätt verktyg (den gamla vägen hade INGET tool för detta: Lisa
      // saknar qualify_lead, se system-prompt.ts). STOPP/START har redan
      // returnerat ovan, så vi vet meddelandet är en riktig kundkontakt.
      let createdLeadId: string | null = null
      if (entity.type === 'unknown') {
        try {
          const { data: bizPhone } = await supabase
            .from('business_config')
            .select('phone_number')
            .eq('business_id', businessId)
            .single()

          const result = await createLeadAndDeal(
            {
              businessId,
              businessPhoneNumber: bizPhone?.phone_number ?? null,
              name: entity.customerName || 'Okänd kund',
              phone: from,
              email: entity.email ?? null,
              message,
              source: 'inbound_sms',
            },
            supabase
          )
          createdLeadId = result.leadId
        } catch (err) {
          console.error('[SMS Incoming] deterministisk lead-fångst (single brain) misslyckades (non-blocking):', businessId, from, err)
        }
      }

      triggerAgentFireAndForget(
        businessId,
        'incoming_sms',
        {
          phone_number: from,
          message,
          conversation_history: conversationHistory,
          entity_type: entity.type,
          customer_id: entity.customerId ?? null,
          lead_id: createdLeadId ?? entity.leadId ?? null,
          customer_name: entity.customerName ?? null,
          available_slots: availableSlots,
        },
        stableIdempotencyKey
      )
    } else {
      // ═══ LEGACY — Matte i skuggläge + Lisa dispatchas ══════════════
      //
      // Matte-intelligensen körs fortfarande (fire-and-forget) men ENDAST
      // i dryRun-läge: han muterar ingenting, bara loggar vad han hade gjort
      // (v3_automation_logs, rule_name 'matte_sms_shadow') så vi kan jämföra
      // hans beslut mot Lisas faktiska agent_runs under piloten.
      // routeToAgentWithContext och sendCustomerReply är borttagna helt —
      // den förra körde en andra, olåst agentkörning ovanpå Lisas, den
      // senare har aldrig fungerat (POST mot /api/sms/send utan auth →
      // 401, tyst svalt). Lisa svarar kunden, se dispatchen nedan.
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
          await executeMatteActions(decision, entity, signal, businessId, supabase, availableSlots, { dryRun: true })
        } catch (err) {
          console.error('[Matte SMS Intelligence] Error:', err)
        }
      })()

      // Trigger the AI agent — it will respond via send_sms tool
      triggerAgentFireAndForget(
        businessId,
        'incoming_sms',
        {
          phone_number: from,
          message,
          conversation_history: conversationHistory,
        },
        stableIdempotencyKey
      )
    }

    // Return 200 immediately — agent handles response asynchronously
    // 46elks expects plain-text "OK" (or any 200), not JSON
    return new NextResponse('OK')

  } catch (error: any) {
    console.error('[SMS Incoming] Error:', error)
    return new NextResponse('Internal error', { status: 500 })
  }
}
