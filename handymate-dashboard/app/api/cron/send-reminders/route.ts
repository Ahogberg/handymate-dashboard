import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { isAutonomous, getAutonomyCap, underAutonomyCap, recordAutonomyFailure } from '@/lib/autonomy/earned-autonomy'
import { deliverInvoiceReminder } from '@/lib/invoice-reminder-send'
import { loadReminderConfig, composeReminderStep, createInvoiceReminderCard, type ReminderConfig } from '@/lib/invoice-reminder-card'
import { svDateStr } from '@/lib/dates'
import { arTestId, arTestNamn } from '@/lib/testdata'
import { registerMandateDeliveryFailure } from '@/lib/mandates/mission-mandate'
import { loadMandateResolutionCache, resolveMandateForAction, MANDATE_TRUTH_CLASS, type MandateResolutionCache } from '@/lib/mandates/resolve'
import { internalPushHeaders } from '@/lib/notifications/push-internal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Automatisk påminnelsekedja för förfallna fakturor.
 * Läser alla inställningar från business_config:
 *   - auto_reminder_enabled: boolean
 *   - auto_reminder_days: dagar efter förfall för första påminnelse
 *   - reminder_fee: påminnelseavgift i SEK (default 60)
 *   - penalty_interest / late_fee_percent: dröjsmålsränta % (default 8)
 *   - max_auto_reminders: max antal (default 3)
 *   - reminder_sms_template: anpassad SMS-mall (valfri)
 */

// ── Cron handler ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return sendAutoReminders()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return sendAutoReminders()
}

