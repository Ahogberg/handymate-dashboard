import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'

/**
 * GET /api/portal - Kundportal: hämta kundens data via token
 * Query: token (portal_token från customer-tabellen)
 * Returnerar: bokningar, fakturor, offerter, garantier
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Find customer by portal token
    const { data: customer, error: custError } = await supabase
      .from('customer')
      .select('customer_id, business_id, name, email, phone_number, portal_enabled')
      .eq('portal_token', token)
      .single()

    if (custError || !customer) {
      return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })
    }

    if (!customer.portal_enabled) {
      return NextResponse.json({ error: 'Portalen är inte aktiverad' }, { status: 403 })
    }

    // Update last visited
    await supabase
      .from('customer')
      .update({ portal_last_visited_at: new Date().toISOString() })
      .eq('customer_id', customer.customer_id)

    // Fetch bookings
    const { data: bookings } = await supabase
      .from('booking')
      .select('booking_id, scheduled_start, scheduled_end, status, notes, service_type')
      .eq('customer_id', customer.customer_id)
      .eq('business_id', customer.business_id)
      .order('scheduled_start', { ascending: false })
      .limit(20)

    // Fetch invoices (limited fields)
    const { data: invoices } = await supabase
      .from('invoice')
      .select('invoice_id, invoice_number, invoice_date, due_date, total, status, rot_rut_type, customer_pays')
      .eq('customer_id', customer.customer_id)
      .eq('business_id', customer.business_id)
      .order('invoice_date', { ascending: false })
      .limit(20)

    // Fetch quotes
    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_id, status, total, customer_pays, valid_until, created_at')
      .eq('customer_id', customer.customer_id)
      .eq('business_id', customer.business_id)
      .order('created_at', { ascending: false })
      .limit(20)

    // Fetch warranties
    const { data: warranties } = await supabase
      .from('warranty')
      .select('warranty_id, title, description, start_date, end_date, status, warranty_type')
      .eq('customer_id', customer.customer_id)
      .eq('business_id', customer.business_id)
      .order('end_date', { ascending: false })

    // Get business name
    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('business_name, contact_email, contact_phone')
      .eq('business_id', customer.business_id)
      .single()

    return NextResponse.json({
      customer: {
        name: customer.name,
        email: customer.email,
      },
      business: {
        name: businessConfig?.business_name || '',
        email: businessConfig?.contact_email || '',
        phone: businessConfig?.contact_phone || '',
      },
      bookings: bookings || [],
      invoices: invoices || [],
      quotes: quotes || [],
      warranties: warranties || [],
    })
  } catch (error: any) {
    console.error('Portal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/portal - Kundportal: kund-åtgärd (t.ex. acceptera offert)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, action, quote_id } = body

    if (!token) {
      return NextResponse.json({ error: 'Token krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Verify token
    const { data: customer, error: custError } = await supabase
      .from('customer')
      .select('customer_id, business_id, name, portal_enabled')
      .eq('portal_token', token)
      .single()

    if (custError || !customer || !customer.portal_enabled) {
      return NextResponse.json({ error: 'Ogiltig åtgärd' }, { status: 403 })
    }

    if (action === 'accept_quote' && quote_id) {
      // .select() krävs för att veta om NÅGON rad faktiskt uppdaterades.
      // Utan den svarade routen "success" även när offerten redan var
      // accepterad eller avböjd — och alla nedströmshändelser (projekt, deal,
      // bekräftelse) fyrades av en gång till på samma offert.
      const { data: updatedRows, error } = await supabase
        .from('quotes')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('quote_id', quote_id)
        .eq('customer_id', customer.customer_id)
        .eq('business_id', customer.business_id)
        .in('status', [...OPEN_QUOTE_STATUSES])
        .select('quote_id, quote_number, title, total')

      if (error) throw error

      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.json(
          { error: 'Offerten går inte att acceptera — den är redan besvarad eller har gått ut.' },
          { status: 409 },
        )
      }

      const acceptedQuote = updatedRows[0]

      // Förväntad marginal vid accept — icke-blockerande (se lib/quotes/margin-snapshot.ts).
      try {
        const { captureExpectedMarginSnapshot } = await import('@/lib/quotes/margin-snapshot')
        await captureExpectedMarginSnapshot(supabase, customer.business_id, quote_id, 'portal_accept')
      } catch (err) {
        console.error('[portal] captureExpectedMarginSnapshot failed (non-blocking):', quote_id, err)
      }

      // Log activity
      await supabase.from('customer_activity').insert({
        customer_id: customer.customer_id,
        business_id: customer.business_id,
        activity_type: 'quote_accepted',
        title: 'Offert accepterad via kundportal',
        description: `Kund accepterade offert ${quote_id}`,
        created_by: 'portal',
      })

      // V3 Automation Engine: fire quote_signed + quote_accepted events
      try {
        const { fireEvent } = await import('@/lib/automation-engine')
        await fireEvent(supabase, 'quote_signed', customer.business_id, {
          quote_id,
          customer_id: customer.customer_id,
        })
      } catch { /* non-blocking */ }

      // Smart communication: notifiera hantverkare
      try {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: customer.business_id,
          event: 'quote_signed',
          customerId: customer.customer_id,
          context: { quoteId: quote_id },
        })
      } catch { /* non-blocking */ }

      // Push-notis
      try {
        const { notifyQuoteSigned } = await import('@/lib/notifications')
        const { data: q } = await supabase.from('quotes').select('total').eq('quote_id', quote_id).single()
        await notifyQuoteSigned({
          businessId: customer.business_id,
          customerName: customer.name || 'Kund',
          quoteId: quote_id,
          total: q?.total || 0,
        })
      } catch { /* non-blocking */ }

      // Autopilot
      try {
        const { triggerAutopilot } = await import('@/lib/autopilot/trigger')
        await triggerAutopilot(customer.business_id, quote_id)
      } catch { /* non-blocking */ }

      // Samma avslutskedja som kundens signering: bekräftelse, projekt och
      // deal→vunnen. Låg tidigare bara i signeringsvägen, vilket gjorde
      // portal-accept till en halv accept — vunnen offert utan jobb.
      const { finalizeAcceptedQuote } = await import('@/lib/quotes/finalize-accepted')
      await finalizeAcceptedQuote(supabase, {
        businessId: customer.business_id,
        quoteId: quote_id,
        quoteNumber: (acceptedQuote as any)?.quote_number || null,
        quoteTitle: (acceptedQuote as any)?.title || null,
        customerId: customer.customer_id,
        customerName: customer.name || null,
        total: (acceptedQuote as any)?.total ?? null,
        source: 'kundportal',
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'decline_quote' && quote_id) {
      // declined_at OCH lost_reason sattes inte här tidigare. Följden: kundens
      // avböjande syntes aldrig i offertens tidslinje (som villkorar på
      // declined_at) och räknades aldrig i förlustanalysen. Skälet är
      // frivilligt i portalen — men fältet ska finnas när det ges.
      const { parseDeclineReasonCode, buildLostReason } = await import('@/lib/quotes/decline-reasons')
      const declineCode = parseDeclineReasonCode(body.reason_code)
      const declineFreeText = typeof body.reason === 'string' ? body.reason.trim() : ''
      const declineReason = buildLostReason(declineCode, declineFreeText)

      const { data: declinedRows, error } = await supabase
        .from('quotes')
        .update({ status: 'declined', declined_at: new Date().toISOString() })
        .eq('quote_id', quote_id)
        .eq('customer_id', customer.customer_id)
        .eq('business_id', customer.business_id)
        .in('status', [...OPEN_QUOTE_STATUSES])
        .select('quote_id')

      if (error) throw error

      if (!declinedRows || declinedRows.length === 0) {
        return NextResponse.json(
          { error: 'Offerten går inte att avböja — den är redan besvarad eller har gått ut.' },
          { status: 409 },
        )
      }

      // Separat, best-effort: lost_reason är en valfri kolumn (samma mönster
      // som kundvyns avböjande) och får aldrig fälla själva avböjandet.
      if (declineReason) {
        const { error: reasonErr } = await supabase
          .from('quotes')
          .update({ lost_reason: declineReason })
          .eq('quote_id', quote_id)
          .eq('business_id', customer.business_id)
        if (reasonErr) {
          console.warn('[portal] lost_reason kunde inte sparas (icke-blockerande):', reasonErr.message)
        }
      }

      await supabase.from('customer_activity').insert({
        customer_id: customer.customer_id,
        business_id: customer.business_id,
        activity_type: 'quote_declined',
        title: 'Offert avböjd via kundportal',
        description: declineFreeText
          ? `Kund avböjde offert ${quote_id}: ${declineFreeText}`
          : `Kund avböjde offert ${quote_id}`,
        created_by: 'portal',
      })

      try {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: customer.business_id,
          event: 'quote_declined',
          customerId: customer.customer_id,
          context: { quoteId: quote_id },
        })
      } catch { /* non-blocking */ }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Okänd åtgärd' }, { status: 400 })
  } catch (error: any) {
    console.error('Portal action error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
