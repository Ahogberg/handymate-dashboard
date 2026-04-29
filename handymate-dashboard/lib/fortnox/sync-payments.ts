import { createClient } from '@supabase/supabase-js'
import { fortnoxRequest, isFortnoxConnected } from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface SyncResult {
  business_id: string
  checked: number
  marked_paid: number
  marked_overdue: number
  errors: string[]
}

interface FortnoxInvoiceListItem {
  DocumentNumber: string
  InvoiceNumber: string
  Balance: number
  DueDate: string
  Booked: boolean
  Cancelled: boolean
  FullyPaid?: boolean
}

/**
 * Synka betal-status för alla Fortnox-kopplade fakturor i en business.
 *
 * Logik:
 *   - Hämta Handymate-fakturor med fortnox_invoice_number satt och status != 'paid'/'cancelled'
 *   - För varje: läs Fortnox-fakturan, jämför Balance + förfallodatum
 *   - Om Fortnox visar Balance=0 → markera som betald i Handymate
 *   - Om DueDate har passerats och Balance>0 → markera som overdue
 *
 * Statusändringen triggar samma event-pipeline som
 * /api/invoices/[id]/status (Karin-påminnelser, projekt-stage,
 * recensions-SMS, smart-communication).
 */
export async function syncFortnoxPaymentsForBusiness(businessId: string): Promise<SyncResult> {
  const result: SyncResult = {
    business_id: businessId,
    checked: 0,
    marked_paid: 0,
    marked_overdue: 0,
    errors: [],
  }

  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    result.errors.push('not_connected')
    return result
  }

  const supabase = getSupabase()

  // Fakturor att synka: har Fortnox-kopplat ID + ej slutbehandlad i Handymate
  const { data: invoices, error } = await supabase
    .from('invoice')
    .select('invoice_id, business_id, status, fortnox_invoice_number, fortnox_document_number, due_date, customer_id, total, total_amount')
    .eq('business_id', businessId)
    .not('fortnox_invoice_number', 'is', null)
    .not('status', 'in', '(paid,cancelled)')

  if (error) {
    result.errors.push(`fetch: ${error.message}`)
    return result
  }

  const todayStr = new Date().toISOString().split('T')[0]

  for (const inv of invoices || []) {
    result.checked++
    try {
      // Föredra DocumentNumber (Fortnox internt id) över InvoiceNumber
      const docNum = (inv as any).fortnox_document_number || inv.fortnox_invoice_number
      const fnRes = await fortnoxRequest<{ Invoice: FortnoxInvoiceListItem }>(
        businessId,
        'GET',
        `/invoices/${docNum}`
      )
      const fnInv = fnRes?.Invoice
      if (!fnInv) continue

      const isPaid = fnInv.FullyPaid === true || (typeof fnInv.Balance === 'number' && fnInv.Balance <= 0)
      const isOverdue = !isPaid && fnInv.DueDate && fnInv.DueDate < todayStr

      if (isPaid && inv.status !== 'paid') {
        await markInvoicePaid(inv.invoice_id, businessId, inv.customer_id)
        result.marked_paid++

        // Portal-notifikation: tack för betalning
        if (inv.customer_id) {
          try {
            const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
            await sendPortalNotification(businessId, inv.customer_id, 'invoice_paid', {
              context: {
                amount: inv.total ?? inv.total_amount ?? null,
                invoice_number: inv.fortnox_invoice_number || inv.invoice_id,
              },
            })
          } catch (notifErr) {
            console.error('[fortnox-sync] portal notification invoice_paid failed:', notifErr)
          }
        }
      } else if (isOverdue && inv.status !== 'overdue') {
        await markInvoiceOverdue(inv.invoice_id, businessId)
        result.marked_overdue++
      }
    } catch (err: any) {
      result.errors.push(`${inv.invoice_id}: ${err?.message || 'sync error'}`)
    }
  }

  // Uppdatera last_synced_at
  await supabase
    .from('business_config')
    .update({ fortnox_last_synced_at: new Date().toISOString() })
    .eq('business_id', businessId)

  return result
}

async function markInvoicePaid(invoiceId: string, businessId: string, customerId: string | null) {
  const supabase = getSupabase()
  const now = new Date().toISOString()

  await supabase
    .from('invoice')
    .update({
      status: 'paid',
      paid_at: now,
    })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  // Trigga automation-pipeline (samma som /api/invoices/[id]/status PATCH)
  await runPostPaymentAutomations(invoiceId, businessId, customerId).catch(err =>
    console.error('[fortnox-sync] post-payment automations failed:', err)
  )
}

async function markInvoiceOverdue(invoiceId: string, businessId: string) {
  const supabase = getSupabase()
  await supabase
    .from('invoice')
    .update({ status: 'overdue' })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  // Karin/automation-engine plockar upp via check-overdue/send-reminders cron
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    const { getServerSupabase } = await import('@/lib/supabase')
    const sb = getServerSupabase()
    await fireEvent(sb, 'invoice_overdue', businessId, { invoice_id: invoiceId })
  } catch { /* non-blocking */ }
}

/**
 * Replikerar samma side-effects som /api/invoices/[id]/status PATCH när
 * status sätts till 'paid'. Trigga: smart-communication, project-stage advance,
 * pipeline-flytt till 'paid', schedulera review-SMS.
 */
async function runPostPaymentAutomations(
  invoiceId: string,
  businessId: string,
  customerId: string | null
): Promise<void> {
  // 1. Pipeline: flytta deal till 'paid' om kopplad
  try {
    const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
    const settings = await getAutomationSettings(businessId)
    if (settings?.auto_move_on_payment) {
      const deal = await findDealByInvoice(businessId, invoiceId)
      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId,
          toStageSlug: 'paid',
          triggeredBy: 'system',
          aiReason: 'Faktura betald (Fortnox-synk)',
        })
      }
    }
  } catch (err) {
    console.error('[fortnox-sync] pipeline error:', err)
  }

  // 2. Project workflow stage: INVOICE_PAID
  try {
    const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
    const project = await findProjectForEntity({ businessId, invoiceId })
    if (project) {
      await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_PAID, businessId)
    }
  } catch (err) {
    console.error('[fortnox-sync] project-stage error:', err)
  }

  // 3. Smart-communication invoice_paid (kräver customer_id)
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
      console.error('[fortnox-sync] smart-communication error:', err)
    }
  }

  // 4. Automation-engine event
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    const { getServerSupabase } = await import('@/lib/supabase')
    const sb = getServerSupabase()
    await fireEvent(sb, 'payment_received', businessId, { invoice_id: invoiceId })
  } catch (err) {
    console.error('[fortnox-sync] fireEvent error:', err)
  }
}
