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
 * POST /api/quotes/public/[token] - Signera offert
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
    const { name, signature_data } = body

    if (!name || !signature_data) {
      return NextResponse.json(
        { error: 'Namn och signatur krävs' },
        { status: 400 }
      )
    }

    // Fetch quote by sign_token
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('quote_id, status, signed_at')
      .eq('sign_token', token)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json(
        { error: 'Offert hittades inte eller länken är ogiltig' },
        { status: 404 }
      )
    }

    // Check if already signed
    if (quote.status === 'accepted' && quote.signed_at) {
      return NextResponse.json(
        { error: 'Offerten är redan signerad' },
        { status: 400 }
      )
    }

    // Get client IP
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown'

    // Update quote with signature
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
      const { data: fullQuote } = await supabase
        .from('quotes')
        .select('quote_id, business_id')
        .eq('sign_token', token)
        .single()

      if (fullQuote) {
        const { findDealByQuote, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
        const settings = await getAutomationSettings(fullQuote.business_id)
        if (settings?.auto_move_on_signature) {
          const deal = await findDealByQuote(fullQuote.business_id, fullQuote.quote_id)
          if (deal) {
            await moveDeal({
              dealId: deal.id,
              businessId: fullQuote.business_id,
              toStageSlug: 'accepted',
              triggeredBy: 'system',
            })
          }
        }
      }
    } catch (pipelineErr) {
      console.error('Pipeline trigger error (non-blocking):', pipelineErr)
    }

    // Smart communication: trigger quote_signed event
    try {
      const { data: signedQuote } = await supabase
        .from('quotes')
        .select('quote_id, business_id, customer_id')
        .eq('sign_token', token)
        .single()

      if (signedQuote) {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: signedQuote.business_id,
          event: 'quote_signed',
          customerId: signedQuote.customer_id,
          context: { quoteId: signedQuote.quote_id },
        })
      }
    } catch (commErr) {
      console.error('Communication trigger error (non-blocking):', commErr)
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Sign quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
