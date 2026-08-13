/** Delade typer för resurstavlan (R2, tasks/resurs-masterplan.md). */

export interface ResourceTeamMember {
  id: string
  name: string
  color: string
  role: string
  is_active: boolean
}

/** En bokning från /api/bookings, enriched med kund/projekt — täcker
 * både "Obemannade"-raden (assigned_user_id === null) och namn-lookup
 * för ShiftDetailSheet (booking-typade pass i persondagen). */
export interface WeekBooking {
  booking_id: string
  scheduled_start: string
  scheduled_end: string | null
  notes: string | null
  assigned_user_id: string | null
  project_id: string | null
  customer_id: string | null
  customer?: { name: string } | null
  project?: { name: string } | null
  /** "Visa varför"-utrullning, Fall 4 (docs/design/SYNLIG-INTELLIGENS.md) —
      Lars sparade tilldelningsresonemang. GET /api/bookings selectar redan
      '*' så fältet följer med utan API-ändring. */
  dispatch_reasoning?: import('@/components/dispatch/DispatchReasoning').DispatchReasoningData | null
}

export function bookingTitle(b: WeekBooking): string {
  return (b.notes && b.notes.trim()) || 'Bokning'
}
