import { getServerSupabase } from '@/lib/supabase'
import { decidePaymentOutcome, type PaymentTransition } from './payment-decision'
import { insertApprovalArtifact } from '@/lib/approvals/artifact-write'
import { halsning } from '@/lib/customers/namn'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

/**
 * Delad betal-kärna (2026-07-12, utbyggd 2026-08-26 för ROT/RUT-delbetalning).
 *
 * ALLA vägar som registrerar en betalning går härigenom: manuell mark-paid,
 * betalmodalens PATCH /status, kundens "Jag har betalat"-bekräftelse
 * (confirm_payment-kortet) och Fortnox-synken. Beslutet om VILKEN övergång
 * som är sann är rent (lib/invoices/payment-decision.ts):
 *
 *   sent|overdue → paid            (ej ROT, eller hela beloppet)   'to_paid'
 *   sent|overdue → customer_paid   (ROT/RUT, kundens del)          'to_customer_paid'
 *   customer_paid → paid           (Skatteverkets del in)          'settled'
 *
 * Post-payment-automationerna (pipeline→Vunnen, projektsteg, smart-
 * kommunikation, payment_received, portal-tack) körs vid to_paid OCH
 * to_customer_paid — kundrelationen är klar när kunden betalat SIN del.
 * Vid 'settled' körs de INTE igen (inget dubbelt tack-SMS när Skatteverket
 * betalar ut).
 *
 * Fortnox-betalregistreringen (registerFortnoxPayment) är borttagen härifrån:
 * Handymate skriver inte betalningar till Fortnox — Fortnox är sanningen för
 * betalningar och synkas HIT via lib/fortnox/sync-payments (2h-cron).
 * Anropet saknade dessutom scope och gav bara ett falskt "Fortnox-synk
 * misslyckades" i svaret.
 */

export type PaymentSource = 'manual' | 'customer_confirmed' | 'fortnox' | 'status_patch'

export interface ApplyPaymentResult {
  ok: boolean
  /** Fakturan var redan helt betald — ingen ändring gjord. Callern avgör om det
   *  är ett fel (manuell markering) eller ok (idempotent bekräftelse). */
  already_paid?: boolean
  error?: string
  status?: string
  transition?: PaymentTransition
  paid_at?: string
  paid_amount?: number
  /** Vad som återstår att få från Skatteverket (0 när inget återstår). */
  remaining_rot_kr?: number
  effects?: PaymentEffect[]
}

export interface PaymentEffect {
  effect: string
  status: 'succeeded' | 'attempted' | 'skipped' | 'failed'
  message?: string
  approval_id?: string
}

