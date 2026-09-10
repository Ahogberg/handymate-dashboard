import { reconcileQuoteFollowupRound, readQuoteFollowupRound } from '@/lib/quotes/followup-round'
import { hasDurableFollowup } from '@/lib/followup/service'
import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { isAutonomous, getAutonomyCap, underAutonomyCap, recordAutonomyFailure } from '@/lib/autonomy/earned-autonomy'
import { sendSmsViaElks } from '@/lib/sms-send'
import { getBusinessPlanFromConfig } from '@/lib/auth'
import { checkSmsAllowance } from '@/lib/sms-usage'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { quoteFollowupStep } from '@/lib/quotes/followup-cadence'
import { filterOutConflicting, UNOPENED_CONFLICT_WINDOW_HOURS } from '@/lib/agents/daniel/unopened-quotes'
import { arTestId, arTestNamn } from '@/lib/testdata'
import { registerMandateDeliveryFailure } from '@/lib/mandates/mission-mandate'
import { loadMandateResolutionCache, resolveMandateForAction, MANDATE_TRUTH_CLASS, type MandateResolutionCache } from '@/lib/mandates/resolve'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/quote-follow-up - Automatisk uppföljning av offerter via AI agent.
 *
 * Flöde:
 * 1. Markera utgångna offerter som 'expired'
 * 2. Hämta alla skickade offerter som fortfarande är giltiga
 * 3. Bestäm vilka som behöver uppföljning baserat på automation_settings
 * 4. Logga i v3_automation_logs
 * 5. Trigga AI-agent per företag för SMS/email-komposition
 */
