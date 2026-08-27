/**
 * Delade typer för TodayView-uppdelningen (R4-A, tasks/resurs-masterplan.md).
 * Flyttade oförändrade ur TodayView.tsx — samma shape, ingen beteendeändring.
 */

export interface TimeEntry {
  time_entry_id: string
  booking_id: string | null
  customer_id: string | null
  work_type_id: string | null
  project_id: string | null
  business_user_id: string | null
  description: string | null
  work_date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  hourly_rate: number | null
  is_billable: boolean
  invoiced: boolean
  invoice_id: string | null
  approval_status?: 'pending' | 'approved' | 'rejected'
  rejection_reason?: string | null
  break_minutes?: number
  created_at: string
  start_latitude?: number | null
  start_longitude?: number | null
  start_address?: string | null
  end_latitude?: number | null
  end_longitude?: number | null
  end_address?: string | null
  customer?: { customer_id: string; name: string }
  booking?: { booking_id: string; notes: string }
  work_type?: { work_type_id: string; name: string; multiplier: number }
  business_user?: { id: string; name: string; color: string } | null
}

export interface TeamMemberBasic {
  id: string
  name: string
  color: string
}

export interface WorkType {
  work_type_id: string
  name: string
  multiplier: number
  billable_default: boolean
  sort_order: number
}

export interface Customer {
  customer_id: string
  name: string
}

export interface Booking {
  booking_id: string
  notes: string
  customer_id: string
  customer?: { name: string }
}

export interface Stats {
  totalMinutesWeek: number
  billableMinutesWeek: number
  totalMinutesMonth: number
  entriesThisWeek: number
  uninvoicedMinutes: number
  uninvoicedRevenue: number
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
