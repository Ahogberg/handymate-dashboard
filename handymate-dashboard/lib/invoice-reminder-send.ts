import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSmsViaElks } from '@/lib/sms-send'
import { loadAttribution, attributionEmailHtml } from '@/lib/branding/attribution'
import { loadBranding } from '@/lib/branding/get-branding'
import { emailLayout } from '@/lib/email-templates'
import { sendEmail } from '@/lib/email'

/**
 * Övergång (varumärkeslagret 2026-09-07): kort skapade före bytet bär ett
 * komplett mejl-dokument i payload.delivery.messages.emailBody (gammal
 * teal-header). Dem lindar vi inte in en gång till — de får stämpeln som
 * förut. Kan tas bort när inga pending-kort från före 2026-09-07 finns kvar.
 */
export function arRedanHeltMejl(emailBody: string): boolean {
  return emailBody.includes('border-radius:12px 12px 0 0') || /<html|<body/i.test(emailBody)
}

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
  /** Approval when a human sent it, cron/autonomy otherwise. */
  outboundSource?: { source: 'approval' | 'cron' | 'autonomy'; sourceId: string }
  outboundAutonomyKey?: 'invoice_reminder'
  outboundAuditId?: string
}

/**
 * A4 (Prisslingan V2) — REN beräkning av påminnelsens total/customer_pays.
 * Facit: tests/reminder-totals.spec.ts.
 *
 * Basen är kärnans subtotal + vat_amount (opåverkade av påminnelser) — INTE
 * radernas summerade totals (exkl moms → fakturan tappade sin moms i
 * total-kolumnen från andra påminnelsen) och INTE en egen ROT-formel
 * (procent × alla rader utan årstak — det LAGRADE, kappade avdraget gäller).
 * Avgifter/ränta är 0% moms och läggs rakt på.
 */
export function beraknaPaminnelseTotaler(
  inv: {
    subtotal?: number | null
    vat_amount?: number | null
    rot_rut_type?: string | null
    rot_rut_deduction?: number | null
  },
  feesAndInterest: number,
): { total: number; customer_pays: number } {
  const ursprungligTotalInklMoms = Number(inv.subtotal ?? 0) + Number(inv.vat_amount ?? 0)
  const total = ursprungligTotalInklMoms + feesAndInterest
  if (inv.rot_rut_type) {
    const avdrag = Number(inv.rot_rut_deduction ?? 0)
    return { total, customer_pays: ursprungligTotalInklMoms - avdrag + feesAndInterest }
  }
  return { total, customer_pays: total }
}

export interface ReminderDeliveryResult {
  smsSent: boolean
  emailSent: boolean
  feeAdded: number
  interestAdded: number
  /** true om varken SMS eller e-post gick ut → ingen mutation gjord. */
  skipped: boolean
  /**
   * VARFÖR inget gick ut — på svenska, redo för hantverkarens yta.
   *
   * Fanns inte tidigare: anroparen fick bara `skipped: true`, godkännande-
   * vägen returnerade inget fel, och Klart idag-raden sa "skickade: …" om
   * en påminnelse som aldrig lämnade huset (Andreas fynd 2026-08-10).
   */
  orsak?: string
  errors?: string[]
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

  if (process.env.CHANNEL_PREFLIGHT_ENABLED === 'true' && process.env.OUTBOUND_INTENTS_ENABLED !== 'true') {
    const { gateApprovalChannels } = await import('@/lib/channels/preflight')
    const blocked = await gateApprovalChannels(supabase, input.businessId, 'invoice_reminder', { delivery: input })
    if (blocked) return { smsSent: false, emailSent: false, feeAdded: 0, interestAdded: 0, skipped: true, orsak: blocked.message }
  }