export async function applyInvoicePayment(opts: {
  businessId: string
  invoiceId: string
  paidAt?: string
  /** Registrerat belopp. Utelämnat = kundens andel (hela totalen utan ROT/RUT). */
  amount?: number
  /** Skrivs till invoice.paid_via (t.ex. 'swish', 'bankgiro', 'fortnox', 'customer_confirmed'). */
  paidVia?: string | null
  markedByUserId?: string | null
  source: PaymentSource
  /** Approval-originated payments must never hide follow-up sends inside the
   * main decision. Selected customer/rule sends become separate approvals. */
  approvalFollowUps?: {
    approvalId: string
    updateWorkflows: boolean
    prepareCustomerMessages: boolean
    runAutomationRules: boolean
  }
}): Promise<ApplyPaymentResult> {
  const { businessId, invoiceId, markedByUserId = null, source } = opts
  const paidAt = opts.paidAt || new Date().toISOString()
  const supabase = getServerSupabase()

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoice')
    .select('invoice_id, status, customer_id, invoice_number, fortnox_invoice_number, total, rot_rut_type, rot_rut_deduction, customer_pays, paid_amount, paid_at')
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (fetchErr || !invoice) {
    return { ok: false, error: 'Faktura hittades inte' }
  }
  if (invoice.status === 'paid') {
    return { ok: true, already_paid: true, status: 'paid', transition: 'none', paid_at: invoice.paid_at || paidAt }
  }

  const decision = decidePaymentOutcome(invoice, opts.amount)
  const now = new Date().toISOString()
  const paidVia = opts.paidVia
    ?? (source === 'fortnox' ? 'fortnox' : source === 'customer_confirmed' ? 'customer_confirmed' : 'manual')

  const updates: Record<string, unknown> = { paid_amount: decision.paid_amount }
  if (decision.transition === 'to_paid') {
    Object.assign(updates, { status: 'paid', paid_at: paidAt, settled_at: paidAt, paid_via: paidVia })
  } else if (decision.transition === 'to_customer_paid') {
    Object.assign(updates, { status: 'customer_paid', paid_at: paidAt, paid_via: paidVia })
  } else if (decision.transition === 'settled') {
    Object.assign(updates, { status: 'paid', settled_at: paidAt })
  }
  if (source !== 'fortnox' && decision.transition !== 'none') {
    updates.manual_paid_marked_at = now
    updates.manual_paid_by_user_id = markedByUserId
  }

  const { error: updateErr } = await supabase
    .from('invoice')
    .update(updates)
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  if (updateErr) {
    return { ok: false, error: updateErr.message }
  }

  const customerJustSettled = decision.transition === 'to_paid' || decision.transition === 'to_customer_paid'

  const effects: PaymentEffect[] = []
  if (customerJustSettled) {
    const reviewed = opts.approvalFollowUps
    effects.push(...await runPostPaymentAutomations(invoiceId, businessId, invoice.customer_id, {
      triggeredBy: source === 'fortnox' ? 'system' : 'user',
      reason: source === 'fortnox' ? 'Faktura betald (Fortnox-synk)' : 'Betal-markering',
      logPrefix: `[apply-payment/${source}]`,
      updateWorkflows: reviewed?.updateWorkflows !== false,
      runCustomerCommunication: !reviewed,
      runAutomationRules: reviewed?.runAutomationRules !== false,
      requireExplicitApproval: !!reviewed,
    }))

    if (reviewed) {
      if (reviewed.prepareCustomerMessages && invoice.customer_id) {
        effects.push(...await preparePaymentCustomerMessages(supabase, businessId, reviewed.approvalId, invoice, decision.paid_amount))
      } else {
        effects.push({ effect: 'customer_messages', status: 'skipped', message: reviewed.prepareCustomerMessages ? 'Fakturan saknar kund' : 'Valdes bort i granskningen' })
      }
    } else if (invoice.customer_id) {
      try {
        const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
        const notification = await sendPortalNotification(businessId, invoice.customer_id, 'invoice_paid', {
          context: {
            amount: decision.paid_amount,
            invoice_number: invoice.invoice_number || invoice.fortnox_invoice_number || invoiceId,
          },
        })
        effects.push({ effect: 'portal_message', status: notification.success ? (notification.skipped ? 'skipped' : 'succeeded') : 'failed', message: notification.skipped || notification.error })
      } catch (notifErr) {
        console.error(`[apply-payment/${source}] portal notification invoice_paid failed:`, notifErr)
        effects.push({ effect: 'portal_message', status: 'failed', message: notifErr instanceof Error ? notifErr.message : String(notifErr) })
      }
    }
  }

  return {
    ok: true,
    status: decision.status,
    transition: decision.transition,
    paid_at: customerJustSettled ? paidAt : (invoice.paid_at || paidAt),
    paid_amount: decision.paid_amount,
    remaining_rot_kr: decision.remaining_rot_kr,
    effects,
  }
}

