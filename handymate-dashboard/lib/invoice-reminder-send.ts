import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSmsViaElks } from '@/lib/sms-send'

/**
 * Delad leverans-logik för fakturapåminnelser.
 *
 * Används av BÅDE:
 *  - cron/send-reminders (autonom väg — företag som förtjänat autonomi)
 *  - approvals/[id] (godkännande-väg — företag utan autonomi, hantverkaren
 *    trycker Godkänn på en 'invoice_reminder'-approval)
 *
 * En enda implementation → SMS, e-post, avgifts-/räntemutation och
 * räknar-uppdatering kan aldrig gå ur synk mellan de två vägarna.
 *
 * KRITISKT: påminnelseavgift + dröjsmålsränta muteras BARA här, dvs. bara
 * när påminnelsen faktiskt levereras — aldrig när en approval enbart skapas.
 */

export interface ReminderMessages {
  sms: string
  emailSubject: string
  emailBody: string
}

export interface ReminderDeliveryInput {
  invoiceId: string
  invoiceNumber: string
  businessId: string
  customerId: string | null
  businessName: string
  /** Mottagarens telefonnummer (valfritt — SMS hoppas om saknas). */
  customerPhone?: string | null
  /** Mottagarens e-post (valfritt — e-post hoppas om saknas). */
  customerEmail?: string | null
  /** Om e-post ska skickas på denna nivå (schema-styrd). */
  emailToo: boolean
  messages: ReminderMessages
  level: string
  /** Antal påminnelser som redan skickats innan denna (reminder_count före bump). */
  currentCount: number
  /** Nästa reminder-tid (ISO) eller null. */
  nextReminderAt: string | null
  /** Redan uträknad avgift + ränta (SEK). Låses vid komposition, appliceras här. */
  reminderFee: number
  interestAmount: number
  penaltyInterest: number
  daysOverdue: number
}

export interface ReminderDeliveryResult {
  smsSent: boolean
  emailSent: boolean
  feeAdded: number
  interestAdded: number
  /** true om varken SMS eller e-post gick ut → ingen mutation gjord. */
  skipped: boolean
}

/**
 * Levererar en fakturapåminnelse: skickar SMS + ev. e-post, applicerar
 * avgift/ränta på fakturan (från andra påminnelsen) och uppdaterar
 * reminder_count / next_reminder_at. Loggar SMS + aktivitet.
 */
