import { getServerSupabase } from '@/lib/supabase'
import { decidePaymentOutcome, type PaymentTransition } from './payment-decision'

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

  if (customerJustSettled) {
    await runPostPaymentAutomations(invoiceId, businessId, invoice.customer_id, {
      triggeredBy: source === 'fortnox' ? 'system' : 'user',
      reason: source === 'fortnox' ? 'Faktura betald (Fortnox-synk)' : 'Betal-markering',
      logPrefix: `[apply-payment/${source}]`,
    }).catch(err =>
      console.error(`[apply-payment/${source}] post-payment automations failed:`, err),
    )

    if (invoice.customer_id) {
      try {
        const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
        await sendPortalNotification(businessId, invoice.customer_id, 'invoice_paid', {
          context: {
            amount: decision.paid_amount,
            invoice_number: invoice.invoice_number || invoice.fortnox_invoice_number || invoiceId,
          },
        })
      } catch (notifErr) {
        console.error(`[apply-payment/${source}] portal notification invoice_paid failed:`, notifErr)
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
  }
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
  opts: { triggeredBy: 'user' | 'system'; reason: string; logPrefix: string } = {
    triggeredBy: 'user', reason: 'Betal-markering', logPrefix: '[apply-payment]',
  },
): Promise<void> {
  const { triggeredBy, reason, logPrefix } = opts

  try {
    const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
    const settings = await getAutomationSettings(businessId)
    if (settings?.auto_move_on_payment) {
      const deal = await findDealByInvoice(businessId, invoiceId)
      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId,
          toStageSlug: 'won',
          triggeredBy,
          aiReason: reason,
        })
      }
    }
  } catch (err) {
    console.error(`${logPrefix} pipeline error:`, err)
  }

  // AI Projektledare: kontrollera projektavslut (låg tidigare bara i PATCH-rutten)
  try {
    const { handleProjectEvent } = await import('@/lib/project-ai-engine')
    await handleProjectEvent({ type: 'invoice_paid', businessId, invoiceId })
  } catch (err) {
    console.error(`${logPrefix} handleProjectEvent invoice_paid failed (non-blocking):`, invoiceId, err)
  }

  try {
    const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
    const project = await findProjectForEntity({ businessId, invoiceId })
    if (project) {
      const flytt = await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_PAID, businessId)
      if (!flytt.moved) console.error(`${logPrefix} stegflytten misslyckades (non-blocking):`, flytt.error, { projectId: project.project_id })
    }
  } catch (err) {
    console.error(`${logPrefix} project-stage error:`, err)
  }

  if (customerId) {
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId,
        event: 'invoice_paid',
        customerId,
        context: { invoiceId },
      })
    } catch (err) {
      console.error(`${logPrefix} smart-communication error:`, err)
    }
  }

  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    const sb = getServerSupabase()
    await fireEvent(sb, 'payment_received', businessId, { invoice_id: invoiceId })
  } catch (err) {
    console.error(`${logPrefix} fireEvent error:`, err)
  }
}