async function preparePaymentCustomerMessages(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  approvalId: string,
  invoice: Record<string, any>,
  paidAmount: number,
): Promise<PaymentEffect[]> {
  const effects: PaymentEffect[] = []
  const { data: customer, error: customerError } = await supabase.from('customer')
    .select('customer_id, name, phone_number, email, portal_token, portal_enabled, review_request_sent_at')
    .eq('customer_id', invoice.customer_id).eq('business_id', businessId).maybeSingle()
  const { data: config, error: configError } = await supabase.from('business_config')
    .select('business_name, assigned_phone_number, google_review_url, review_request_enabled')
    .eq('business_id', businessId).maybeSingle()
  if (customerError || configError || !customer || !config?.business_name) {
    return [{ effect: 'customer_messages', status: 'failed', message: 'Kund eller avsändare kunde inte verifieras för följdförslagen' }]
  }
  const invoiceNumber = invoice.invoice_number || invoice.fortnox_invoice_number || invoice.invoice_id
  const amountText = `${Number(paidAmount || 0).toLocaleString('sv-SE')} kr`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  if (customer.email && customer.portal_enabled !== false && customer.portal_token) {
    const subject = `Tack för din betalning — faktura ${invoiceNumber}`
    const body = `${halsning(customer.name)} Tack för din betalning av ${amountText} för faktura ${invoiceNumber}. Du hittar fakturan och övrig dokumentation i kundportalen: ${appUrl}/portal/${customer.portal_token}`
    const saved = await insertApprovalArtifact(supabase, 'pending_approvals', 'id', businessId, approvalId, 'payment:portal-email', {
      approval_type: 'send_email', title: `Granska betalningsbesked till ${customer.name || 'kunden'}`,
      description: 'Förberett efter registrerad betalning; skickas först efter ett nytt beslut.',
      payload: { source: 'payment_followup', parent_approval_id: approvalId, customer_id: customer.customer_id, to: customer.email, subject, body, portal_event: 'invoice_paid', invoice_id: invoice.invoice_id },
      status: 'pending', risk_level: 'medium', expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    })
    effects.push(saved.error || !saved.data
      ? { effect: 'portal_message', status: 'failed', message: saved.error?.message || 'Granskningskortet kunde inte sparas' }
      : { effect: 'portal_message', status: 'succeeded', message: 'Separat granskningskort skapat', approval_id: saved.data.id })
  } else effects.push({ effect: 'portal_message', status: 'skipped', message: 'Aktiv portal eller kundmejl saknas' })

  if (config.review_request_enabled !== false && customer.phone_number && config.google_review_url && !customer.review_request_sent_at) {
    const message = `${halsning(customer.name)} Tack för förtroendet! Vill du lämna ett omdöme om vårt arbete? ${config.google_review_url} ${buildSmsSuffix(config.business_name, config.assigned_phone_number)}`
    const saved = await insertApprovalArtifact(supabase, 'pending_approvals', 'id', businessId, approvalId, 'payment:review-sms', {
      approval_type: 'review_request', title: `Granska omdömesförfrågan till ${customer.name || 'kunden'}`,
      description: 'Förberett efter registrerad betalning; skickas först efter ett nytt beslut.',
      payload: { source: 'payment_followup', parent_approval_id: approvalId, customer_id: customer.customer_id, to: customer.phone_number, message, invoice_id: invoice.invoice_id },
      status: 'pending', risk_level: 'medium', expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    })
    effects.push(saved.error || !saved.data
      ? { effect: 'review_request', status: 'failed', message: saved.error?.message || 'Granskningskortet kunde inte sparas' }
      : { effect: 'review_request', status: 'succeeded', message: 'Separat granskningskort skapat', approval_id: saved.data.id })
  } else effects.push({ effect: 'review_request', status: 'skipped', message: customer.review_request_sent_at ? 'Omdömesförfrågan har redan skickats' : 'Telefon, omdömeslänk eller inställning saknas' })
  return effects
}

/**
 * Side-effects när kunden har gjort sitt (paid ELLER customer_paid):
 * pipeline→Vunnen, AI-projektledarens avslutskoll, projekt-steg
 * (INVOICE_PAID), smart-kommunikation, payment_received-event. Karin/Hanna/
 * Lars börjar bevaka direkt. EN implementation — kopian som tidigare låg i
 * lib/fortnox/sync-payments.ts är borttagen (2026-08-26).
 */
