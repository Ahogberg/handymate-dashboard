import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/quotes/public/[token] - Hämta offert via publik signeringslänk
 * Ingen auth krävs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token

    if (!token) {
      return NextResponse.json({ error: 'Token saknas' }, { status: 400 })
    }

    // Fetch quote by sign_token
    const { data: quote, error } = await supabase
      .from('quotes')
      .select(`
        quote_id,
        title,
        description,
        items,
        labor_total,
        material_total,
        subtotal,
        discount_percent,
        discount_amount,
        vat_rate,
        vat_amount,
        total,
        rot_rut_type,
        rot_rut_eligible,
        rot_rut_deduction,
        customer_pays,
        personnummer,
        fastighetsbeteckning,
        valid_until,
        status,
        signed_at,
        signed_by_name,
        attachments,
        created_at,
        business_id,
        customer:customer_id (
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .eq('sign_token', token)
      .single()

    if (error || !quote) {
      return NextResponse.json({ error: 'Offert hittades inte eller länken är ogiltig' }, { status: 404 })
    }

    // Fetch business info
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, contact_name, contact_email, phone_number, org_number, f_skatt_registered')
      .eq('business_id', quote.business_id)
      .single()

    // Check if already signed
    const alreadySigned = quote.status === 'accepted' && quote.signed_at

    return NextResponse.json({
      quote: {
        ...quote,
        business_id: undefined, // Don't expose
      },
      business: {
        name: business?.business_name || '',
        contact_name: business?.contact_name || '',
        email: business?.contact_email || '',
        phone: business?.phone_number || '',
        org_number: business?.org_number || '',
        f_skatt: business?.f_skatt_registered || false,
      },
      alreadySigned,
    })

  } catch (error: any) {
    console.error('Get public quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/quotes/public/[token] - Signera eller avböj offert
 * action: 'sign' (default) | 'decline'
 * Ingen auth krävs
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token
    const body = await request.json()
    const { action = 'sign', name, signature_data, reason } = body

    // Fetch quote by sign_token
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('quote_id, business_id, customer_id, status, signed_at, total, customer:customer_id(name)')
      .eq('sign_token', token)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json(
        { error: 'Offert hittades inte eller länken är ogiltig' },
        { status: 404 }
      )
    }

    if (quote.status === 'accepted' && quote.signed_at) {
      return NextResponse.json({ error: 'Offerten är redan signerad' }, { status: 400 })
    }

    if (quote.status === 'declined') {
      return NextResponse.json({ error: 'Offerten är redan avböjd' }, { status: 400 })
    }

    // ── Decline ───────────────────────────────────────────────────────────────
    if (action === 'decline') {
      if (!reason) {
        return NextResponse.json({ error: 'Ange ett skäl för avböjandet' }, { status: 400 })
      }

      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
          lost_reason: reason,
        })
        .eq('sign_token', token)

      if (updateError) throw updateError

      // Trigger agent automation for declined quote (non-blocking)
      try {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: quote.business_id,
          event: 'quote_declined',
          customerId: quote.customer_id,
          context: { quoteId: quote.quote_id, extraVariables: { reason } },
        })
      } catch { /* non-blocking */ }

      console.log(`[quote/public] Declined: ${quote.quote_id}, reason: ${reason}`)
      return NextResponse.json({ success: true })
    }

    // ── Sign ──────────────────────────────────────────────────────────────────
    if (!name || !signature_data) {
      return NextResponse.json({ error: 'Namn och signatur krävs' }, { status: 400 })
    }

    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        signed_at: new Date().toISOString(),
        signed_by_name: name,
        signed_by_ip: ip,
        signature_data,
        accepted_at: new Date().toISOString(),
      })
      .eq('sign_token', token)

    if (updateError) throw updateError

    // Pipeline: move deal to accepted on signature
    try {
      const { findDealByQuote, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
      const settings = await getAutomationSettings(quote.business_id)
      if (settings?.auto_move_on_signature) {
        const deal = await findDealByQuote(quote.business_id, quote.quote_id)
        if (deal) {
          await moveDeal({
            dealId: deal.id,
            businessId: quote.business_id,
            toStageSlug: 'accepted',
            triggeredBy: 'system',
          })
        }
      }
    } catch (pipelineErr) {
      console.error('Pipeline trigger error (non-blocking):', pipelineErr)
    }

    // Smart communication + notifications (non-blocking)
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId: quote.business_id,
        event: 'quote_signed',
        customerId: quote.customer_id,
        context: { quoteId: quote.quote_id },
      })

      try {
        const { notifyQuoteSigned } = await import('@/lib/notifications')
        await notifyQuoteSigned({
          businessId: quote.business_id,
          customerName: (quote.customer as any)?.name || 'Kund',
          quoteId: quote.quote_id,
          total: quote.total || 0,
        })
      } catch { /* non-blocking */ }

      try {
        const { handleProjectEvent } = await import('@/lib/project-ai-engine')
        await handleProjectEvent({
          type: 'quote_accepted',
          businessId: quote.business_id,
          quoteId: quote.quote_id,
        })
      } catch { /* non-blocking */ }
    } catch (commErr) {
      console.error('Communication trigger error (non-blocking):', commErr)
    }

    // Autopilot: förbered deal-to-delivery-paket
    try {
      const { triggerAutopilot } = await import('@/lib/autopilot/trigger')
      await triggerAutopilot(quote.business_id, quote.quote_id)
    } catch { /* non-blocking */ }

    // Bekräftelsemail till kund (non-blocking)
    try {
      const { sendQuoteSignedConfirmation } = await import('@/lib/quote-confirmation-email')
      await sendQuoteSignedConfirmation(quote.business_id, quote.quote_id)
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Quote public POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