export async function GET(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    let followUpsSent = 0
    let followUpsPrepared = 0
    let followUpsHeld = 0
    let followUpsFailed = 0

    // 1. Mark expired quotes
    const { data: expiredQuotes } = await supabase
      .from('quotes')
      .update({ status: 'expired' })
      .in('status', [...OPEN_QUOTE_STATUSES]) // 'opened' missades förut → öppnade-men-obesvarade offerter blev aldrig expired
      .lt('valid_until', today)
      .select('quote_id')

    const expiredCount = expiredQuotes?.length || 0

    // 1b. Skicka förfallo-nudge: SMS 3 dagar innan offert går ut
    // Respekterar auto_enabled toggle — skickar INTE om företaget har stängt av auto-SMS
    let expiryNudgesSent = 0
    try {
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data: expiringQuotes } = await supabase
        .from('quotes')
        .select(`
          quote_id, business_id, customer_id, title, total, customer_pays, valid_until,
          customer:customer_id (name, phone_number)
        `)
        .in('status', [...OPEN_QUOTE_STATUSES])
        .eq('valid_until', threeDaysFromNow)  // Exakt 3 dagar kvar

      // Samla unika business_ids för att kolla toggles en gång per företag
      const nudgeBizIds = Array.from(new Set((expiringQuotes || []).map((q: any) => q.business_id as string)))
      const nudgeEnabledMap = new Map<string, boolean>()
      // V3-dedup: företag med aktiv V3 threshold-regel för offerter → motorn äger
      // uppföljningen, cron rör dem inte (oförändrat prejudikat från huvudloopen).
      const nudgeV3Handles = new Set<string>()
      // Förtjänad autonomi per företag (för icke-V3-vägen).
      const nudgeAutonomousMap = new Map<string, boolean>()
      // Beloppsgräns per företag (bara relevant om autonomt) — kollas per
      // offert nedan, cap:et självt är samma oavsett belopp.
      const nudgeCapMap = new Map<string, number | null>()
      // Etapp W (Mission Mandates V1): en mandat-cache per företag, laddad EN
      // gång här (inte per offert nedan) — se lib/mandates/resolve.ts filhuvud.
      const nudgeMandateCacheMap = new Map<string, MandateResolutionCache>()

      if (nudgeBizIds.length > 0) {
        const { data: v3NudgeRules } = await supabase
          .from('v3_automation_rules')
          .select('business_id')
          .eq('trigger_type', 'threshold')
          .eq('is_active', true)
          .in('business_id', nudgeBizIds)
          .contains('trigger_config', { entity: 'quote' })
        for (const r of v3NudgeRules || []) nudgeV3Handles.add(r.business_id)
      }

      for (const bizId of nudgeBizIds) {
        let enabled = true
        // Kolla automation_settings (centraliserad toggle)
        try {
          const { data: autoSettings } = await supabase
            .from('automation_settings')
            .select('sms_auto_enabled, sms_quote_followup')
            .eq('business_id', bizId)
            .single()
          if (autoSettings) {
            enabled = autoSettings.sms_auto_enabled !== false && autoSettings.sms_quote_followup !== false
          }
        } catch (err) {
          // Icke-blockerande — tabellen kanske inte finns, då antar vi enabled=true.
          console.warn('[quote-follow-up] automation_settings lookup failed (non-blocking):', bizId, err)
        }

        // (Den gamla fallbacken mot communication_settings är borttagen
        // 2026-09-05 — tabellen har aldrig funnits; automation_settings ovan
        // är enda sanningen och saknad rad betyder PÅ, precis som förut.)
        nudgeEnabledMap.set(bizId, enabled)

        // Autonomi bara relevant för icke-V3-företag (V3 hoppas ändå).
        if (!nudgeV3Handles.has(bizId)) {
          let autonomous = false
          try {
            autonomous = await isAutonomous(supabase, bizId, 'quote_followup_sms')
          } catch (err) {
            console.warn('[quote-follow-up] isAutonomous check failed, defaulting to false (non-blocking):', bizId, err)
            autonomous = false
          }
          nudgeAutonomousMap.set(bizId, autonomous)
          if (autonomous) {
            try {
              nudgeCapMap.set(bizId, await getAutonomyCap(supabase, bizId, 'quote_followup_sms'))
            } catch {
              nudgeCapMap.set(bizId, null)
            }
          }
          // Mandat-cachen laddas oavsett förtjänad autonomi — ett mandat kan
          // täcka en offert även för ett företag som inte förtjänat streak-
          // autonomi ännu (uppdrags-scopat samtycke, inte streak-baserat).
          nudgeMandateCacheMap.set(bizId, await loadMandateResolutionCache(supabase, bizId))
        }
      }

      for (const q of expiringQuotes || []) {
        if (await hasDurableFollowup(supabase, q.business_id, q.quote_id)) continue;
        const customer = q.customer as any
        if (!customer?.phone_number) continue

        // Testdata-vakt (2026-08-10): e2e-offerter nudgas aldrig (lib/testdata.ts).
        if (arTestId(q.quote_id) || arTestNamn(customer?.name) || arTestNamn(q.title)) continue

        // Respektera toggle
        if (!nudgeEnabledMap.get(q.business_id)) continue

        // V3-dedup: motorn äger detta företags offertuppföljning → cron rör inte.
        if (nudgeV3Handles.has(q.business_id)) continue

        // Hämta företagsnamn + svarsnummer + plan (plan behövs för
        // SMS-kvot-kollen på den autonoma sändvägen längre ner, VP1 gap 8).
        const { data: biz } = await supabase
          .from('business_config')
          .select('business_name, display_name, assigned_phone_number, subscription_plan')
          .eq('business_id', q.business_id)
          .single()

        const businessName = biz?.display_name || biz?.business_name || ''
        const amountRaw = q.customer_pays || q.total || 0
        const amount = amountRaw.toLocaleString('sv-SE')
        const firstName = (customer.name || '').split(' ')[0]
        const suffix = buildSmsSuffix(businessName, biz?.assigned_phone_number)
        // R2: q.title är hantverkarens interna arbetsnamn — refereras
        // aldrig i kundtext.
        const message = `Hej${firstName ? ' ' + firstName : ''}! Din offert på ${amount} kr går ut om 3 dagar. Hör av dig om du har frågor eller vill gå vidare!\n${suffix}`

        // Etapp W (Mission Mandates V1): mandatkontrollen körs FÖRE förtjänad
        // autonomi — ett mandat är uppdrags-scopat uttryckligt samtycke, mer
        // specifikt än global streak-baserad autonomi.
        const mandateCache = nudgeMandateCacheMap.get(q.business_id)
          ?? { mandates: [], missionStepsById: new Map(), usageByMandateId: new Map() }
        const mandateResolution = await resolveMandateForAction(supabase, q.business_id, mandateCache, {
          actionKey: 'quote_followup_sms', targetRef: q.quote_id, amountKr: amountRaw, nowIso: now.toISOString(),
        })

        // Beloppsgräns: ett belopp över gränsen tar godkännande-vägen även om
        // företaget annars fått autonomi — hög risk trumpar streak.
        const bizAutonomous = nudgeAutonomousMap.get(q.business_id) === true
        const capExceeded = bizAutonomous && !underAutonomyCap(nudgeCapMap.get(q.business_id) ?? null, amountRaw)
        // Ett mandat vinner oavsett cap/streak (mandateCovers har redan
        // validerat beloppet mot mandatets EGNA tak) — när inget mandat
        // täcker reducerar uttrycket till exakt den gamla
        // `bizAutonomous && !capExceeded`.
        const treatAsAutonomous = mandateResolution.covered || (bizAutonomous && !capExceeded)

        // ── Grind: icke-V3-företag gatas genom förtjänad autonomi ──
        if (!treatAsAutonomous) {
          // Ej autonom → skapa godkännande (dedup mot öppet pending för offerten).
          // send_sms-casen i executeApprovalPayload skickar via sendSmsViaElks.
          const { count: existing } = await supabase
            .from('pending_approvals')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', q.business_id)
            .eq('approval_type', 'send_sms')
            .eq('status', 'pending')
            .contains('payload', { related_id: q.quote_id })

          if ((existing ?? 0) > 0) continue

          const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          const { error: apprErr } = await supabase.from('pending_approvals').insert({
            id: approvalId,
            business_id: q.business_id,
            approval_type: 'send_sms',
            title: `Följ upp offert innan den går ut`,
            description: `Offerten "${q.title || ''}" på ${amount} kr går ut om 3 dagar. Godkänn för att skicka en påminnelse till kunden.${capExceeded ? ` Daniel sköter vanligtvis dessa själv, men beloppet avviker (${amount} kr).` : ''}`,
            // to/message/related_id → send_sms-casen; autonomy_key → streak-räkning.
            // amount_kr → cardContext/approveLabel + beloppsgränskontrollen ovan.
            // agent_id (Hanna v2 spel 4, bärande princip #6): offertjakten är
            // Daniels domän — utan detta föll kortet igenom till Lisa i
            // agentForApproval (send_sms matchar "sms" innan "quote").
            payload: {
              to: customer.phone_number,
              message,
              customer_id: q.customer_id,
              related_id: q.quote_id,
              autonomy_key: 'quote_followup_sms',
              agent_id: 'daniel',
              amount_kr: amountRaw,
              // Owner Absence V1 (Etapp Å) — se motsvarande kommentar i
              // app/api/cron/send-reminders/route.ts: taggar ENDAST kort
              // som stoppades av beloppstaket, inte "aldrig förtjänat
              // autonomi". Feeder lib/absence/escalation.ts
              // autonomy_cap_refusal-klassen.
              ...(capExceeded ? { cap_exceeded: true } : {}),
            },
            status: 'pending',
            risk_level: 'medium',
            expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          })
          if (apprErr) {
            console.error('[quote-follow-up] nudge approval insert failed:', q.quote_id, apprErr)
          } else {
            // Touchpoint 3 (onboarding-följeskrift): första-händelse-SMS till ägaren.
            const { sendFirstEventSms } = await import('@/lib/onboarding/first-event-sms')
            await sendFirstEventSms(q.business_id, 'quote_followup', customer.name || '')
          }
          continue
        }

        // Autonom → skicka SMS direkt (inte via agent — detta är tidskänsligt)
        //
        // VP1/VP2-förberedelse (gap 8, tasks/vilande-pengar-masterplan.md):
        // bytt HELA den tidigare inline-46elks-fetchen mot sendSmsViaElks —
        // samma meddelande/logg som förut (message_type 'quote_expiry_nudge',
        // related_id=quote_id) men nu med opt-out-kollen (gap 7) och
        // SMS-kvoten/hardCap (gap 8) som denna sändväg tidigare gick förbi
        // helt. Kvoten kollas explicit FÖRST så ett kvot-fullt läge loggas
        // tydligt istället för att bara tyst hoppas över.
        try {
          const plan = getBusinessPlanFromConfig(biz || {})
          const quota = await checkSmsAllowance(q.business_id, plan)
          if (!quota.allowed) {
            console.warn('[quote-follow-up] expiry-nudge skippad — SMS-kvoten nådd:', q.business_id, q.quote_id, quota.error)
          } else {
            const smsResult = await sendSmsViaElks({
              supabase,
              businessId: q.business_id,
              businessName,
              to: customer.phone_number,
              message,
              customerId: q.customer_id,
              relatedId: q.quote_id,
              messageType: 'quote_expiry_nudge',
              recipient: 'customer',
              purpose: 'proactive',
            })
            if (smsResult.success) {
              // Etapp K (SMS-kvoten i strypunkten, 2026-08-17): sendSmsViaElks
              // räknar nu upp kvoten själv efter en lyckad sändning. Förhands-
              // kollen ovan (checkSmsAllowance) är kvar — den skyddar
              // recordAutonomyFailure nedan från att straffa autonomin för
              // ett kvot-fullt läge som inte har med sändningskvaliteten att
              // göra (skip:ar hela else-grenen i stället för att logga fail).
              expiryNudgesSent++
            } else {
              console.error('[quote-follow-up] expiry-nudge SMS send failed (non-blocking):', q.business_id, q.quote_id, smsResult.error)
              if (mandateResolution.covered) {
                // Mandat-driven leverans misslyckades — registreras mot
                // mandatets EGNA auto-paus-tröskel, aldrig mot earned-
                // autonomy-streaken.
                await registerMandateDeliveryFailure(supabase, { mandateId: mandateResolution.mandate.id, businessId: q.business_id })
              } else {
                // Autonomt utskick nådde ingen kund — räknas mot nedgraderings-
                // tröskeln (2 fel/14 dagar). Fail-safe internt, kastar aldrig.
                await recordAutonomyFailure(supabase, q.business_id, 'quote_followup_sms')
              }
            }

            // Etapp W: mandat-täckta sändningar stämplas med ett eget
            // auto_approved-kort — mandatets mätinstrument (mandate-facit.ts)
            // härleder användning ur payload.mandate_id-stämplade kort. Den
            // förtjänade-autonomi-vägen skrev aldrig ett kort här, oförändrat.
            if (mandateResolution.covered) {
              const mandate = mandateResolution.mandate
              const cardId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
              const { error: cardErr } = await supabase.from('pending_approvals').insert({
                id: cardId,
                business_id: q.business_id,
                approval_type: 'send_sms',
                title: 'Följ upp offert innan den går ut',
                description: `Offerten "${q.title || ''}" på ${amount} kr — skickad automatiskt inom mandatet.`,
                payload: {
                  to: customer.phone_number,
                  message,
                  customer_id: q.customer_id,
                  related_id: q.quote_id,
                  autonomy_key: 'quote_followup_sms',
                  agent_id: 'daniel',
                  amount_kr: amountRaw,
                  mandate_id: mandate.id,
                  mission_id: mandate.mission_id,
                  truth_class: MANDATE_TRUTH_CLASS.quote_followup_sms,
                  execution_result: {
                    outcome: smsResult.success ? 'success' : 'failed',
                    error_text: smsResult.success ? null : (smsResult.error || null),
                  },
                },
                status: 'auto_approved',
                risk_level: 'medium',
                expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              })
              if (cardErr) console.error('[quote-follow-up] mandat-kort insert failed:', q.quote_id, cardErr)
            }

            // VP2 (gap 4): nudge-vägen loggade tidigare INGENTING till
            // v3_automation_logs — nu utfall EFTER sändningen, ärlig status.
            const { error: nudgeLogErr } = await supabase.from('v3_automation_logs').insert({
              business_id: q.business_id,
              rule_id: null,
              // Hanna v2 spel 4 (bärande princip #6): Daniel äger offertjakten.
              agent_id: 'daniel',
              rule_name: 'Offert-förfallonudge (cron)',
              trigger_type: 'cron',
              action_type: 'send_sms',
              status: smsResult.success ? 'success' : 'failed',
              error_message: smsResult.success ? null : (smsResult.error || 'SMS-sändning misslyckades'),
              context: {
                quote_id: q.quote_id,
                customer_id: q.customer_id,
                channel: 'sms',
                nudge: 'expiry',
              },
            })
            if (nudgeLogErr) {
              console.warn('[quote-follow-up] nudge v3-logg insert failed (non-blocking):', nudgeLogErr.message)
            }
          }
        } catch (err) {
          console.error('[quote-follow-up] expiry-nudge SMS send failed (non-blocking):', q.business_id, q.quote_id, err)
        }
      }
    } catch (nudgeErr) {
      console.error('Quote expiry nudge error (non-blocking):', nudgeErr)
    }

    // 2. Find sent quotes needing follow-up
    const { data: sentQuotes, error } = await supabase
      .from('quotes')
      .select(`
        quote_id, business_id, customer_id, title, total, customer_pays,
        sent_at, valid_until, follow_up_count, last_follow_up_at,
        customer:customer_id (name, phone_number, email)
      `)
      // VP2 (gap 4): 'opened' ingick inte — en kund som ÖPPNAT sin offert men
      // inte svarat är en varmare kandidat än en som aldrig öppnat, ändå
      // följdes den aldrig upp. Nudge- och expired-delarna hade redan båda.
      .in('status', [...OPEN_QUOTE_STATUSES])
      .gte('valid_until', today)

    if (error) throw error

    // 3. Load automation settings per business (for quote_followup_days)
    //    + kolla om V3 threshold-regler redan hanterar offertuppföljning (dedup)
    const businessIds = Array.from(new Set((sentQuotes || []).map((q: any) => q.business_id as string)))
    const settingsMap = new Map<string, number>()
    const v3HandlesQuoteFollowup = new Set<string>()

    if (businessIds.length > 0) {
      const { data: settingsRows } = await supabase
        .from('v3_automation_settings')
        .select('business_id, quote_followup_days')
        .in('business_id', businessIds)

      for (const s of settingsRows || []) {
        settingsMap.set(s.business_id, s.quote_followup_days || 5)
      }

      // Kolla vilka företag som har aktiva V3 threshold-regler för offerter
      // Om ja → V3 evaluate-thresholds hanterar redan uppföljning, skippa cron-sändning
      const { data: v3QuoteRules } = await supabase
        .from('v3_automation_rules')
        .select('business_id')
        .eq('trigger_type', 'threshold')
        .eq('is_active', true)
        .in('business_id', businessIds)
        .contains('trigger_config', { entity: 'quote' })

      for (const r of v3QuoteRules || []) {
        v3HandlesQuoteFollowup.add(r.business_id)
      }
    }

    // 3.5 Konflikt-avoidance (2026-08-27): en offert som redan fått ett
    // send_sms-kort de senaste 168 h — oavsett status — följs inte upp igen
    // av agenten. Onboardingens första verifierade handling (POST /api/
    // onboarding/first-action) skapar Daniels kort dag 0; utan detta hade
    // morgoncronen köat ett andra SMS för samma offert dagen efter.
    // Samma fönster och samma rena filter som Daniels aggregat använder.
    const konflikter = new Set<string>()
    {
      const bizIds = Array.from(new Set((sentQuotes || []).map((q: any) => q.business_id as string)))
      if (bizIds.length > 0) {
        const konfliktSedan = new Date(now.getTime() - UNOPENED_CONFLICT_WINDOW_HOURS * 3600_000).toISOString()
        const { data: konfliktRader, error: konfliktErr } = await supabase
          .from('pending_approvals')
          .select('payload')
          .eq('approval_type', 'send_sms')
          .in('business_id', bizIds)
          .gte('created_at', konfliktSedan)
        if (konfliktErr) throw new Error('Uppföljningens befintliga förslag kunde inte kontrolleras.')
        for (const r of konfliktRader || []) {
          const rid = (r.payload as { related_id?: unknown } | null)?.related_id
          if (typeof rid === 'string') konflikter.add(rid)
        }
      }
    }

    // 4. Group candidates by business
    const byBusiness = new Map<string, Array<{ quote: any; daysSinceSent: number; channel: string; quote_id: string }>>()

    for (const quote of sentQuotes || []) {
      if (await hasDurableFollowup(supabase, quote.business_id, quote.quote_id)) continue;
      const customer = quote.customer as any
      if (!customer) continue

      // Testdata-vakt (2026-08-10): e2e-offerter följs aldrig upp (lib/testdata.ts).
      if (arTestId(quote.quote_id) || arTestNamn(customer?.name) || arTestNamn(quote.title)) continue

      // Dedup: om V3 threshold-regler hanterar detta företag, skippa cron-uppföljning
      if (v3HandlesQuoteFollowup.has(quote.business_id)) continue

      // Use sent_at (not created_at) for accurate timing
      const sentDate = quote.sent_at
      if (!sentDate) continue

      const daysSinceSent = Math.floor((now.getTime() - new Date(sentDate).getTime()) / (1000 * 60 * 60 * 24))
      const followUpCount = quote.follow_up_count || 0

      // Read follow-up interval from settings, default 5 days
      const followupDays = settingsMap.get(quote.business_id) || 5

      // Determine channel based on follow-up count and days elapsed
      // Round 1: SMS efter followupDays dagar
      // Round 2: Email efter followupDays*2 dagar
      // Round 3: SMS efter followupDays*3 dagar (sista)
      const nextStep = quoteFollowupStep(sentDate, followUpCount, followupDays, now.getTime())
      if (!nextStep?.due) continue
      const channel = nextStep.channel

      const reconciliation = await reconcileQuoteFollowupRound(supabase, quote.business_id, {
        quote_id: quote.quote_id, sent_at: quote.sent_at, round: nextStep.round, channel,
      })
      if (reconciliation.state !== 'missing') {
        if (reconciliation.state === 'reconciled' && reconciliation.advanced) followUpsSent++
        else followUpsHeld++
        continue
      }

      // Collect only rounds without an existing durable approval.
      const list = byBusiness.get(quote.business_id) || []
      list.push({ quote, daysSinceSent, channel, quote_id: quote.quote_id })
      byBusiness.set(quote.business_id, list)
    }

    // One quote/round per run. Only a persisted provider receipt advances it.
    // A pending/rejected/failed/unknown card holds its round and is never recreated.
    let agentTriggered = 0
    for (const [businessId, allItems] of Array.from(byBusiness)) {
      const items = filterOutConflicting(allItems, konflikter)
      for (const item of items) {
        const q = item.quote
        const scope = { quote_id: q.quote_id, sent_at: q.sent_at,
          round: (q.follow_up_count || 0) + 1, channel: item.channel as 'sms' | 'email' }
        const c = q.customer as any
        const result = await triggerAgentInternal(businessId, 'cron', {
          cron_type: 'quote_followup', quote_followup_round: scope,
          instruction: `Förbered ett uppföljningsförslag för offert ${q.quote_id} till ${c?.name || 'kunden'}. Använd ${item.channel}. Telefon: ${c?.phone_number || 'saknas'}, email: ${c?.email || 'saknas'}. Fråga vänligt om kunden har funderingar. Förslaget kräver godkännande; påstå inte att något skickats.`,
        }, makeIdempotencyKey('qfu', businessId, q.quote_id, q.sent_at, String(scope.round), today))
        if (result.success) agentTriggered++
        // Even a lost run response may have left a durable approval. Read it.
        const card = await readQuoteFollowupRound(supabase, businessId, scope)
        if (card) followUpsPrepared++
        else followUpsFailed++
        const { error: logErr } = await supabase.from('v3_automation_logs').insert({
          business_id: businessId, rule_id: null, agent_id: 'daniel',
          rule_name: 'Offertuppföljning (cron)', trigger_type: 'cron',
          action_type: 'prepare_quote_followup',
          status: card ? 'success' : 'failed',
          error_message: card ? null : (result.error || 'Agentkörningen gav inget sparat uppföljningsförslag.'),
          context: { quote_id: q.quote_id, customer_id: q.customer_id,
            follow_up_round: scope.round, channel: item.channel, approval_id: card?.id || null,
            run_id: result.run_id || null, outcome: card ? 'awaiting_approval_result' : 'not_prepared' },
        })
        if (logErr) throw new Error('Uppföljningens resultatlogg kunde inte sparas.')
      }
    }

    return NextResponse.json({
      success: followUpsFailed === 0,
      follow_ups_prepared: followUpsPrepared,
      follow_ups_held: followUpsHeld,
      follow_ups_failed: followUpsFailed,
      follow_ups_sent: followUpsSent,
      expired_count: expiredCount,
      expiry_nudges_sent: expiryNudgesSent,
      agent_triggered: agentTriggered,
    }, { status: followUpsFailed ? 503 : 200 })
  } catch (error: any) {
    console.error('Quote follow-up cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
