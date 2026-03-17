import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista bokningar för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const status = request.nextUrl.searchParams.get('status')
    const customerId = request.nextUrl.searchParams.get('customerId')
    const from = request.nextUrl.searchParams.get('from')
    const to = request.nextUrl.searchParams.get('to')

    let query = supabase
      .from('booking')
      .select('*')
      .eq('business_id', business.business_id)
      .order('scheduled_start', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    if (from) {
      query = query.gte('scheduled_start', from)
    }

    if (to) {
      query = query.lte('scheduled_start', to)
    }

    const { data: bookings, error } = await query

    if (error) throw error

    // Build customer map
    const customerIdSet: Record<string, boolean> = {}
    for (const b of bookings || []) {
      if (b.customer_id) customerIdSet[b.customer_id] = true
    }
    const customerIds = Object.keys(customerIdSet)
    const customerMap: Record<string, any> = {}

    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email')
        .in('customer_id', customerIds)

      for (const c of customers || []) {
        customerMap[c.customer_id] = c
      }
    }

    const enriched = (bookings || []).map((b: any) => ({
      ...b,
      customer: customerMap[b.customer_id] || null,
    }))

    return NextResponse.json({ bookings: enriched })
  } catch (error: any) {
    console.error('Get bookings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny bokning
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { customer_id, scheduled_start, scheduled_end, notes, service_type } = body

    if (!scheduled_start) {
      return NextResponse.json({ error: 'Missing scheduled_start' }, { status: 400 })
    }

    const bookingId = 'book_' + Math.random().toString(36).substr(2, 9)

    const { data: booking, error } = await supabase
      .from('booking')
      .insert({
        booking_id: bookingId,
        business_id: business.business_id,
        customer_id: customer_id || null,
        scheduled_start,
        scheduled_end: scheduled_end || null,
        status: 'confirmed',
        notes: [service_type, notes].filter(Boolean).join(' — ') || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Smart dispatch — föreslå tekniker (non-blocking)
    try {
      const { suggestDispatch } = await import('@/lib/dispatch')
      // Hämta kundnamn för kontextvisning
      let customerName: string | null = null
      if (customer_id) {
        const { data: cust } = await supabase.from('customer').select('name').eq('customer_id', customer_id).maybeSingle()
        customerName = cust?.name || null
      }
      await suggestDispatch({
        businessId: business.business_id,
        jobTitle: service_type || notes || 'Bokning',
        jobAddress: body.address || null,
        scheduledStart: scheduled_start,
        scheduledEnd: scheduled_end || null,
        jobType: service_type || '',
        contextType: 'booking',
        contextId: bookingId,
        customerName,
      })
    } catch (dispatchErr) {
      console.error('Dispatch suggestion error (non-blocking):', dispatchErr)
    }

    return NextResponse.json({ booking })
  } catch (error: any) {
    console.error('Create booking error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera bokning
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { booking_id } = body

    if (!booking_id) {
      return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })
    }

    const updates: Record<string, any> = {}
    if (body.scheduled_start !== undefined) updates.scheduled_start = body.scheduled_start
    if (body.scheduled_end !== undefined) updates.scheduled_end = body.scheduled_end
    if (body.status !== undefined) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes
    updates.updated_at = new Date().toISOString()

    const { data: booking, error } = await supabase
      .from('booking')
      .update(updates)
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ booking })
  } catch (error: any) {
    console.error('Update booking error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort bokning
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const bookingId = request.nextUrl.searchParams.get('bookingId')

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('booking')
      .delete()
      .eq('booking_id', bookingId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete booking error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
