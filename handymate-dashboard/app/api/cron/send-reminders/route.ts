import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { generateOCR } from '@/lib/ocr'
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { buildSwishQRData } from '@/lib/swish-qr'
import { isAutonomous } from '@/lib/autonomy/earned-autonomy'
import { deliverInvoiceReminder } from '@/lib/invoice-reminder-send'

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

const DEFAULT_SCHEDULE = [
  { level: 'friendly', emailToo: false },
  { level: 'firm', emailToo: true },
  { level: 'formal', emailToo: true },
  { level: 'final', emailToo: true },
] as const

type ReminderLevel = 'friendly' | 'firm' | 'formal' | 'final'

interface ReminderConfig {
  auto_reminder_enabled: boolean
  auto_reminder_days: number
  reminder_fee: number
  penalty_interest: number
  late_fee_percent: number
  max_auto_reminders: number
  reminder_sms_template: string | null
  business_name: string
  display_name: string | null
  bankgiro: string
  swish_number: string | null
  phone_number: string | null
  assigned_phone_number: string | null
}

function getReminderMessage(level: ReminderLevel, vars: {
  invoiceNumber: string
  amount: string
  dueDate: string
  ocr: string
  businessName: string
  daysOverdue: number
  bankgiro: string
  reminderFee: number
  interestAmount: number
  customTemplate?: string | null
  assignedPhoneNumber?: string | null
  swishNumber?: string | null
  amountRaw?: number
}): { sms: string; emailSubject: string; emailBody: string } {
  const { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount } = vars
  const suffix = buildSmsSuffix(businessName, vars.assignedPhoneNumber)

  // Bygg Swish-betalningslänk om numret finns
  const swishNote = vars.swishNumber && vars.amountRaw
    ? ` Swish: ${vars.swishNumber} (${amount} kr, ange "${invoiceNumber}").`
    : ''

  // Använd custom SMS-mall om den finns
  if (vars.customTemplate) {
    const sms = vars.customTemplate
      .replace(/\{invoice_number\}/g, invoiceNumber)
      .replace(/\{amount\}/g, amount)
      .replace(/\{due_date\}/g, dueDate)
      .replace(/\{ocr\}/g, ocr)
      .replace(/\{business_name\}/g, businessName)
      .replace(/\{days_overdue\}/g, String(daysOverdue))
      .replace(/\{bankgiro\}/g, bankgiro)
      .replace(/\{late_fee_percent\}/g, String(reminderFee))
    return {
      sms: sms + '\n' + suffix,
      ...generateEmailContent(level, { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount, swishNumber: vars.swishNumber }),
    }
  }

  const feeNote = reminderFee > 0 && level !== 'friendly'
    ? ` Påminnelseavgift ${reminderFee} kr tillkommer.`
    : ''
  const interestNote = interestAmount > 0 && (level === 'formal' || level === 'final')
    ? ` Dröjsmålsränta: ${Math.round(interestAmount)} kr.`
    : ''
  const payInfo = bankgiro ? `Bankgiro ${bankgiro}, OCR: ${ocr}.` : `OCR: ${ocr}.`

  switch (level) {
    case 'friendly':
      return {
        sms: `Hej! Faktura ${invoiceNumber} på ${amount} kr förföll ${dueDate}. Kanske missades?${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount, swishNumber: vars.swishNumber }),
      }
    case 'firm':
      return {
        sms: `Påminnelse 2: Faktura ${invoiceNumber} på ${amount} kr är ${daysOverdue} dagar försenad.${feeNote}${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount, swishNumber: vars.swishNumber }),
      }
    case 'formal':
      return {
        sms: `Viktig påminnelse: Faktura ${invoiceNumber}, ${amount} kr, ${daysOverdue} dagar försenad.${feeNote}${interestNote}${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount, swishNumber: vars.swishNumber }),
      }
    case 'final':
      return {
        sms: `SISTA PÅMINNELSE: Faktura ${invoiceNumber}, ${amount} kr, ${daysOverdue} dagar försenad. Ärendet kan överlämnas till inkasso.${feeNote}${interestNote}${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount, swishNumber: vars.swishNumber }),
      }
  }
}