export async function deliverInvoiceReminder(
  supabase: SupabaseClient,
  input: ReminderDeliveryInput,
): Promise<ReminderDeliveryResult> {
  const {
    invoiceId, invoiceNumber, businessId, customerId, businessName,
    customerPhone, customerEmail, emailToo, messages, level,
    currentCount, nextReminderAt, reminderFee, interestAmount, penaltyInterest, daysOverdue,
  } = input

  let smsSent = false
  let emailSent = false

  // ── Skicka SMS ──
  if (customerPhone && process.env.ELKS_API_USER) {
    const r = await sendSmsViaElks({
      supabase,
      businessId,
      businessName,
      to: customerPhone,
      message: messages.sms,
      customerId,
      relatedId: invoiceId,
      messageType: 'invoice_reminder',
    })
    smsSent = r.success
  }

  // ── Skicka e-post (från andra påminnelsen) ──
  if (emailToo && customerEmail && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: `${businessName} <faktura@${process.env.RESEND_DOMAIN ?? 'handymate.se'}>`,
        to: customerEmail,
        subject: messages.emailSubject,
        html: messages.emailBody,
      })
      emailSent = true
    } catch (err) {
      console.error(`[invoice-reminder-send] Email error ${invoiceNumber}:`, err)
    }
  }

  if (!smsSent && !emailSent) {
    return { smsSent: false, emailSent: false, feeAdded: 0, interestAdded: 0, skipped: true }
  }

  // ── Avgift + ränta (BARA när något faktiskt gick ut) ──
  let feeAdded = 0
  let interestAdded = 0

  if (currentCount >= 1 && (reminderFee > 0 || interestAmount > 0)) {
    try {
      const { data: currentInvoice } = await supabase
        .from('invoice')
        .select('items, total, customer_pays, rot_rut_type, rot_rut_percent')
        .eq('invoice_id', invoiceId)
        .single()

      if (currentInvoice) {
        const items = Array.isArray(currentInvoice.items) ? [...currentInvoice.items] : []

        const existingFeeCount = items.filter((i: any) => i.type === 'reminder_fee').length
        if (reminderFee > 0 && existingFeeCount < currentCount) {
          items.push({
            type: 'reminder_fee',
            name: `Påminnelseavgift (påminnelse ${currentCount + 1})`,
            quantity: 1,
            unit_price: reminderFee,
            total: reminderFee,
            vat_rate: 0,
          })
          feeAdded = reminderFee
        }

        if (interestAmount > 0) {
          const existingInterestIdx = items.findIndex((i: any) => i.type === 'penalty_interest')
          const roundedInterest = Math.round(interestAmount)

          if (existingInterestIdx >= 0) {
            items[existingInterestIdx].unit_price = roundedInterest
            items[existingInterestIdx].total = roundedInterest
            items[existingInterestIdx].name = `Dröjsmålsränta (${penaltyInterest}%, ${daysOverdue} dagar)`
          } else {
            items.push({
              type: 'penalty_interest',
              name: `Dröjsmålsränta (${penaltyInterest}%, ${daysOverdue} dagar)`,
              quantity: 1,
              unit_price: roundedInterest,
              total: roundedInterest,
              vat_rate: 0,
            })
          }
          interestAdded = roundedInterest
        }

        const newTotal = items.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0)
        const updateData: Record<string, any> = { items, total: newTotal }

        if (currentInvoice.rot_rut_type) {
          const originalTotal = items
            .filter((i: any) => i.type !== 'reminder_fee' && i.type !== 'penalty_interest')
            .reduce((sum: number, i: any) => sum + (i.total ?? 0), 0)
          const rotRutPercent = currentInvoice.rot_rut_percent ?? (currentInvoice.rot_rut_type === 'rot' ? 30 : 50)
          const deduction = Math.round(originalTotal * rotRutPercent / 100)
          const feesAndInterest = items
            .filter((i: any) => i.type === 'reminder_fee' || i.type === 'penalty_interest')
            .reduce((sum: number, i: any) => sum + (i.total ?? 0), 0)
          updateData.customer_pays = originalTotal - deduction + feesAndInterest
        } else {
          updateData.customer_pays = newTotal
        }

        await supabase.from('invoice').update(updateData).eq('invoice_id', invoiceId)
      }
    } catch (feeErr) {
      console.error(`[invoice-reminder-send] Fee/interest error ${invoiceNumber}:`, feeErr)
    }
  }

  // ── Uppdatera påminnelse-räknare ──
  const nextCount = currentCount + 1
  const { error: updErr } = await supabase
    .from('invoice')
    .update({
      status: 'overdue',
      reminder_count: nextCount,
      last_reminder_at: new Date().toISOString(),
      next_reminder_at: nextReminderAt,
    })
    .eq('invoice_id', invoiceId)
  if (updErr) console.error('[invoice-reminder-send] invoice update failed (räknare ej uppdaterad):', invoiceId, updErr)

  // ── Logga aktivitet ──
  await supabase.from('activity').insert({
    business_id: businessId,
    customer_id: customerId,
    activity_type: 'auto_reminder_sent',
    description: `Automatisk påminnelse ${nextCount} skickad för faktura ${invoiceNumber}${smsSent ? ' (SMS)' : ''}${emailSent ? ' (email)' : ''}${feeAdded > 0 ? ` — avgift ${feeAdded} kr tillagd` : ''}${interestAdded > 0 ? ` — ränta ${interestAdded} kr tillagd` : ''}`,
    metadata: {
      invoice_id: invoiceId,
      level,
      reminder_count: nextCount,
      fee_added: feeAdded,
      interest_added: interestAdded,
    },
  })

  return { smsSent, emailSent, feeAdded, interestAdded, skipped: false }
}