async function sendAutoReminders() {
  try {
    const supabase = getServerSupabase()
    const today = new Date()
    // TD-3: "förfallet till och med idag" ska räknas i svensk lokaltid, inte
    // UTC-dagen. Cronen kör kl 10:00 UTC idag men gör datumgränsen korrekt
    // oavsett schema-tid framöver — se lib/dates.ts.
    const todayStr = svDateStr(today)

    // Hämta alla förfallna fakturor
    const { data: overdueInvoices, error } = await supabase
      .from('invoice')
      .select(`
        invoice_id, invoice_number, ocr_number, due_date, business_id, customer_id,
        total, customer_pays, rot_rut_type, reminder_count,
        last_reminder_at, next_reminder_at,
        customer:customer_id (name, phone_number, email)
      `)
      .in('status', ['sent', 'overdue'])
      .lt('due_date', todayStr)
      .or(`next_reminder_at.is.null,next_reminder_at.lte.${today.toISOString()}`)

    if (error) throw error
    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ success: true, reminders_sent: 0, message: 'Inga påminnelser att skicka' })
    }

    // Gruppera fakturor per business_id för att hämta config en gång per företag
    const businessIds = Array.from(new Set(overdueInvoices.map((inv: any) => inv.business_id)))
    const configMap: Record<string, ReminderConfig> = {}

    for (const bizId of businessIds) {
      configMap[bizId] = await loadReminderConfig(supabase, bizId)
    }

    // Dedup: kolla vilka företag som har aktiva V3 threshold-regler för fakturapåminnelser
    // Om ja → V3 evaluate-thresholds hanterar redan påminnelser, skippa cron-sändning
    const v3HandlesInvoiceReminders = new Set<string>()
    if (businessIds.length > 0) {
      const { data: v3InvoiceRules } = await supabase
        .from('v3_automation_rules')
        .select('business_id')
        .eq('trigger_type', 'threshold')
        .eq('is_active', true)
        .in('business_id', businessIds)
        .like('trigger_config', '%"entity":"invoice"%')

      for (const r of v3InvoiceRules || []) {
        v3HandlesInvoiceReminders.add(r.business_id)
      }
    }

    let remindersSent = 0
    let feesApplied = 0
    let approvalsCreated = 0
    const results: Array<{ invoice_id: string; invoice_number: string; level: string; success: boolean; fee_added?: number; interest_added?: number; approval_created?: boolean }> = []

    // Etapp W (Mission Mandates V1): en mandat-cache per företag, laddad
    // första gången det företaget förekommer i loopen nedan — INTE en
    // läsning per faktura (se lib/mandates/resolve.ts filhuvud).
    const mandateCacheByBusiness = new Map<string, MandateResolutionCache>()

    for (const inv of overdueInvoices as any[]) {
      const cfg = configMap[inv.business_id]
      if (!cfg) continue

      // Dedup: om V3 threshold-regler hanterar detta företag, skippa cron-påminnelse
      if (v3HandlesInvoiceReminders.has(inv.business_id)) continue

      // Respektera auto_reminder_enabled toggle
      if (!cfg.auto_reminder_enabled) continue

      const currentCount = inv.reminder_count || 0
      // Respektera max_auto_reminders
      if (currentCount >= cfg.max_auto_reminders) continue
      // Stegkompositionen (nivå, texter, ränta, leverans-input) är delad med
      // onboardingens första verifierade handling — lib/invoice-reminder-card.ts.
      // Cronens tidsvakt (auto_reminder_days × 1/2/4/8) bor kvar här.
      const customer = inv.customer as any
      const step = composeReminderStep({ inv, customer, cfg, today })
      if (!step.requiredDays || step.daysOverdue < step.requiredDays) continue
      const { daysOverdue, level, amountToPay, nextCount } = step
      // Testdata-vakt (2026-08-10): e2e-fakturor och testkunder får varken
      // påminnelser eller kort (lib/testdata.ts).
      if (arTestId(inv.invoice_id) || arTestNamn(customer?.name)) continue
      // Gemensam leverans-input (delas med approval-vägen via payload)
      const deliveryInput = step.deliveryInput

      // ── Etapp W (Mission Mandates V1): mandatkontrollen körs FÖRE
      // förtjänad autonomi — ett mandat är uppdrags-scopat uttryckligt
      // samtycke, mer specifikt än global streak-baserad autonomi. Träff ⇒
      // `autonomous` sätts direkt (SAMMA direktsändningsväg nedan, oförändrad
      // kod), och kortet nedan stämplas med mandate_id/mission_id.
      // Miss/orsak ⇒ mandateResolution.covered är false, och allt nedan
      // reducerar exakt till dagens beteende.
      if (!mandateCacheByBusiness.has(inv.business_id)) {
        mandateCacheByBusiness.set(inv.business_id, await loadMandateResolutionCache(supabase, inv.business_id))
      }
      const mandateResolution = await resolveMandateForAction(
        supabase, inv.business_id, mandateCacheByBusiness.get(inv.business_id)!,
        { actionKey: 'invoice_reminder', targetRef: inv.invoice_id, amountKr: amountToPay ?? null, nowIso: today.toISOString() },
      )

      // ── Grind: företag UTAN V3-regel gatas genom förtjänad autonomi ──
      // Autonom → skicka direkt (avgift/ränta muteras BARA vid faktisk leverans
      // inne i deliverInvoiceReminder). Ej autonom → skapa godkännande, ingen
      // utskick + INGEN avgiftsmutation förrän hantverkaren godkänner.
      let autonomous = mandateResolution.covered
      if (!autonomous) {
        try {
          autonomous = await isAutonomous(supabase, inv.business_id, 'invoice_reminder')
        } catch { autonomous = false }
      }

      // Beloppsgräns: ett belopp över gränsen tar godkännande-vägen även för
      // ett företag som annars fått autonomi — hög risk trumpar streak.
      // Gäller INTE mandatvägen: mandateCovers() har redan validerat beloppet
      // mot mandatets eget tak (eller default-taket som fallback) — att
      // applicera earned-autonomy-taket en gång till vore dubbelarbete som
      // kan felaktigt underkänna ett giltigt mandat-täckt utskick.
      let capExceeded = false
      if (autonomous && !mandateResolution.covered) {
        let cap: number | null = null
        try { cap = await getAutonomyCap(supabase, inv.business_id, 'invoice_reminder') } catch { cap = null }
        if (!underAutonomyCap(cap, amountToPay)) {
          capExceeded = true
          autonomous = false
        }
      }

      if (autonomous) {
        const delivery = await deliverInvoiceReminder(supabase, deliveryInput)
        if (!delivery.skipped) {
          if (delivery.feeAdded > 0 || delivery.interestAdded > 0) {
            feesApplied++
            console.log(`[send-reminders] Added fee=${delivery.feeAdded}kr interest=${delivery.interestAdded}kr to ${inv.invoice_number}`)
          }
          remindersSent++
          results.push({
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number,
            level,
            success: true,
            fee_added: delivery.feeAdded,
            interest_added: delivery.interestAdded,
          })
        } else {
          results.push({ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, level, success: false })
          if (mandateResolution.covered) {
            // Mandat-driven leverans misslyckades — registreras mot mandatets
            // EGNA auto-paus-tröskel, aldrig mot earned-autonomy-streaken.
            await registerMandateDeliveryFailure(supabase, { mandateId: mandateResolution.mandate.id, businessId: inv.business_id })
          } else {
            // Autonomt utskick nådde ingen kund — räknas mot nedgraderings-
            // tröskeln (2 fel/14 dagar). Fail-safe internt, kastar aldrig.
            await recordAutonomyFailure(supabase, inv.business_id, 'invoice_reminder')
          }
        }

        // Etapp W: mandat-täckta utskick stämplas med ett eget auto_approved
        // kort — mandatets mätinstrument (mandate-facit.ts) härleder
        // användning ur payload.mandate_id-stämplade kort. Den förtjänade-
        // autonomi-vägen skrev aldrig ett kort här, det är oförändrat.
        if (mandateResolution.covered) {
          const mandate = mandateResolution.mandate
          const cardId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          const amountLabelMandate = amountToPay?.toLocaleString('sv-SE') ?? '0'
          const { error: cardErr } = await supabase.from('pending_approvals').insert({
            id: cardId,
            business_id: inv.business_id,
            approval_type: 'invoice_reminder',
            title: `Skicka påminnelse för faktura ${inv.invoice_number}`,
            description: `Faktura ${inv.invoice_number} på ${amountLabelMandate} kr — påminnelse ${nextCount} skickad automatiskt inom mandatet.`,
            payload: {
              invoice_id: inv.invoice_id,
              autonomy_key: 'invoice_reminder',
              amount_kr: amountToPay ?? null,
              customer_name: customer?.name ?? null,
              invoice_number: inv.invoice_number,
              days_overdue: daysOverdue,
              delivery: deliveryInput,
              mandate_id: mandate.id,
              mission_id: mandate.mission_id,
              truth_class: MANDATE_TRUTH_CLASS.invoice_reminder,
              execution_result: {
                outcome: delivery.skipped ? 'failed' : 'success',
                error_text: delivery.skipped ? (delivery.orsak ?? null) : null,
              },
            },
            status: 'auto_approved',
            risk_level: 'medium',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          if (cardErr) console.error('[send-reminders] mandat-kort insert failed:', inv.invoice_id, cardErr)
        }
        continue
      }

      // ── Ej autonom → skapa godkännande (dedup mot öppet pending) ──
      // Kortbyggaren delas med onboardingens första verifierade handling
      // (lib/invoice-reminder-card.ts): samma payload, samma dedup.
      const kort = await createInvoiceReminderCard(supabase, { businessId: inv.business_id, inv, customer, step, capExceeded })
      if ('error' in kort) console.error('[send-reminders] approval insert failed:', inv.invoice_id, kort.error)
      if (!('id' in kort)) {
        results.push({ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, level, success: false })
        continue
      }

      // Push-notis (fire-and-forget)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.handymate.se'
      fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: internalPushHeaders(),
        body: JSON.stringify({
          business_id: inv.business_id,
          title: 'Godkännande krävs',
          body: `Skicka påminnelse för faktura ${inv.invoice_number}?`,
          url: '/dashboard/approvals',
        }),
      }).catch(() => {})

      // Touchpoint 3 (onboarding-följeskrift): första-händelse-SMS till ägaren.
      // Awaitas (inte fire-and-forget) — serverless-funktionen kan avslutas
      // innan en oawaitad promise hinner köra klart.
      try {
        const { sendFirstEventSms } = await import('@/lib/onboarding/first-event-sms')
        await sendFirstEventSms(inv.business_id, 'invoice_reminder', customer?.name || '')
      } catch (err) {
        console.error('[send-reminders] first-event-sms error (non-blocking):', err)
      }

      approvalsCreated++
      results.push({ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, level, success: false, approval_created: true })
    }

    return NextResponse.json({
      success: true,
      reminders_sent: remindersSent,
      fees_applied: feesApplied,
      approvals_created: approvalsCreated,
      results,
    })
  } catch (error: any) {
    console.error('[send-reminders] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
