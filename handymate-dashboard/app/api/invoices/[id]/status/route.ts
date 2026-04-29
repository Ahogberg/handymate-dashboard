import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * PATCH - Update invoice status with payment details
 * Body: { status: 'paid' | 'cancelled', paid_at?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: invoiceId } = params

    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { status, paid_at } = body

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

      // AI Projektledare: kontrollera projektavslut
      try {
        const { handleProjectEvent } = await import('@/lib/project-ai-engine')
        await handleProjectEvent({
          type: 'invoice_paid',
          businessId: business.business_id,
          invoiceId,
        })
      } catch { /* non-blocking */ }

      // Project workflow stage: 'Faktura betald' (ps-07)
      try {
        const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
        const project = await findProjectForEntity({
          businessId: business.business_id,
          invoiceId,
        })
        if (project) {
          await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_PAID, business.business_id)
        }
      } catch (err) {
        console.error('[invoice status] advanceProjectStage INVOICE_PAID failed:', err)
      }

      // Golden Path: tack-SMS + recensionsförfrågan efter betalning
      try {
        const customerPhone = (invoice as any)?.customer?.phone_number
        const customerName = (invoice as any)?.customer?.name?.split(' ')[0] || ''
        if (customerPhone) {
          const { data: config } = await supabase
            .from('business_config')
            .select('business_name, google_review_url, review_request_enabled, review_request_delay_days')
            .eq('business_id', business.business_id)
            .single()

          const bizName = config?.business_name || 'Vi'
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

          // Tack-SMS (alltid)
          await fetch(`${appUrl}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: business.business_id,
              to: customerPhone,
              message: `Tack ${customerName}! Vi har mottagit din betalning. Det var ett nöje att hjälpa dig — hör av dig om du behöver mer hjälp! // ${bizName}`,
            }),
          })

          // Recensionsförfrågan med Google Reviews-länk (om aktiverad)
          if (config?.review_request_enabled !== false && config?.google_review_url) {
            const delayDays = config.review_request_delay_days || 3
            const delayMs = delayDays * 24 * 60 * 60 * 1000

            // Schemalägg review-SMS — lagra i pending_approvals som scheduled task
            const scheduledAt = new Date(Date.now() + delayMs).toISOString()
            await supabase.from('pending_approvals').insert({
              id: `review_${invoiceId}_${Date.now()}`,
              business_id: business.business_id,
              approval_type: 'scheduled_review_request',
              title: `Skicka recensionsförfrågan till ${customerName || 'kund'}`,
              description: `Schemalagd ${delayDays} dagar efter betalning`,
              payload: {
                customer_id: invoice.customer_id,
                customer_phone: customerPhone,
                customer_name: customerName,
                google_review_url: config.google_review_url,
                business_name: bizName,
                invoice_id: invoiceId,
              },
              status: 'pending',
              risk_level: 'low',
              expires_at: scheduledAt,
            })
          }
        }
      } catch { /* non-blocking */ }
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
