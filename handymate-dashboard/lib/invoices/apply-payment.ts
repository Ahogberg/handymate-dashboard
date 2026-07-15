import { getServerSupabase } from '@/lib/supabase'
import { isFortnoxConnected, registerFortnoxPayment } from '@/lib/fortnox'

/**
 * Delad betal-markeringskärna (2026-07-12).
 *
 * Extraherad ur `app/api/invoices/[id]/mark-paid` så att BÅDE den manuella
 * dashboard-markeringen OCH kundens "Jag har betalat"-bekräftelse (efter
 * hantverkarens godkännande i kön) sätter faktura → betald på exakt samma
 * sätt: status-flip, Fortnox-synk (non-blocking), automation-pipeline
 * (pipeline→Vunnen, projekt-steg, smart-kommunikation, payment_received) +
 * portal-tack-notis. Semantik-drift mellan de två vägarna omöjlig.
 */

export interface ApplyPaymentResult {
  ok: boolean
  /** Fakturan var redan betald — ingen ändring gjord. Callern avgör om det
   *  är ett fel (manuell markering) eller ok (idempotent bekräftelse). */
  already_paid?: boolean
  error?: string
  status?: string
  paid_at?: string
  fortnox_synced?: boolean
  fortnox_error?: string | null
}

export async function applyInvoicePayment(opts: {
  businessId: string
  invoiceId: string
  paidAt?: string
  amount?: number
  markedByUserId?: string | null
  /** Spårning: 'manual' = dashboard, 'customer_confirmed' = kundens knapp + godkänt kort. */
  source: 'manual' | 'customer_confirmed'
}): Promise<ApplyPaymentResult> {
  const { businessId, invoiceId, markedByUserId = null, source } = opts
  const paidAt = opts.paidAt || new Date().toISOString()
  const supabase = getServerSupabase()

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoice')
    .select('invoice_id, status, customer_id, fortnox_invoice_number, total')
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (fetchErr || !invoice) {
    return { ok: false, error: 'Faktura hittades inte' }
  }
  if (invoice.status === 'paid') {
    // Redan betald — callern avgör om det är fel (manuell) eller ok (bekräftelse).
    return { ok: true, already_paid: true, status: 'paid', paid_at: paidAt }
  }

  const { error: updateErr } = await supabase
    .from('invoice')
    .update({
      status: 'paid',
      paid_at: paidAt,
      manual_paid_marked_at: new Date().toISOString(),
      manual_paid_by_user_id: markedByUserId,
    })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  if (updateErr) {
    return { ok: false, error: updateErr.message }
  }

  // Fortnox-synk (non-blocking — Handymate-status ändras oavsett)
  let fortnoxResult: { success: boolean; error?: string } = { success: true }
  if (invoice.fortnox_invoice_number) {
    const connected = await isFortnoxConnected(businessId)
    if (connected) {
      const amount = Number(opts.amount ?? invoice.total ?? 0)
      if (amount > 0) {
        fortnoxResult = await registerFortnoxPayment(
          businessId,
          invoice.fortnox_invoice_number,
          amount,
          paidAt.split('T')[0],
        )
      }
    }
  }

  await runPostPaymentAutomations(invoiceId, businessId, invoice.customer_id).catch(err =>
    console.error(`[apply-payment/${source}] post-payment automations failed:`, err),
  )

  if (invoice.customer_id) {
    try {
      const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
      await sendPortalNotification(businessId, invoice.customer_id, 'invoice_paid', {
        context: {
          amount: invoice.total ?? null,
          invoice_number: invoice.fortnox_invoice_number || invoiceId,
        },
      })
    } catch (notifErr) {
      console.error(`[apply-payment/${source}] portal notification invoice_paid failed:`, notifErr)
    }
  }

  return {
    ok: true,
    status: 'paid',
    paid_at: paidAt,
    fortnox_synced: fortnoxResult.success,
    fortnox_error: fortnoxResult.error || null,
  }
}

/**
 * Replikerar side-effects när status sätts till 'paid': pipeline→Vunnen,
 * projekt-steg, smart-kommunikation, payment_received-event. Karin/Hanna/Lars
 * börjar bevaka direkt.
 */
async function runPostPaymentAutomations(
  invoiceId: string,
  businessId: string,
  customerId: string | null,
): Promise<void> {
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
          triggeredBy: 'user',
          aiReason: 'Betal-markering',
        })
      }
    }
  } catch (err) {
    console.error('[apply-payment] pipeline error:', err)
  }

  try {
    const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
    const project = await findProjectForEntity({ businessId, invoiceId })
    if (project) {
      await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_PAID, businessId)
    }
  } catch (err) {
    console.error('[apply-payment] project-stage error:', err)
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
      console.error('[apply-payment] smart-communication error:', err)
    }
  }

  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    const sb = getServerSupabase()
    await fireEvent(sb, 'payment_received', businessId, { invoice_id: invoiceId })
  } catch (err) {
    console.error('[apply-payment] fireEvent error:', err)
  }
}
