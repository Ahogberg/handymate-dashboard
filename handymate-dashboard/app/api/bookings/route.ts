import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import {
  syncBookingToCalendar,
  updateBookingInCalendar,
  deleteBookingFromCalendar,
} from '@/lib/google-calendar-sync'

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
    const combinedNotes = [service_type, notes].filter(Boolean).join(' — ') || null

    const { data: booking, error } = await supabase
      .from('booking')
      .insert({
        booking_id: bookingId,
        business_id: business.business_id,
        customer_id: customer_id || null,
        scheduled_start,
        scheduled_end: scheduled_end || null,
        status: 'confirmed',
        notes: combinedNotes,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Hämta kundnamn för dispatch + calendar (en gång)
    let customerName: string | null = null
    if (customer_id) {
      const { data: cust } = await supabase
        .from('customer')
        .select('name')
        .eq('customer_id', customer_id)
        .maybeSingle()
      customerName = cust?.name || null
    }

    // Google Calendar sync (non-blocking)
    try {
      const result = await syncBookingToCalendar(
        supabase,
        business.business_id,
        business.user_id,
        {
          booking_id: bookingId,
          scheduled_start,
          scheduled_end: scheduled_end || null,
          notes: combinedNotes,
          customer_name: customerName,
        }
      )

      if (result) {
        await supabase
          .from('booking')
          .update({
            google_event_id: result.eventId,
            google_calendar_id: result.calendarId,
          })
          .eq('booking_id', bookingId)

        // Reflektera i returnerad booking så frontend ser sync-status direkt
        booking.google_event_id = result.eventId
        booking.google_calendar_id = result.calendarId
      }
    } catch (syncErr) {
      console.error('Calendar sync error (non-blocking):', syncErr)
    }

    // Smart dispatch — föreslå tekniker (non-blocking)
    try {
      const { suggestDispatch } = await import('@/lib/dispatch')
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

    // Project workflow stage: 'Startmöte bokat' när första bokningen skapas
    // mot ett projekt där kunden just har signerat kontrakt (stage ps-01).
    // Booking saknar direkt project_id — vi joinar via customer_id och letar
    // efter ett projekt i CONTRACT_SIGNED-fasen.
    if (customer_id) {
      try {
        const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
        const { data: pendingProjects } = await supabase
          .from('project')
          .select('project_id, current_workflow_stage_id, created_at')
          .eq('business_id', business.business_id)
          .eq('customer_id', customer_id)
          .eq('current_workflow_stage_id', SYSTEM_STAGES.CONTRACT_SIGNED)
          .order('created_at', { ascending: false })
          .limit(1)

        const project = pendingProjects?.[0]
        if (project) {
          await advanceProjectStage(project.project_id, SYSTEM_STAGES.MEETING_BOOKED, business.business_id)
        }
      } catch (err) {
        console.error('[bookings] advanceProjectStage MEETING_BOOKED failed:', err)
      }
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

    // Sync ändringar till Google Calendar (non-blocking)
    if (booking.google_event_id && booking.google_calendar_id) {
      try {
        // Hämta kundnamn för uppdaterad event-titel
        let customerName: string | null = null
        if (booking.customer_id) {
          const { data: cust } = await supabase
            .from('customer')
            .select('name')
            .eq('customer_id', booking.customer_id)
            .maybeSingle()
          customerName = cust?.name || null
        }

        // Vid status='cancelled' → ta bort från Google Calendar
        if (body.status === 'cancelled') {
          await deleteBookingFromCalendar(
            supabase,
            business.business_id,
            business.user_id,
            booking.google_event_id,
            booking.google_calendar_id
          )
          await supabase
            .from('booking')
            .update({ google_event_id: null, google_calendar_id: null })
            .eq('booking_id', booking_id)
        } else {
          await updateBookingInCalendar(
            supabase,
            business.business_id,
            business.user_id,
            booking.google_event_id,
            booking.google_calendar_id,
            {
              scheduled_start: booking.scheduled_start,
              scheduled_end: booking.scheduled_end,
              notes: booking.notes,
              customer_name: customerName,
            }
          )
        }
      } catch (syncErr) {
        console.error('Calendar update error (non-blocking):', syncErr)
      }
    }

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

    // Hämta bokningen först så vi vet om Google-event behöver tas bort
    const { data: existing } = await supabase
      .from('booking')
      .select('google_event_id, google_calendar_id')
      .eq('booking_id', bookingId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    const { error } = await supabase
      .from('booking')
      .delete()
      .eq('booking_id', bookingId)
      .eq('business_id', business.business_id)

    if (error) throw error

    // Sync borttagning till Google Calendar (non-blocking)
    if (existing?.google_event_id && existing?.google_calendar_id) {
      try {
        await deleteBookingFromCalendar(
          supabase,
          business.business_id,
          business.user_id,
          existing.google_event_id,
          existing.google_calendar_id
        )
      } catch (syncErr) {
        console.error('Calendar delete error (non-blocking):', syncErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete booking error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
