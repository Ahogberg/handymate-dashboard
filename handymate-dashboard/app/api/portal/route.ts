import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

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
    const { token, action, quote_id } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Verify token
    const { data: customer, error: custError } = await supabase
      .from('customer')
      .select('customer_id, business_id, portal_enabled')
      .eq('portal_token', token)
      .single()

    if (custError || !customer || !customer.portal_enabled) {
      return NextResponse.json({ error: 'Ogiltig åtgärd' }, { status: 403 })
    }

    if (action === 'accept_quote' && quote_id) {
      const { error } = await supabase
        .from('quotes')
        .update({ status: 'accepted' })
        .eq('quote_id', quote_id)
        .eq('customer_id', customer.customer_id)
        .eq('business_id', customer.business_id)
        .in('status', ['sent', 'opened'])

      if (error) throw error

      // Log activity
      await supabase.from('customer_activity').insert({
        customer_id: customer.customer_id,
        business_id: customer.business_id,
        activity_type: 'quote_accepted',
        title: 'Offert accepterad via kundportal',
        description: `Kund accepterade offert ${quote_id}`,
        created_by: 'portal',
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'decline_quote' && quote_id) {
      const { error } = await supabase
        .from('quotes')
        .update({ status: 'declined' })
        .eq('quote_id', quote_id)
        .eq('customer_id', customer.customer_id)
        .eq('business_id', customer.business_id)
        .in('status', ['sent', 'opened'])

      if (error) throw error

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Okänd åtgärd' }, { status: 400 })
  } catch (error: any) {
    console.error('Portal action error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