  const errors: string[] = []
  const { data: verified, error: verificationError } = await supabase.from('invoice')
    .select('invoice_id, status, customer_id, reminder_count').eq('invoice_id', invoiceId).eq('business_id', businessId).maybeSingle()
  if (verificationError || !verified || !['sent', 'overdue'].includes(verified.status) || (verified.reminder_count || 0) !== currentCount || verified.customer_id !== customerId) {
    return { smsSent: false, emailSent: false, feeAdded: 0, interestAdded: 0, skipped: true, orsak: 'fakturan har ändrats eller kunde inte verifieras; granska aktuellt underlag' }
  }
  let smsSent = false
  let emailSent = false
  let smsFel: string | null = null
  const round = currentCount + 1
  const source = input.outboundSource || { source: 'cron' as const, sourceId: `invoice-reminder:${invoiceId}:${round}` }
  const reconcile = { type: 'invoice_reminder' as const, input: { ...input, outboundSource: source } }

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
      recipient: 'customer',
      purpose: 'transactional',
      outbound: { source: source.source, sourceId: source.sourceId, dedupeKey: `reminder:${invoiceId}:${round}:sms`, template: 'invoice-reminder-sms',
        autonomyKey: input.outboundAutonomyKey, auditId: input.outboundAuditId },
      outboundReconcile: reconcile,
    })
    smsSent = r.success
    // Felet kastades tidigare bort — spärrhakens/46elks besked är exakt den
    // information hantverkaren behöver när "skickades inte" ska förklaras.
    if (!r.success) smsFel = (r as { error?: string }).error || null
  }

  // ── Skicka e-post (från andra påminnelsen) ──
  if (emailToo && customerEmail && process.env.RESEND_API_KEY) {
    try {
      // Varumärke + stämpel läggs på vid leveransen (inte i
      // invoice-reminder-card, som bara komponerar innehållet) — en query
      // per utskick, aldrig blockerande. Legacy-kort med helt dokument får
      // bara stämpeln, som förut.
      let html: string
      if (arRedanHeltMejl(messages.emailBody)) {
        const attribution = await loadAttribution(supabase, businessId)
        html = `${messages.emailBody}${attributionEmailHtml(attribution)}`
      } else {
        const branding = await loadBranding(supabase, businessId)
        html = emailLayout(branding, messages.emailBody)
      }
      const emailResult = await sendEmail({
        businessId, customerId, fromName: businessName,
        fromAddress: `faktura@${process.env.RESEND_DOMAIN ?? 'handymate.se'}`,
        to: customerEmail, subject: messages.emailSubject, html,
        idempotencyKey: `reminder:${invoiceId}:${round}:email`,
        outbound: { source: source.source, sourceId: source.sourceId, dedupeKey: `reminder:${invoiceId}:${round}:email`, template: 'invoice-reminder-email', autonomyKey: input.outboundAutonomyKey, auditId: input.outboundAuditId },
        outboundReconcile: reconcile,
      })
      if (!emailResult.success || !emailResult.messageId) errors.push(emailResult.error || 'E-posttjänsten bekräftade inte utskicket.')
      else emailSent = true
    } catch (err) {
      errors.push('E-posttjänsten kunde inte bekräfta utskicket.')
      console.error(`[invoice-reminder-send] Email error ${invoiceNumber}:`, err)
    }
  }

  if (customerPhone && !smsSent) errors.push(smsFel || 'SMS-tjänsten bekräftade inte utskicket.')
  if (emailToo && customerEmail && !emailSent && !errors.some(e => e.includes('E-post'))) errors.push('E-posttjänsten bekräftade inte utskicket.')
  if (!smsSent && !emailSent) {
    const orsak = smsFel
      ? smsFel.replace(/[.\s]+$/, '')
      : !customerPhone
        ? 'kunden saknar telefonnummer'
        : !process.env.ELKS_API_USER
          ? 'SMS-tjänsten är inte konfigurerad'
          : 'ingen kanal nådde kunden'
    return { smsSent: false, emailSent: false, feeAdded: 0, interestAdded: 0, skipped: true, orsak }
  }

  const receipt = await reconcileInvoiceReminder(supabase, input, { smsSent, emailSent })
  if (!receipt.reconciled) errors.push(receipt.error || 'Påminnelsen skickades, men kvittensen kunde inte sparas.')
  errors.push(...receipt.errors)
  return { smsSent, emailSent, feeAdded: receipt.feeAdded, interestAdded: receipt.interestAdded, skipped: false, errors }
}

export interface ReminderReconciliationResult {
  reconciled: boolean
  reused?: boolean
  feeAdded: number
  interestAdded: number
  error?: string
  errors: string[]
}

/** Reconcile one reminder round with a single reminder_count CAS. Both channel
 * intents may recover concurrently; only one can apply fees and advance the
 * invoice. Later calls return the durable prior receipt without mutations. */
