/**
 * createBooking — service-role-kapabel boknings-skapande.
 *
 * Extraherad ur POST i app/api/bookings/route.ts (Steg 1, execution-chain).
 * Routens POST är nu en tunn wrapper (auth → createBooking). execute.ts
 * (Steg 3) anropar samma funktion direkt — en sanning, ingen dubbel-väg.
 * (GET/PUT/DELETE i routen rör inte execution-chain och lämnas orörda.)
 *
 * Beteende EXAKT som gamla POST-bodyn: samma insert, kundnamn-fetch,
 * Google Calendar-sync (+ reflektera google-id på returnerad booking),
 * smart dispatch-förslag, och project-stage MEETING_BOOKED. Inga sidoeffekter
 * tappade. Insert-fel kastas (som originalet) → wrappern fångar → 500.
 *
 * Tar `business` (business_config-raden) för business_id + user_id (calendar-
 * sync behöver båda), och `body` (parsad request-JSON) — service-vägen kan
 * skapa samma body. body.business_id ignoreras precis som originalet (auth-
 * businessen styr).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { syncBookingToCalendar } from '@/lib/google-calendar-sync'

export async function createBooking(
  supabase: SupabaseClient,
  business: any,
  body: Record<string, any>,
): Promise<{ status: number; body: any }> {
  const { customer_id, scheduled_start, scheduled_end, notes, service_type } = body

  if (!scheduled_start) {
    return { status: 400, body: { error: 'Missing scheduled_start' } }
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

  return { status: 200, body: { booking } }
}
