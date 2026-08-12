import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { isAutonomous, getAutonomyCap, underAutonomyCap, recordAutonomyFailure } from '@/lib/autonomy/earned-autonomy'
import { sendSmsViaElks } from '@/lib/sms-send'
import { getBusinessPlanFromConfig } from '@/lib/auth'
import { checkSmsAllowance, trackSmsSent } from '@/lib/sms-usage'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { arTestId, arTestNamn } from '@/lib/testdata'

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

        // Fallback: kolla communication_settings
        if (enabled) {
          try {
            const { data: commSettings } = await supabase
              .from('communication_settings')
              .select('auto_enabled')
              .eq('business_id', bizId)
              .single()
            if (commSettings && commSettings.auto_enabled === false) enabled = false
          } catch (err) {
            console.warn('[quote-follow-up] communication_settings lookup failed (non-blocking):', bizId, err)
          }
        }

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
        }
      }

      for (const q of expiringQuotes || []) {
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

        // Beloppsgräns: ett belopp över gränsen tar godkännande-vägen även om
        // företaget annars fått autonomi — hög risk trumpar streak.
        const bizAutonomous = nudgeAutonomousMap.get(q.business_id) === true
        const capExceeded = bizAutonomous && !underAutonomyCap(nudgeCapMap.get(q.business_id) ?? null, amountRaw)
        const treatAsAutonomous = bizAutonomous && !capExceeded

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
            })
            if (smsResult.success) {
              expiryNudgesSent++
              try {
                await trackSmsSent(q.business_id, plan)
              } catch (trackErr) {
                console.error('[quote-follow-up] trackSmsSent misslyckades (icke-blockerande):', trackErr)
              }
            } else {
              console.error('[quote-follow-up] expiry-nudge SMS send failed (non-blocking):', q.business_id, q.quote_id, smsResult.error)
              // Autonomt utskick nådde ingen kund — räknas mot nedgraderings-
              // tröskeln (2 fel/14 dagar). Fail-safe internt, kastar aldrig.
              await recordAutonomyFailure(supabase, q.business_id, 'quote_followup_sms')
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

    // 4. Group candidates by business
    const byBusiness = new Map<string, Array<{ quote: any; daysSinceSent: number; channel: string }>>()

    for (const quote of sentQuotes || []) {
      const customer = quote.customer as any
      if (!customer) continue

      // Testdata-vakt (2026-08-10): e2e-offerter följs aldrig upp (lib/testdata.ts).
      if (arTestId(quote.quote_id) || arTestNamn(customer?.name) || arTestNamn(quote.title)) continue

      // Dedup: om V3 threshold-regler hanterar detta företag, skippa cron-uppföljning
      if (v3HandlesQuoteFollowup.has(quote.business_id)) continue

      // Use sent_at (not created_at) for accurate timing
      const sentDate = quote.sent_at || quote.valid_until
      if (!sentDate) continue

      const daysSinceSent = Math.floor((now.getTime() - new Date(sentDate).getTime()) / (1000 * 60 * 60 * 24))
      const followUpCount = quote.follow_up_count || 0

      // Read follow-up interval from settings, default 5 days
      const followupDays = settingsMap.get(quote.business_id) || 5

      // Determine channel based on follow-up count and days elapsed
      // Round 1: SMS efter followupDays dagar
      // Round 2: Email efter followupDays*2 dagar
      // Round 3: SMS efter followupDays*3 dagar (sista)
      let channel = ''
      if (daysSinceSent >= followupDays && followUpCount === 0) channel = 'sms'
      else if (daysSinceSent >= followupDays * 2 && followUpCount === 1) channel = 'email'
      else if (daysSinceSent >= followupDays * 3 && followUpCount === 2) channel = 'sms'
      else continue

      // VP2 (gap 4): kandidatloopen SAMLAR bara — follow_up_count-uppräkning
      // och v3-loggen flyttade till steg 5, EFTER agent-triggern, så loggat
      // status speglar faktiskt utfall. Tidigare loggades 'success' (och
      // räknaren steg) innan något skickats — och inserten saknade dessutom
      // trigger_type (NOT NULL) så den har i praktiken tyst failat hela tiden.
      const list = byBusiness.get(quote.business_id) || []
      list.push({ quote, daysSinceSent, channel })
      byBusiness.set(quote.business_id, list)
    }

    // 5. Trigger agent per business, logga utfall EFTER köningen
    let agentTriggered = 0
    for (const [businessId, items] of Array.from(byBusiness)) {
      const quoteList = items.map((item: any) => {
        const c = item.quote.customer as any
        const daysLeft = Math.floor((new Date(item.quote.valid_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return `- Offert "${item.quote.title || item.quote.quote_id}" till ${c?.name || 'Okänd'}: ${(item.quote.customer_pays || item.quote.total || 0).toLocaleString('sv-SE')} kr, skickad för ${item.daysSinceSent} dagar sedan, giltig ${daysLeft} dagar till. Kontakt: telefon ${c?.phone_number || 'saknas'}, email ${c?.email || 'saknas'}. Kanal: ${item.channel}`
      }).join('\n')

      const result = await triggerAgentInternal(
        businessId,
        'cron',
        {
          cron_type: 'quote_followup',
          instruction: `Följ upp dessa offerter. Använd angiven kanal (SMS eller email). Var personlig och fråga om kunden har funderingar:\n\n${quoteList}`,
        },
        makeIdempotencyKey('qfu', businessId, today)
      )
      if (result.success) agentTriggered++

      // Utfall per kandidat: räknare + logg EFTER köningen, med ärlig status.
      // follow_up_count stegas BARA vid lyckad köning — vid fail får nästa
      // cron-körning ett nytt försök istället för att ronden "förbrukas".
      for (const item of items) {
        const followUpCount = item.quote.follow_up_count || 0
        if (result.success) {
          await supabase.from('quotes').update({
            follow_up_count: followUpCount + 1,
            last_follow_up_at: now.toISOString(),
          }).eq('quote_id', item.quote.quote_id)
          followUpsSent++
        }

        const { error: logErr } = await supabase.from('v3_automation_logs').insert({
          business_id: businessId,
          rule_id: null,
          // Hanna v2 spel 4 (bärande princip #6): denna runda routas redan till
          // Daniel-personan via routeToAgent('cron', 'quote_followup') (prefix
          // 'quote_' → daniel) — stämplar loggraden explicit så scoreboard och
          // veckodigest kan räkna den utan att räkna om routingen.
          agent_id: 'daniel',
          rule_name: 'Offertuppföljning (cron)',
          trigger_type: 'cron',
          action_type: `send_${item.channel}`,
          status: result.success ? 'success' : 'failed',
          error_message: result.success ? null : 'Agent-köning misslyckades',
          context: {
            quote_id: item.quote.quote_id,
            customer_id: item.quote.customer_id,
            days_since_sent: item.daysSinceSent,
            follow_up_round: followUpCount + 1,
            channel: item.channel,
          },
        })
        if (logErr) {
          console.warn('[quote-follow-up] v3_automation_logs insert failed (non-blocking):', logErr.message)
        }
      }
    }

    return NextResponse.json({
      success: true,
      follow_ups_sent: followUpsSent,
      expired_count: expiredCount,
      expiry_nudges_sent: expiryNudgesSent,
      agent_triggered: agentTriggered,
    })
  } catch (error: any) {
    console.error('Quote follow-up cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
