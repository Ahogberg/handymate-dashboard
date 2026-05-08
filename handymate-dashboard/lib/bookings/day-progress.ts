import type { SupabaseClient } from '@supabase/supabase-js'

export interface BookingDayProgress {
  /** 1-baserad position i projektets booking-sekvens. 0 om bokningen inte tillhör projektet. */
  current_day: number
  /** Antal bookings totalt för projektet. 0 för bookings utan project_id. */
  total_days: number
  /** True när current_day === total_days. False för bookings utan project_id. */
  is_final_day: boolean
}

interface BookingTimestamp {
  booking_id: string
  scheduled_start: string
}

/**
 * Beräknar "dag X av Y" för en booking inom ett projekt.
 *
 * Variant B (dynamisk): Y = total bookings för project, X = position
 * av denna booking i scheduled_start-sorterad sekvens. Returnerar
 * { current_day: 0, total_days: 0, is_final_day: false } om bookingen
 * inte hittas i listan eller listan är tom.
 *
 * Edge case — bokningar med samma scheduled_start: stable sort behåller
 * insättningsordningen från Supabase (oftast created_at). Inte garanterat
 * deterministiskt mellan refetches men acceptabelt för pilot.
 *
 * Edge case — hantverkaren bokar om dagar mitt i projektet: total_days
 * ändras dynamiskt. TD-17 dokumenterar manuell project.expected_days-
 * override om Christoffer ber om det.
 */
export function computeBookingDayProgress(
  bookingId: string,
  projectBookings: BookingTimestamp[],
): BookingDayProgress {
  if (!projectBookings.length) {
    return { current_day: 0, total_days: 0, is_final_day: false }
  }
  const sorted = [...projectBookings].sort(
    (a, b) =>
      new Date(a.scheduled_start).getTime() -
      new Date(b.scheduled_start).getTime(),
  )
  const idx = sorted.findIndex(b => b.booking_id === bookingId)
  if (idx === -1) {
    return { current_day: 0, total_days: sorted.length, is_final_day: false }
  }
  const currentDay = idx + 1
  return {
    current_day: currentDay,
    total_days: sorted.length,
    is_final_day: currentDay === sorted.length,
  }
}

/**
 * Bulk-fetch bookings för en uppsättning project_ids. Returnerar Map:
 * project_id → array av { booking_id, scheduled_start }.
 *
 * Används av list-routes (t.ex. GET /api/bookings) som returnerar många
 * bookings — gör en query för alla projects istället för en per booking
 * när computeBookingDayProgress kallas.
 */
export async function fetchProjectBookings(
  supabase: SupabaseClient,
  businessId: string,
  projectIds: string[],
): Promise<Map<string, BookingTimestamp[]>> {
  const map = new Map<string, BookingTimestamp[]>()
  if (!projectIds.length) return map

  const { data, error } = await supabase
    .from('booking')
    .select('booking_id, project_id, scheduled_start')
    .eq('business_id', businessId)
    .in('project_id', projectIds)

  if (error) {
    console.error('[day-progress] fetchProjectBookings error:', error)
    return map
  }

  for (const b of data || []) {
    if (!b.project_id || !b.scheduled_start) continue
    const arr = map.get(b.project_id) || []
    arr.push({ booking_id: b.booking_id, scheduled_start: b.scheduled_start })
    map.set(b.project_id, arr)
  }
  return map
}