function generateEmailContent(level: ReminderLevel, vars: {
  invoiceNumber: string; amount: string; dueDate: string; ocr: string
  businessName: string; daysOverdue: number; bankgiro: string
  reminderFee: number; interestAmount: number; swishNumber?: string | null
}): { emailSubject: string; emailBody: string } {
  const { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount } = vars

  const feeRow = reminderFee > 0 && level !== 'friendly'
    ? `<tr><td style="padding:4px 0;color:#64748b">Påminnelseavgift</td><td style="text-align:right;padding:4px 0">${reminderFee} kr</td></tr>`
    : ''
  const interestRow = interestAmount > 0 && (level === 'formal' || level === 'final')
    ? `<tr><td style="padding:4px 0;color:#64748b">Dröjsmålsränta</td><td style="text-align:right;padding:4px 0">${Math.round(interestAmount)} kr</td></tr>`
    : ''

  const subjectMap: Record<ReminderLevel, string> = {
    friendly: `Påminnelse: Faktura ${invoiceNumber}`,
    firm: `Andra påminnelse: Faktura ${invoiceNumber} förfallen`,
    formal: `Tredje påminnelse: Faktura ${invoiceNumber} — ${daysOverdue} dagar försenad`,
    final: `Sista påminnelse: Faktura ${invoiceNumber} — risk för inkasso`,
  }

  const introMap: Record<ReminderLevel, string> = {
    friendly: `<p>Vi vill vänligen påminna om att faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong> förföll den ${dueDate}.</p><p>Om betalningen redan är skickad, bortse från detta meddelande.</p>`,
    firm: `<p>Vi har ännu inte fått betalning för faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong> som förföll den ${dueDate} (${daysOverdue} dagar sedan).</p><p>Vänligen betala snarast möjligt.</p>`,
    formal: `<p>Trots tidigare påminnelser har vi inte fått betalning för faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong>.</p><p>Fakturan förföll den ${dueDate}, vilket innebär att betalningen nu är <strong>${daysOverdue} dagar försenad</strong>.</p><p>Dröjsmålsränta enligt räntelagen debiteras.</p>`,
    final: `<p>Detta är en sista påminnelse gällande faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong> som förföll den ${dueDate}.</p><p>Betalningen är nu <strong>${daysOverdue} dagar försenad</strong>. Om betalning inte sker inom 10 dagar kan ärendet komma att överlämnas till inkassobolag.</p>`,
  }

  return {
    emailSubject: subjectMap[level],
    emailBody: `
      <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
        <div style="background:#0F766E;color:white;padding:16px 24px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:18px;">${subjectMap[level]}</h2>
        </div>
        <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p>Hej,</p>
          ${introMap[level]}
          ${(feeRow || interestRow) ? `
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:4px 0;color:#64748b">Fakturabelopp</td><td style="text-align:right;padding:4px 0">${amount} kr</td></tr>
            ${feeRow}
            ${interestRow}
          </table>` : ''}
          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 4px;font-weight:600;font-size:14px;">Betalningsinformation</p>
            <p style="margin:0;font-size:14px;color:#64748b;">${bankgiro ? `Bankgiro: ${bankgiro}<br>` : ''}OCR: ${ocr}${vars.swishNumber ? `<br><strong>Swish:</strong> ${vars.swishNumber}` : ''}</p>
          </div>
          <p>Med vänlig hälsning,<br><strong>${businessName}</strong></p>
        </div>
      </div>
    `,
  }
}

/**
 * Beräkna dröjsmålsränta (enkel ränta, årsränta / 365 * dagar)
 */
function calculateInterest(amount: number, annualRate: number, daysOverdue: number): number {
  if (annualRate <= 0 || daysOverdue <= 0 || amount <= 0) return 0
  return (amount * (annualRate / 100) * daysOverdue) / 365
}

// ── Cron handler ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return sendAutoReminders()
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return sendAutoReminders()
}

