/** Timestamp pairs measure elapsed lead time, never counterfactual labour saved. */
export const ESTIMATED_MINUTES_PER_BOOKING_REMINDER = 5
export const ESTIMATED_MINUTES_PER_PIPELINE_UPDATE = 2
export const RUN_MINUTES: Record<string, number> = { phone_call: 12, incoming_sms: 6 }
export const RUN_DEFAULT = 10
export const ACTION_MINUTES: Record<string, number> = {
  send_sms: 6, send_email: 6, send_reminder: 12, send_invoice_reminder: 12,
  create_booking: 10, schedule_followup: 10, notify_owner: 4, create_approval: 4,
}
export const ACTION_DEFAULT = 6

export function measureElapsedMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const a = Date.parse(start), b = Date.parse(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.round((b - a) / 60) / 1000
}
export function timeObservation(start: string | null, end: string | null, estimate: number) {
  if (!Number.isFinite(estimate) || estimate < 0) throw new Error('invalid_time_estimate')
  const minutes = measureElapsedMinutes(start, end)
  return minutes === null
    ? { minutes: estimate, minutes_basis: 'estimate' as const, metric: 'estimated_labour_minutes' as const, estimate_basis: { minutes: estimate, method: 'V1 activity estimate; not measured' } }
    : { minutes, minutes_basis: 'measured' as const, metric: 'elapsed_minutes' as const, started_at: start, ended_at: end }
}
export interface ValueTimeTotals {
  /** Elapsed workflow time, NOT saved labour. Never add this to estimated_minutes. */
  measured_minutes: number
  estimated_minutes: number
  measured_minutes_basis: 'elapsed_workflow_time_not_labour_saved'
}
export function sumValueTime(events: Array<{ event_type: string; minutes: number | string | null }>): ValueTimeTotals {
  let measured = 0, estimated = 0
  for (const e of events) {
    const n = Number(e.minutes)
    if (!Number.isFinite(n) || n < 0) continue
    if (e.event_type === 'time_measured') measured += n
    if (e.event_type === 'time_estimated') estimated += n
  }
  return { measured_minutes: measured, estimated_minutes: estimated, measured_minutes_basis: 'elapsed_workflow_time_not_labour_saved' }
}
