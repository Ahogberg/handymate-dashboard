import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { halsning } from '@/lib/customers/namn'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

type BookingProposalType = 'propose_booking_times' | 'reschedule_request' | 'new_booking_request'
type Slot = { start: string; end: string; label: string }

export interface PreparedBookingTimes extends Record<string, unknown> {
  to: string
  customerId: string | null
  leadId: string | null
  message: string
  slots: Slot[]
  bookingId: string | null
}

const phone = /^\+?[0-9 ()-]{7,20}$/
const cleanSlots = (value: unknown): Slot[] => Array.isArray(value) ? value.slice(0, 3).map((slot: any) => {
  if (!slot || typeof slot.start !== 'string' || typeof slot.end !== 'string' || typeof slot.label !== 'string' ||
      !Number.isFinite(Date.parse(slot.start)) || !Number.isFinite(Date.parse(slot.end)) || Date.parse(slot.end) <= Date.parse(slot.start) || !slot.label.trim()) {
    throw new Error('Ett föreslaget tidsintervall är ogiltigt.')
  }
  return { start: slot.start, end: slot.end, label: slot.label.trim() }
}) : []

/**
 * Prepares ordinary Matte booking/reschedule proposals. These cards send an
 * SMS only; they never create or move a booking. The customer, optional
 * current booking and current calendar slots are read in the tenant scope and
 * frozen into the signed review. Execution may only use executionPayload.
 */
