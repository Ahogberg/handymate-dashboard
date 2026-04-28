import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { isFortnoxConnected, registerFortnoxPayment } from '@/lib/fortnox'

/**
 * POST /api/invoices/[id]/mark-paid
 *
 * Manuell betal-markering — överstyr cron-syncen. Kör automation-pipelinen
 * direkt och försöker även synka betalningen till Fortnox (non-blocking;
 * misslyckas synken ändras Handymate-status ändå).
 *
 * Body (optional):
 *   { paid_at?: string, amount?: number }
 *
 * Sparar `manual_paid_marked_at` + `manual_paid_by_user_id` för audit.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    const invoiceId = params.id
    const body = await request.json().catch(() => ({}))
    const paidAt = (body?.paid_at as string) || new Date().toISOString()

    const supabase = getServerSupabase()

    // Hämta faktura
    const { data: invoice, error: fetchErr } = await supabase
      .from('invoice')
      .select('invoice_id, status, customer_id, fortnox_invoice_number, total, total_amount')
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchErr || !invoice) {
      return NextResponse.json({ error: 'Faktura hittades inte' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Fakturan är redan betald' }, { status: 400 })
    }

    // 1. Uppdatera status DIREKT
    const { error: updateErr } = await supabase
      .from('invoice')
      .update({
        status: 'paid',
        paid_at: paidAt,
        manual_paid_marked_at: new Date().toISOString(),
        manual_paid_by_user_id: currentUser?.id || null,
      })
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 2. Synka betalningen till Fortnox (non-blocking)
    let fortnoxResult: { success: boolean; error?: string } = { success: true }
    if (invoice.fortnox_invoice_number) {
      const connected = await isFortnoxConnected(business.business_id)
      if (connected) {
        const amount = Number(body?.amount ?? invoice.total ?? invoice.total_amount ?? 0)
        if (amount > 0) {
          fortnoxResult = await registerFortnoxPayment(
            business.business_id,
            invoice.fortnox_invoice_number,
            amount,
            paidAt.split('T')[0]
          )
        }
      }
    }

    // 3. Trigga automation-pipeline
    await runPostPaymentAutomations(invoiceId, business.business_id, invoice.customer_id).catch(err =>
      console.error('[mark-paid] post-payment automations failed:', err)
    )

    return NextResponse.json({
      success: true,
      status: 'paid',
      paid_at: paidAt,
      fortnox_synced: fortnoxResult.success,
      fortnox_error: fortnoxResult.error || null,
      message: fortnoxResult.success
        ? 'Faktura markerad som betald.'
        : `Markerad som betald i Handymate. Fortnox-synk misslyckades: ${fortnoxResult.error}`,
    })
  } catch (err: any) {
    console.error('[mark-paid] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}

/**
 * Replikerar samma side-effects som /api/invoices/[id]/status PATCH när
 * status sätts till 'paid'. Karin/Hanna/Lars börjar bevaka direkt.
 */
async function runPostPaymentAutomations(
  invoiceId: string,
  businessId: string,
  customerId: string | null
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
          toStageSlug: 'paid',
          triggeredBy: 'user',
          aiReason: 'Manuell betal-markering',
        })
      }
    }
  } catch (err) {
    console.error('[mark-paid] pipeline error:', err)
  }

  try {
    const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
    const project = await findProjectForEntity({ businessId, invoiceId })
    if (project) {
      await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_PAID, businessId)
    }
  } catch (err) {
    console.error('[mark-paid] project-stage error:', err)
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
      console.error('[mark-paid] smart-communication error:', err)
    }
  }

  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    const { getServerSupabase } = await import('@/lib/supabase')
    const sb = getServerSupabase()
    await fireEvent(sb, 'payment_received', businessId, { invoice_id: invoiceId })
  } catch (err) {
    console.error('[mark-paid] fireEvent error:', err)
  }
}