export async function reconcileInvoiceReminder(
  supabase: SupabaseClient,
  input: ReminderDeliveryInput,
  channels: { smsSent?: boolean; emailSent?: boolean } = {},
): Promise<ReminderReconciliationResult> {
  const { invoiceId, invoiceNumber, businessId, customerId, level, currentCount,
    nextReminderAt, reminderFee, interestAmount, penaltyInterest, daysOverdue } = input
  const empty = { feeAdded: 0, interestAdded: 0, errors: [] as string[] }
  const { data: invoice, error } = await supabase.from('invoice')
    .select('items,total,subtotal,vat_amount,rot_rut_deduction,customer_pays,rot_rut_type,rot_rut_percent,reminder_count')
    .eq('invoice_id', invoiceId).eq('business_id', businessId).maybeSingle()
  if (error || !invoice) return { ...empty, reconciled: false, error: 'Fakturans påminnelsekvittens kunde inte verifieras.' }
  const storedCount = Number(invoice.reminder_count || 0)
  if (storedCount >= currentCount + 1) {
    const rows = Array.isArray(invoice.items) ? invoice.items : []
    const feeAdded = rows.some((item: any) => item.type === 'reminder_fee' && String(item.name || '').includes(`påminnelse ${currentCount + 1}`)) ? reminderFee : 0
    const interestAdded = interestAmount > 0 && rows.some((item: any) => item.type === 'penalty_interest') ? Math.round(interestAmount) : 0
    return { reconciled: true, reused: true, feeAdded, interestAdded, errors: [] }
  }
  if (storedCount !== currentCount) return { ...empty, reconciled: false, error: 'Fakturan har ändrats sedan påminnelsen förbereddes.' }

  const items = Array.isArray(invoice.items) ? [...invoice.items] : []
  let feeAdded = 0, interestAdded = 0
  if (currentCount >= 1 && (reminderFee > 0 || interestAmount > 0)) {
    const existingFeeCount = items.filter((item: any) => item.type === 'reminder_fee').length
    if (reminderFee > 0 && existingFeeCount < currentCount) {
      items.push({ type: 'reminder_fee', name: `Påminnelseavgift (påminnelse ${currentCount + 1})`,
        quantity: 1, unit_price: reminderFee, total: reminderFee, vat_rate: 0 })
      feeAdded = reminderFee
    }
    if (interestAmount > 0) {
      const rounded = Math.round(interestAmount)
      const index = items.findIndex((item: any) => item.type === 'penalty_interest')
      const value = { type: 'penalty_interest', name: `Dröjsmålsränta (${penaltyInterest}%, ${daysOverdue} dagar)`,
        quantity: 1, unit_price: rounded, total: rounded, vat_rate: 0 }
      if (index >= 0) items[index] = { ...items[index], ...value }
      else items.push(value)
      interestAdded = rounded
    }
  }
  const fees = items.filter((item: any) => ['reminder_fee','penalty_interest'].includes(item.type))
    .reduce((sum: number, item: any) => sum + Number(item.total || 0), 0)
  const totals = beraknaPaminnelseTotaler(invoice, fees)
  const now = new Date().toISOString()
  const updated = await supabase.from('invoice').update({ items, total: totals.total, customer_pays: totals.customer_pays,
    status: 'overdue', reminder_count: currentCount + 1, last_reminder_at: now, next_reminder_at: nextReminderAt })
    .eq('invoice_id', invoiceId).eq('business_id', businessId).eq('reminder_count', currentCount).select('invoice_id')
  if (updated.error || updated.data?.length !== 1) {
    const winner = await supabase.from('invoice').select('reminder_count').eq('invoice_id', invoiceId)
      .eq('business_id', businessId).maybeSingle()
    if (!winner.error && Number(winner.data?.reminder_count || 0) >= currentCount + 1) return { ...empty, reconciled: true, reused: true }
    return { ...empty, reconciled: false, error: 'Påminnelsen skickades, men nästa påminnelsetid kunde inte sparas.' }
  }
  const activity = await supabase.from('customer_activity').insert({
    business_id: businessId, customer_id: customerId, activity_type: 'auto_reminder_sent',
    description: `Automatisk påminnelse ${currentCount + 1} skickad för faktura ${invoiceNumber}${channels.smsSent ? ' (SMS)' : ''}${channels.emailSent ? ' (email)' : ''}${feeAdded > 0 ? ` — avgift ${feeAdded} kr tillagd` : ''}${interestAdded > 0 ? ` — ränta ${interestAdded} kr tillagd` : ''}`,
    metadata: { invoice_id: invoiceId, level, reminder_count: currentCount + 1, fee_added: feeAdded, interest_added: interestAdded },
  })
  return { reconciled: true, feeAdded, interestAdded,
    errors: activity.error ? ['Påminnelsen skickades, men kundhistoriken kunde inte uppdateras.'] : [] }
}