async function sendAutoReminders() {
  try {
    const supabase = getServerSupabase()
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

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
      const { data: cfg } = await supabase
        .from('business_config')
        .select('auto_reminder_enabled, auto_reminder_days, reminder_fee, penalty_interest, late_fee_percent, max_auto_reminders, reminder_sms_template, business_name, display_name, bankgiro, swish_number, phone_number, assigned_phone_number')
        .eq('business_id', bizId)
        .single()

      configMap[bizId] = {
        auto_reminder_enabled: cfg?.auto_reminder_enabled ?? false,
        auto_reminder_days: cfg?.auto_reminder_days || 7,
        reminder_fee: cfg?.reminder_fee ?? 60,
        penalty_interest: cfg?.penalty_interest || cfg?.late_fee_percent || 8,
        late_fee_percent: cfg?.late_fee_percent || 8,
        max_auto_reminders: cfg?.max_auto_reminders || 3,
        reminder_sms_template: cfg?.reminder_sms_template || null,
        business_name: cfg?.display_name || cfg?.business_name || 'Företaget',
        display_name: cfg?.display_name || null,
        bankgiro: cfg?.bankgiro || '',
        swish_number: cfg?.swish_number || null,
        phone_number: cfg?.phone_number || null,
        assigned_phone_number: cfg?.assigned_phone_number || null,
      }
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

      const dueDate = new Date(inv.due_date)
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

      // Beräkna dynamiskt schema baserat på auto_reminder_days
      // Första påminnelse: auto_reminder_days efter förfall
      // Sedan: dubblar intervallet för varje steg
      const firstDay = cfg.auto_reminder_days
      const reminderDays = [firstDay, firstDay * 2, firstDay * 4, firstDay * 8]
      const requiredDays = reminderDays[currentCount]

      if (!requiredDays || daysOverdue < requiredDays) continue

      const scheduleEntry = DEFAULT_SCHEDULE[Math.min(currentCount, DEFAULT_SCHEDULE.length - 1)]
      const level = scheduleEntry.level

      const businessName = cfg.business_name
      const bankgiro = cfg.bankgiro
      const amountToPay = inv.rot_rut_type ? inv.customer_pays : inv.total
      const ocrNumber = inv.ocr_number || generateOCR(inv.invoice_number || '')

      // Beräkna dröjsmålsränta
      const interestAmount = calculateInterest(amountToPay || 0, cfg.penalty_interest, daysOverdue)

      const messages = getReminderMessage(level, {
        invoiceNumber: inv.invoice_number,
        amount: amountToPay?.toLocaleString('sv-SE') || '0',
        dueDate: dueDate.toLocaleDateString('sv-SE'),
        ocr: ocrNumber,
        businessName,
        daysOverdue,
        bankgiro,
        reminderFee: cfg.reminder_fee,
        interestAmount,
        customTemplate: cfg.reminder_sms_template,
        assignedPhoneNumber: cfg.assigned_phone_number,
        swishNumber: cfg.swish_number,
        amountRaw: amountToPay || 0,
      })

      const customer = inv.customer as any

      // Beräkna nästa påminnelsetid (samma oavsett väg)
      const nextCount = currentCount + 1
      const nextDays = reminderDays[nextCount]
      const nextReminderAt = nextDays && nextCount < cfg.max_auto_reminders
        ? new Date(dueDate.getTime() + nextDays * 24 * 60 * 60 * 1000).toISOString()
        : null

      // Gemensam leverans-input (delas med approval-vägen via payload)
      const deliveryInput = {
        invoiceId: inv.invoice_id,
        invoiceNumber: inv.invoice_number,
        businessId: inv.business_id,
        customerId: inv.customer_id ?? null,
        businessName,
        customerPhone: customer?.phone_number ?? null,
        customerEmail: customer?.email ?? null,
        emailToo: scheduleEntry.emailToo,
        messages,
        level,
        currentCount,
        nextReminderAt,
        reminderFee: cfg.reminder_fee,
        interestAmount,
        penaltyInterest: cfg.penalty_interest,
        daysOverdue,
      }

      // ── Grind: företag UTAN V3-regel gatas genom förtjänad autonomi ──
      // Autonom → skicka direkt (avgift/ränta muteras BARA vid faktisk leverans
      // inne i deliverInvoiceReminder). Ej autonom → skapa godkännande, ingen
      // utskick + INGEN avgiftsmutation förrän hantverkaren godkänner.
      let autonomous = false
      try {
        autonomous = await isAutonomous(supabase, inv.business_id, 'invoice_reminder')
      } catch { autonomous = false }

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
        }
        continue
      }

      // ── Ej autonom → skapa godkännande (dedup mot öppet pending) ──
      const { count: existingApproval } = await supabase
        .from('pending_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', inv.business_id)
        .eq('approval_type', 'invoice_reminder')
        .eq('status', 'pending')
        .contains('payload', { invoice_id: inv.invoice_id })

      if ((existingApproval ?? 0) > 0) {
        results.push({ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, level, success: false })
        continue
      }

      const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const amountLabel = amountToPay?.toLocaleString('sv-SE') ?? '0'
      const { error: apprErr } = await supabase.from('pending_approvals').insert({
        id: approvalId,
        business_id: inv.business_id,
        approval_type: 'invoice_reminder',
        title: `Skicka påminnelse för faktura ${inv.invoice_number}`,
        description: `Faktura ${inv.invoice_number} på ${amountLabel} kr är ${daysOverdue} dagar försenad. Godkänn för att skicka påminnelse ${nextCount} till kunden.`,
        // invoice_id på topp-nivå → dedup-guarden ovan kan matcha via .contains.
        // autonomy_key → streak-räkning (förtjänad autonomi) kan mappa raden.
        // delivery → allt deliverInvoiceReminder behöver vid godkännande.
        payload: {
          invoice_id: inv.invoice_id,
          autonomy_key: 'invoice_reminder',
          delivery: deliveryInput,
        },
        status: 'pending',
        risk_level: 'medium',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      if (apprErr) {
        console.error('[send-reminders] approval insert failed:', inv.invoice_id, apprErr)
        results.push({ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, level, success: false })
        continue
      }

      // Push-notis (fire-and-forget)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.handymate.se'
      fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: inv.business_id,
          title: 'Godkännande krävs',
          body: `Skicka påminnelse för faktura ${inv.invoice_number}?`,
          url: '/dashboard/approvals',
        }),
      }).catch(() => {})

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
