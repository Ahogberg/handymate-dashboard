import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { fetchPersonDays } from '@/lib/schedule/person-day'
import { assessDispatchCandidate } from '@/lib/schedule/dispatch-assessment'
import { svDateStr } from '@/lib/dates'

/**
 * POST /api/schema/assign-preview — resurstavlans dispatch-bedömning
 * (R2, tasks/resurs-masterplan.md, punkt 4). Bedömer EN specifik kandidat
 * mot EN specifik bokning: kompetensmatch (lib/dispatch.ts-logiken) +
 * krock samma dag (persondagen). Skapar ingen approval, ändrar ingen data
 * — ren "vad händer om"-läsning som drag-drop-bekräftelsen och
 * mobilens tilldela-sheet visar innan användaren bekräftar.
 *
 * Rollskydd: samma som själva tilldelningen (PUT /api/bookings med
 * assigned_user_id) — endast owner/admin. En anställd ska varken kunna
 * förhandsgranska eller genomföra en tilldelning (resurs-masterplan.md,
 * R2 "Regler": "employee ser tavlan men kan INTE dra/tilldela").
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const body = await request.json()
    const { booking_id, member_id } = body
    if (!booking_id || !member_id) {
      return NextResponse.json({ error: 'Missing booking_id or member_id' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data: booking } = await supabase
      .from('booking')
      .select('booking_id, scheduled_start, scheduled_end, notes, assigned_user_id, status')
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!booking) {
      return NextResponse.json({ error: 'Bokningen hittades inte' }, { status: 404 })
    }
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'Bokningen är avbokad' }, { status: 400 })
    }

    const { data: member } = await supabase
      .from('business_users')
      .select('id, name, skills, specialties, is_active')
      .eq('id', member_id)
      .eq('business_id', business.business_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Teammedlemmen hittades inte' }, { status: 404 })
    }

    const bookingStart = booking.scheduled_start
    const bookingEnd = booking.scheduled_end || booking.scheduled_start
    const date = svDateStr(new Date(bookingStart))

    const personDays = await fetchPersonDays(supabase, business.business_id, [member.id], date, date)
    const existingShifts = (personDays[0]?.shifts || []).filter((s) => s.refId !== booking_id)

    const assessment = assessDispatchCandidate({
      member,
      jobText: booking.notes || '',
      bookingStart,
      bookingEnd,
      existingShifts,
    })

    return NextResponse.json({
      assessment,
      member: { id: member.id, name: member.name },
      booking: {
        booking_id: booking.booking_id,
        scheduled_start: booking.scheduled_start,
        scheduled_end: booking.scheduled_end,
        already_assigned_to: booking.assigned_user_id,
      },
    })
  } catch (error: any) {
    console.error('Assign preview error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