export async function runPostPaymentAutomations(
  invoiceId: string,
  businessId: string,
  customerId: string | null,
  opts: {
    triggeredBy: 'user' | 'system'; reason: string; logPrefix: string
    updateWorkflows?: boolean
    runCustomerCommunication?: boolean
    runAutomationRules?: boolean
    requireExplicitApproval?: boolean
  } = {
    triggeredBy: 'user', reason: 'Betal-markering', logPrefix: '[apply-payment]',
  },
): Promise<PaymentEffect[]> {
  const { triggeredBy, reason, logPrefix } = opts
  const effects: PaymentEffect[] = []

  if (opts.updateWorkflows !== false) {
    try {
      const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
      const settings = await getAutomationSettings(businessId)
      if (settings?.auto_move_on_payment) {
        const deal = await findDealByInvoice(businessId, invoiceId)
        if (deal) {
          await moveDeal({ dealId: deal.id, businessId, toStageSlug: 'won', triggeredBy, aiReason: reason })
          effects.push({ effect: 'pipeline', status: 'succeeded', message: 'Affären flyttades enligt betalningsinställningen' })
        } else effects.push({ effect: 'pipeline', status: 'skipped', message: 'Ingen kopplad affär hittades' })
      } else effects.push({ effect: 'pipeline', status: 'skipped', message: 'Automatisk pipelineflytt är avstängd' })
    } catch (err) {
      console.error(`${logPrefix} pipeline error:`, err)
      effects.push({ effect: 'pipeline', status: 'failed', message: err instanceof Error ? err.message : String(err) })
    }

    // AI Projektledare: kontrollera projektavslut (låg tidigare bara i PATCH-rutten)
    try {
      const { handleProjectEvent } = await import('@/lib/project-ai-engine')
      await handleProjectEvent({ type: 'invoice_paid', businessId, invoiceId })
      effects.push({ effect: 'project_check', status: 'attempted', message: 'Projektets avslutsvillkor kontrollerades' })
    } catch (err) {
      console.error(`${logPrefix} handleProjectEvent invoice_paid failed (non-blocking):`, invoiceId, err)
      effects.push({ effect: 'project_check', status: 'failed', message: err instanceof Error ? err.message : String(err) })
    }

    // Projektsteg 'Faktura betald' — genom händelsebryggan.
    try {
      const { bumpProjectStage } = await import('@/lib/project-stages/event-bridge')
      const moved = await bumpProjectStage(businessId, { invoiceId }, 'invoice_settled')
      if (moved.moved) effects.push({ effect: 'project_stage', status: 'succeeded', message: 'Projektsteget flyttades' })
      else if (moved.skipped) effects.push({ effect: 'project_stage', status: 'skipped', message: moved.error || 'Villkoren för stegflytt var inte uppfyllda' })
      else {
        console.error(`${logPrefix} stegflytten misslyckades (non-blocking):`, moved.error, { projectId: moved.projectId })
        effects.push({ effect: 'project_stage', status: 'failed', message: moved.error || 'Projektsteget kunde inte flyttas' })
      }
    } catch (err) {
      console.error(`${logPrefix} project-stage error:`, err)
      effects.push({ effect: 'project_stage', status: 'failed', message: err instanceof Error ? err.message : String(err) })
    }
  } else effects.push({ effect: 'workflows', status: 'skipped', message: 'Valdes bort i granskningen' })

  if (opts.runCustomerCommunication !== false && customerId) {
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId,
        event: 'invoice_paid',
        customerId,
        context: { invoiceId },
      })
      effects.push({ effect: 'smart_communication', status: 'attempted', message: 'Kommunikationsreglerna kontrollerades' })
    } catch (err) {
      console.error(`${logPrefix} smart-communication error:`, err)
      effects.push({ effect: 'smart_communication', status: 'failed', message: err instanceof Error ? err.message : String(err) })
    }
  } else effects.push({ effect: 'smart_communication', status: 'skipped', message: opts.runCustomerCommunication === false ? 'Direkt kundutskick är avstängt för detta granskade beslut' : 'Kund saknas' })

  if (opts.runAutomationRules !== false) {
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      const sb = getServerSupabase()
      const summary = await fireEvent(sb, 'payment_received', businessId, {
        invoice_id: invoiceId, entity_id: invoiceId, customer_id: customerId,
        ...(opts.requireExplicitApproval ? { require_explicit_approval: true } : {}),
      })
      effects.push({ effect: 'payment_received_rules', status: summary.failed ? 'failed' : summary.executed ? 'succeeded' : summary.pending_approval ? 'succeeded' : 'skipped',
        message: `${summary.matched} matchade; ${summary.pending_approval} nya granskningar; ${summary.executed} utförda; ${summary.skipped} överhoppade; ${summary.failed} misslyckade` })
    } catch (err) {
      console.error(`${logPrefix} fireEvent error:`, err)
      effects.push({ effect: 'payment_received_rules', status: 'failed', message: err instanceof Error ? err.message : String(err) })
    }
  } else effects.push({ effect: 'payment_received_rules', status: 'skipped', message: 'Valdes bort i granskningen' })
  return effects
}
