import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { computeAvailableSlots, stockholmLocalToISO } from '@/lib/bookings/availability'
import { buildBookingConfirmationSms } from '@/lib/bookings/confirmation-sms'

export interface PreparedQuoteSigningBooking extends Record<string, unknown> {
  customerId: string
  customerName: string
  customerPhone: string | null
  quoteId: string
  quoteTitle: string
  requestedDate: string
  scheduledStart: string
  scheduledEnd: string
  projectId: string | null
  notes: string
  confirmationMessage: string | null
}

const phone = /^\+?[0-9 ()-]{7,20}$/
const isoDayAfter = (date: string) => {
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

/** Freeze the exact booking row and optional confirmation SMS that the
 * executor is allowed to create. Availability is rechecked for every review,
 * so a stale customer wish never becomes a silent double booking. */
export async function prepareQuoteSigningBookingReview(
  db: SupabaseClient,
  businessId: string,
  approvalId: string,
  payload: Record<string, any>,
): Promise<{ review: ApprovalReview; snapshot: Record<string, unknown>; executionPayload: PreparedQuoteSigningBooking; executionEvidence: Record<string, unknown> }> {
  const requestedDate = typeof payload.requested_date === 'string' ? payload.requested_date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) throw new Error('Kundens önskade datum saknas eller är ogiltigt.')

  const { data: customer, error: customerError } = await db.from('customer')
    .select('customer_id, name, phone_number').eq('customer_id', payload.customer_id).eq('business_id', businessId).maybeSingle()
  if (customerError || !customer) throw new Error('Kunden kunde inte verifieras i företaget.')
  if (payload.customer_phone && payload.customer_phone !== customer.phone_number) throw new Error('Kundens telefonnummer har ändrats. Öppna en ny granskning.')

  const { data: quote, error: quoteError } = await db.from('quotes')
    .select('quote_id, title, status, customer_id').eq('quote_id', payload.quote_id).eq('business_id', businessId).maybeSingle()
  if (quoteError || !quote || quote.customer_id !== customer.customer_id) throw new Error('Den signerade offerten kunde inte verifieras för kunden.')
  if (!['accepted', 'signed'].includes(String(quote.status))) throw new Error('Offerten är inte längre signerad eller accepterad.')

  const { data: config, error: configError } = await db.from('business_config')
    .select('working_hours, business_name, assigned_phone_number').eq('business_id', businessId).maybeSingle()
  if (configError || !config?.business_name) throw new Error('Företagets kalenderinställningar kunde inte verifieras.')

  const dayStart = stockholmLocalToISO(requestedDate, '00:00')
  const dayEnd = stockholmLocalToISO(isoDayAfter(requestedDate), '00:00')
  const { data: bookings, error: bookingsError } = await db.from('booking')
    .select('scheduled_start, scheduled_end, status').eq('business_id', businessId)
    .gte('scheduled_start', dayStart).lt('scheduled_start', dayEnd).neq('status', 'cancelled')
  if (bookingsError) throw new Error('Kalendern kunde inte kontrolleras för det önskade datumet.')
  const slots = computeAvailableSlots({ hours: config.working_hours, dateStr: requestedDate, durationMin: 60, bookings: bookings || [] })
  const chosen = slots[0]
  if (!chosen) throw new Error('Det finns inte längre någon ledig timme på kundens önskade datum. Ta fram nya tider.')

  const { data: project } = await db.from('project').select('project_id, name')
    .eq('business_id', businessId).eq('quote_id', quote.quote_id).maybeSingle()
  const currentPhone = typeof customer.phone_number === 'string' && phone.test(customer.phone_number) ? customer.phone_number : null
  const confirmationMessage = currentPhone ? buildBookingConfirmationSms({
    customerName: customer.name,
    businessName: config.business_name,
    assignedPhoneNumber: config.assigned_phone_number,
    scheduledStart: chosen.startISO,
  }) : null
  const notes = [`Bokat från offert: ${quote.title || quote.quote_id}`, `[kort:${approvalId}]`].join(' ')
  const executionPayload: PreparedQuoteSigningBooking = {
    customerId: customer.customer_id,
    customerName: customer.name || 'Kunden',
    customerPhone: currentPhone,
    quoteId: quote.quote_id,
    quoteTitle: quote.title || payload.quote_title || 'Signerad offert',
    requestedDate,
    scheduledStart: chosen.startISO,
    scheduledEnd: chosen.endISO,
    projectId: project?.project_id || null,
    notes,
    confirmationMessage,
  }
  const executionEvidence = {
    kind: 'quote_signing_booking', ...executionPayload,
    bookingEffect: 'Skapar bokning på den granskade tiden',
    calendarEffect: 'Bokningen synkas enligt kalenderns befintliga regler',
    projectEffect: project?.project_id ? `Kopplas till ${project.name || project.project_id}` : 'Ingen verifierad projektkoppling',
    customerConfirmation: confirmationMessage ? 'Skickar det granskade SMS:et efter skapad bokning' : 'Inget SMS skickas eftersom verifierat telefonnummer saknas',
    invoiceEffect: 'Ingen faktura skapas eller skickas',
  }
  const details = [
    { label: 'Kund', text: executionPayload.customerName },
    { label: 'Önskat datum', text: requestedDate },
    { label: 'Bokad start', text: chosen.startISO },
    { label: 'Bokad sluttid', text: chosen.endISO },
    { label: 'Ansvarig', text: 'Inte tilldelad' },
    { label: 'Projektföljd', text: executionEvidence.projectEffect },
    { label: 'Kalenderföljd', text: executionEvidence.calendarEffect },
    { label: 'Kundbekräftelse', text: executionEvidence.customerConfirmation },
    { label: 'Fakturaföljd', text: executionEvidence.invoiceEffect },
  ]
  return {
    executionPayload,
    executionEvidence,
    snapshot: { quoteSigningBooking: executionEvidence, availability: slots.map(slot => slot.startISO) },
    review: {
      title: `Granska bokning — ${executionPayload.customerName}`,
      effect: `Skapar exakt bokningen ${chosen.startISO}–${chosen.endISO}. ${executionEvidence.projectEffect}. ${executionEvidence.invoiceEffect}.${confirmationMessage ? ' Bekräftelse-SMS skickas först efter att bokningen finns.' : ''}`,
      confirmLabel: confirmationMessage ? 'Skapa bokningen och skicka SMS' : 'Skapa bokningen utan SMS',
      messages: confirmationMessage ? [{ channel: 'SMS', recipients: [currentPhone!], text: confirmationMessage }] : [],
      details,
    },
  }
}
