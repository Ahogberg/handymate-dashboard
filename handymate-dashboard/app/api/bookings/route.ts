import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import {
  syncBookingToCalendar,
  updateBookingInCalendar,
  deleteBookingFromCalendar,
} from '@/lib/google-calendar-sync'
import { computeBookingDayProgress, fetchProjectBookings } from '@/lib/bookings/day-progress'
import { notifyBookingAssignment } from '@/lib/notifications/schedule-push'
import { markCustomerContacted } from '@/lib/pipeline/contacted'

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
    const projectId = request.nextUrl.searchParams.get('project_id')
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

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    if (from) {
      query = query.gte('scheduled_start', from)
    }

    if (to) {
      query = query.lte('scheduled_start', to)
    }

    const { data: bookings, error } = await query

    if (error) throw error

    const list = bookings || []

    // ── Bulk-resolva relations ──────────────────────────────────────
    // Customer + project (för projekt-bokningar) + workflow_stage
    // (för stage-info per project) + project's egna bookings (för
    // day-progress). Samma TD-7 two-query-pattern som GET /api/projects.

    const customerIdSet = new Set<string>()
    const projectIdSet = new Set<string>()
    for (const b of list) {
      if (b.customer_id) customerIdSet.add(b.customer_id)
      if (b.project_id) projectIdSet.add(b.project_id)
    }

    const [customersRes, projectsRes, projectBookingsMap] = await Promise.all([
      customerIdSet.size > 0
        ? supabase
            .from('customer')
            .select('customer_id, name, phone_number, email')
            .in('customer_id', Array.from(customerIdSet))
        : Promise.resolve({ data: [] as any[] }),
      projectIdSet.size > 0
        ? supabase
            .from('project')
            .select('project_id, name, current_workflow_stage_id, status')
            .eq('business_id', business.business_id)
            .in('project_id', Array.from(projectIdSet))
        : Promise.resolve({ data: [] as any[] }),
      fetchProjectBookings(supabase, business.business_id, Array.from(projectIdSet)),
    ])

    const customerMap = new Map<string, any>()
    for (const c of (customersRes as any).data || []) {
      customerMap.set(c.customer_id, c)
    }

    const projectMap = new Map<string, any>()
    const stageIdSet = new Set<string>()
    for (const p of (projectsRes as any).data || []) {
      projectMap.set(p.project_id, p)
      if (p.current_workflow_stage_id) stageIdSet.add(p.current_workflow_stage_id)
    }

    // Workflow-stages — system (business_id IS NULL) + business-egna. Bulk-
    // fetch alla relevanta stages en gång för att kunna räkna completed_stages
    // och total_stages per projekt. Speglar /api/projects?include=workflow-
    // mönstret så mobile får samma fält-shape.
    const stagesMap = new Map<
      string,
      { id: string; name: string; position: number; color: string; icon: string }
    >()
    if (projectIdSet.size > 0) {
      const { data: stages } = await supabase
        .from('project_workflow_stages')
        .select('id, name, position, color, icon, business_id')
        .or(`business_id.is.null,business_id.eq.${business.business_id}`)
        .order('position', { ascending: true })
      for (const s of stages || []) {
        stagesMap.set(s.id, {
          id: s.id,
          name: s.name,
          position: s.position,
          color: s.color,
          icon: s.icon,
        })
      }
    }
    const totalStages = stagesMap.size

    const enriched = list.map((b: any) => {
      const project = b.project_id ? projectMap.get(b.project_id) || null : null
      const currentStage = project?.current_workflow_stage_id
        ? stagesMap.get(project.current_workflow_stage_id) || null
        : null
      const currentPosition = currentStage?.position ?? 0

      // completed_stages = alla stages med lägre position än current.
      // Tomt om projektet inte har en current_stage satt.
      const completedStages: string[] = []
      if (currentPosition > 0) {
        for (const s of Array.from(stagesMap.values())) {
          if (s.position < currentPosition) completedStages.push(s.id)
        }
      }

      const projectBookings = b.project_id ? projectBookingsMap.get(b.project_id) || [] : []
      const dayProgress = b.project_id
        ? computeBookingDayProgress(b.booking_id, projectBookings)
        : { current_day: 0, total_days: 0, is_final_day: false }

      return {
        ...b,
        customer: customerMap.get(b.customer_id) || null,
        project: project
          ? {
              project_id: project.project_id,
              name: project.name,
              status: project.status,
              current_stage_id: currentStage?.id ?? null,
              current_stage_name: currentStage?.name ?? null,
              current_stage_color: currentStage?.color ?? null,
              current_stage_icon: currentStage?.icon ?? null,
              current_stage_position: currentStage?.position ?? null,
              completed_stages: completedStages,
              total_stages: totalStages,
              stage_progress: completedStages.length,
            }
          : null,
        project_day: b.project_id
          ? { current: dayProgress.current_day, total: dayProgress.total_days }
          : null,
        is_final_day: dayProgress.is_final_day,
      }
    })

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
    const { customer_id, scheduled_start, scheduled_end, notes, service_type, assigned_user_id } = body

    if (!scheduled_start) {
      return NextResponse.json({ error: 'Missing scheduled_start' }, { status: 400 })
    }

    // Manuell tilldelning (valfri) — validera att business_user_id faktiskt
    // tillhör den här businessen innan skrivning. Samma valideringsmönster
    // som app/api/projects/[id]/team/route.ts POST.
    let assignedUserId: string | null = null
    let assignedToName: string | null = null
    if (assigned_user_id) {
      const { data: targetUser } = await supabase
        .from('business_users')
        .select('id, name')
        .eq('id', assigned_user_id)
        .eq('business_id', business.business_id)
        .eq('is_active', true)
        .single()

      if (!targetUser) {
        return NextResponse.json({ error: 'Vald tekniker hittades inte' }, { status: 400 })
      }
      assignedUserId = targetUser.id
      assignedToName = targetUser.name
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
        assigned_user_id: assignedUserId,
        assigned_to: assignedToName,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Kontaktad (2026-08-28): ett bokat besök är en kontakt — kundens öppna
    // affärer flyttas till Kontaktad (framåt-only, aldrig tillbaka).
    if (customer_id && booking) {
      await markCustomerContacted(supabase, business.business_id, customer_id, 'besök bokat')
    }

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

    // Project workflow stage: 'Startmöte bokat' (Del B, 2026-08-26) — genom
    // händelsebryggan: bokningens project_id först, annars kunden om hon
    // har EXAKT ett aktivt projekt (aldrig "senaste"). Forward-only, så en
    // bokning på ett pågående projekt rör inget. Sätter start_date om
    // projektet saknar ett. Andra bokningsvägar fångas av cronens ps-02-svep.
    if (customer_id || booking?.project_id) {
      try {
        const { bumpProjectStage } = await import('@/lib/project-stages/event-bridge')
        const flytt = await bumpProjectStage(
          business.business_id,
          { projectId: booking?.project_id || null, customerId: customer_id || null },
          'booking_created',
          { startDateHint: scheduled_start || null },
        )
        if (!flytt.moved && !flytt.skipped) console.error('[bookings] stegflytten misslyckades (non-blocking):', flytt.error, { projectId: flytt.projectId })
      } catch (err) {
        console.error('[bookings] bumpProjectStage booking_created failed (non-blocking):', err)
      }
    }

    // Auto-skapa projekt för OFFERT-LÖSA jobb: bokningen = åtagandet. Guarden
    // (kund utan aktivt projekt + ingen öppen offert) ligger i helpern, så vi
    // föregår aldrig accept-flödet. Icke-blockerande.
    if (customer_id) {
      try {
        const { maybeCreateProjectFromBooking } = await import('@/lib/projects/maybe-create-from-booking')
        const result = await maybeCreateProjectFromBooking(supabase, business.business_id, {
          customerId: customer_id,
          bookingId,
          serviceType: service_type || null,
          scheduledStart: scheduled_start || null,
        })
        if (result.created && result.project_id) {
          booking.project_id = result.project_id
          console.log(`[bookings] Auto-skapade projekt ${result.project_id} från bokning ${bookingId} (${result.reason})`)
        }
      } catch (projErr) {
        console.error('[bookings] maybeCreateProjectFromBooking failed (non-blocking):', projErr)
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

    // R4-D (resurs-masterplan.md): tidigare tilldelning + handlande person,
    // så vi efter en lyckad uppdatering kan avgöra om detta var en FAKTISK
    // ändring till en ANNAN person (för riktad push) — inte bara ett PUT
    // som råkar skicka med samma assigned_user_id, och aldrig vid
    // självtilldelning.
    let previousAssignedUserId: string | null = null
    let assigningActorId: string | null = null

    // Manuell tilldelning (valfri) — samma valideringsmönster som
    // app/api/projects/[id]/team/route.ts POST. Skickas inte fältet med
    // alls bevaras nuvarande beteende exakt (fältet rörs inte).
    //
    // Rollskydd (R2, tasks/resurs-masterplan.md): resurstavlans drag-drop-
    // tilldelning skriver hit — "employee ser tavlan men kan INTE dra/
    // tilldela" måste hålla även om anropet görs direkt mot API:et, inte
    // bara döljas i UI:t. Gäller ENDAST assigned_user_id-fältet; övriga
    // fält (status/tid/anteckningar) är oförändrade för alla roller.
    if (body.assigned_user_id !== undefined) {
      const currentUser = await getCurrentUser(request)
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) {
        return NextResponse.json({ error: 'Otillräcklig behörighet för att tilldela bokning' }, { status: 403 })
      }
      assigningActorId = currentUser.id

      const { data: prevBooking } = await supabase
        .from('booking')
        .select('assigned_user_id')
        .eq('booking_id', booking_id)
        .eq('business_id', business.business_id)
        .maybeSingle()
      previousAssignedUserId = prevBooking?.assigned_user_id ?? null

      if (body.assigned_user_id === null) {
        updates.assigned_user_id = null
        updates.assigned_to = null
      } else {
        const { data: targetUser } = await supabase
          .from('business_users')
          .select('id, name')
          .eq('id', body.assigned_user_id)
          .eq('business_id', business.business_id)
          .eq('is_active', true)
          .single()

        if (!targetUser) {
          return NextResponse.json({ error: 'Vald tekniker hittades inte' }, { status: 400 })
        }
        updates.assigned_user_id = targetUser.id
        updates.assigned_to = targetUser.name
      }
    }
    updates.updated_at = new Date().toISOString()

    const { data: booking, error } = await supabase
      .from('booking')
      .update(updates)
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    // R4-D: riktad mobilpush till den NYTILLDELADE teknikern — fire-and-
    // forget (aldrig await), pushar aldrig vid självtilldelning eller när
    // tilldelningen inte faktiskt ändrades.
    if (
      updates.assigned_user_id &&
      updates.assigned_user_id !== previousAssignedUserId &&
      updates.assigned_user_id !== assigningActorId
    ) {
      void notifyBookingAssignment({
        businessId: business.business_id,
        businessUserId: updates.assigned_user_id,
        customerId: booking.customer_id,
        scheduledStart: booking.scheduled_start,
      })
    }

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