export async function prepareBookingTimesReview(
  db: SupabaseClient,
  businessId: string,
  type: BookingProposalType,
  payload: Record<string, any>,
  retrying = false,
): Promise<{ review: ApprovalReview; snapshot: Record<string, unknown>; executionPayload: PreparedBookingTimes; executionEvidence: Record<string, unknown> }> {
  const entity = payload.entity || {}
  const customerId = [entity.customerId, payload.customer_id].find(value => typeof value === 'string' && value) || null
  const leadId = [entity.leadId, payload.lead_id].find(value => typeof value === 'string' && value) || null
  if (!customerId && !leadId) throw new Error('Kunden eller kundförfrågan måste registreras innan tider kan skickas.')

  let target: { name?: string | null; phone: string | null } | null = null
  if (customerId) {
    const result = await db.from('customer').select('customer_id, name, phone_number')
      .eq('customer_id', customerId).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Kunden kunde inte verifieras i företaget.')
    target = { name: result.data.name, phone: result.data.phone_number }
  } else {
    const result = await db.from('leads').select('lead_id, name, phone')
      .eq('lead_id', leadId).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Kundförfrågan kunde inte verifieras i företaget.')
    target = { name: result.data.name, phone: result.data.phone }
  }
  const suppliedPhone = entity.phone || payload.customer_phone || payload.phone
  if (!target.phone || !phone.test(target.phone) || suppliedPhone && suppliedPhone !== target.phone) {
    throw new Error('Mottagarens aktuella telefonnummer kunde inte verifieras. Öppna ett nytt underlag.')
  }

  const configResult = await db.from('business_config').select('business_name, assigned_phone_number')
    .eq('business_id', businessId).maybeSingle()
  if (configResult.error || !configResult.data?.business_name) throw new Error('Företagets avsändare kunde inte verifieras.')
  const businessName = String(configResult.data.business_name)
  if (/\r|\n/.test(businessName)) throw new Error('Företagets avsändarnamn är ogiltigt.')

  const bookingId = [payload.booking_id, entity.bookingId].find(value => typeof value === 'string' && value) || null
  let booking: Record<string, any> | null = null
  if (bookingId) {
    const result = await db.from('booking')
      .select('booking_id, customer_id, project_id, scheduled_start, scheduled_end, status, assigned_to, assigned_user_id')
      .eq('booking_id', bookingId).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Den befintliga bokningen kunde inte verifieras i företaget.')
    if (customerId && result.data.customer_id && result.data.customer_id !== customerId) throw new Error('Bokningen tillhör inte den granskade kunden.')
    if (result.data.status === 'cancelled') throw new Error('Bokningen är avbokad. Ta fram ett nytt underlag.')
    booking = result.data
  }

  let project: Record<string, any> | null = null
  if (booking?.project_id) {
    const result = await db.from('project').select('project_id, name, status')
      .eq('project_id', booking.project_id).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Bokningens projekt kunde inte verifieras i företaget.')
    project = result.data
  }

  const previous = payload.execution_result?.review_evidence
  let slots: Slot[]
  let message: string
  if (retrying && previous?.kind === 'booking_times_proposal') {
    slots = cleanSlots(previous.slots)
    message = typeof previous.message === 'string' ? previous.message : ''
    if (previous.to !== target.phone || previous.customerId !== customerId || previous.leadId !== leadId || previous.bookingId !== bookingId) {
      throw new Error('Mottagaren eller bokningen har ändrats sedan det misslyckade försöket. Skapa ett nytt förslag.')
    }
  } else {
    const duration = Number(payload.duration_hours ?? 1)
    if (!Number.isFinite(duration) || duration < 0.5 || duration > 8) throw new Error('Besökets längd måste vara mellan 30 minuter och 8 timmar.')
    const { getAvailableSlots } = await import('@/lib/matte/calendar-slots')
    slots = cleanSlots(await getAvailableSlots(businessId, duration))
    if (!slots.length) throw new Error('Inga aktuella lediga tider kunde förberedas. Kontrollera kalenderkopplingen och försök igen.')
    const intro = type === 'reschedule_request' ? 'Vi kan erbjuda följande nya tider:' : 'Vi kan komma:'
    message = `${halsning(target.name)} ${intro}\n${slots.map((slot, index) => `${index + 1}) ${slot.label}`).join('\n')}\nSvara med numret som passar bäst. ${buildSmsSuffix(businessName, configResult.data.assigned_phone_number)}`
  }
  if (!message.trim() || /\{\{[^{}]+\}\}/.test(message)) throw new Error('Tidsförslagets meddelande är inte färdigt.')

  const currentBooking = booking
    ? `${booking.scheduled_start || 'starttid saknas'}–${booking.scheduled_end || 'sluttid saknas'} (${booking.status || 'status saknas'})`
    : type === 'reschedule_request' ? 'Ingen specifik bokning angiven; meddelandet flyttar därför ingen bokning' : 'Ingen befintlig bokning berörs'
  const projectEffect = project ? `Ingen ändring i ${project.name || project.project_id}` : 'Ingen projektändring'
  const responsible = booking?.assigned_to || 'Inte tilldelad'
  const executionPayload: PreparedBookingTimes = { to: target.phone, customerId, leadId, message, slots, bookingId }
  const executionEvidence = {
    kind: 'booking_times_proposal', ...executionPayload, targetName: target.name || 'Namn saknas',
    currentBooking, responsible, calendarEffect: 'Ingen bokning skapas eller flyttas', projectEffect,
    customerConfirmation: 'Kundens svar hanteras separat innan kalendern ändras', retryOfFailedDelivery: retrying,
  }
  return {
    executionPayload,
    executionEvidence,
    snapshot: { bookingTimesProposal: executionEvidence },
    review: {
      title: `${retrying ? 'Försök skicka igen' : 'Granska tidsförslag'} — ${target.name || 'mottagaren'}`,
      effect: `${retrying ? 'Försöker endast skicka om det tidigare misslyckade SMS:et.' : 'Skickar exakt SMS-texten nedan.'} Ingen bokning skapas eller flyttas, ingen ansvarig eller projektstatus ändras och kundens svar hanteras separat.`,
      confirmLabel: retrying ? 'Skicka samma tidsförslag igen' : 'Skicka de granskade tiderna',
      messages: [{ channel: 'SMS', recipients: [target.phone], text: message }],
      details: [
        { label: customerId ? 'Kund' : 'Kundförfrågan', text: target.name || 'Namn saknas' },
        { label: 'Befintlig bokning', text: currentBooking },
        { label: 'Ansvarig', text: responsible },
        { label: 'Kalenderföljd', text: executionEvidence.calendarEffect },
        { label: 'Projektföljd', text: projectEffect },
        { label: 'Kundbekräftelse', text: executionEvidence.customerConfirmation },
        ...slots.map((slot, index) => ({ label: `Tid ${index + 1}`, text: `${slot.label} (${slot.start} – ${slot.end})` })),
      ],
    },
  }
}
