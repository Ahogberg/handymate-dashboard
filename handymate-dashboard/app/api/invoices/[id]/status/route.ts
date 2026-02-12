import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * PATCH - Update invoice status with payment details
 * Body: { status: 'paid' | 'cancelled', paid_at?: string, payment_method?: string, paid_amount?: number }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params

    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { status, paid_at, payment_method, paid_amount } = body

    if (!status) {
      return NextResponse.json({ error: 'Missing status' }, { status: 400 })
    }

    // Verify invoice belongs to business
    const { data: existing, error: fetchError } = await supabase
      .from('invoice')
      .select('invoice_id, status, total')
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Build update object
    const updates: Record<string, any> = { status }

    if (status === 'paid') {
      updates.paid_at = paid_at || new Date().toISOString()
      updates.payment_method = payment_method || null
      updates.paid_amount = paid_amount || existing.total
    }

    if (status === 'cancelled') {
      updates.cancelled_at = new Date().toISOString()
    }

    // Update invoice
    const { data: invoice, error: updateError } = await supabase
      .from('invoice')
      .update(updates)
      .eq('invoice_id', invoiceId)
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email
        )
      `)
      .single()

    if (updateError) throw updateError

    // Pipeline: move deal to paid when invoice is paid
    if (status === 'paid') {
      try {
        const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
        const settings = await getAutomationSettings(business.business_id)
        if (settings?.auto_move_on_payment) {
          const deal = await findDealByInvoice(business.business_id, invoiceId)
          if (deal) {
            await moveDeal({
              dealId: deal.id,
              businessId: business.business_id,
              toStageSlug: 'paid',
              triggeredBy: 'system',
            })
          }
        }
      } catch (pipelineErr) {
        console.error('Pipeline trigger error (non-blocking):', pipelineErr)
      }

      // Smart communication: trigger invoice_paid event
      try {
        if (invoice?.customer_id) {
          const { triggerEventCommunication } = await import('@/lib/smart-communication')
          await triggerEventCommunication({
            businessId: business.business_id,
            event: 'invoice_paid',
            customerId: invoice.customer_id,
            context: { invoiceId },
          })
        }
      } catch (commErr) {
        console.error('Communication trigger error (non-blocking):', commErr)
      }
    }

    return NextResponse.json({
      success: true,
      invoice,
      message: status === 'paid' ? 'Faktura markerad som betald' : 'Fakturastatus uppdaterad'
    })

  } catch (error: any) {
    console.error('Update invoice status error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
