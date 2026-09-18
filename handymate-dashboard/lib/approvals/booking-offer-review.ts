import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { arSlotenLedig } from '@/lib/bookings/svar-pa-erbjudande'
import type { BookingOffer } from '@/lib/bookings/erbjudande'

export interface PreparedBookingOffer extends Record<string, unknown> {
  offerId: string
  customerId: string | null
  leadId: string | null
  customerName: string
  phone: string
  start: string
  end: string
  label: string
  durationMinutes: number
  businessName: string
  assignedPhoneNumber: string | null
  /** Bekräftelsen kunden får. Fryst här så hantverkaren ser exakt vad som skickas. */
  message: string
}

/**
 * Granskningen av "kunden valde en tid" (spår 3, 2026-09-18).
 *
 * Underlaget läses ur `booking_offer` — inte ur kortets payload. Payloaden
 * säger vilket erbjudande det gäller; allt som utförandet använder hämtas
 * färskt och tenant-scopat här, och fryses i den signerade granskningen.
 *
 * Tiden kontrolleras EN GÅNG TILL vid granskningen. Mellan kundens svar och
 * hantverkarens tryck kan timmar ha gått, och att boka över en tid som hunnit
 * bli upptagen är precis det fel kortet finns för att undvika: hellre ett
 * blockerat kort som säger varför än en dubbelbokning.
 */
export async function prepareBookingOfferReview(
  db: SupabaseClient,
  businessId: string,
  payload: Record<string, any>,
): Promise<{ review: ApprovalReview; snapshot: Record<string, unknown>; executionPayload: PreparedBookingOffer; executionEvidence: Record<string, unknown> }> {
  const offerId = typeof payload.offer_id === 'string' ? payload.offer_id : ''
  if (!offerId) throw new Error('Tidsvalet saknar ett erbjudande att boka från.')

  const { data, error } = await db.from('booking_offer').select('*')
    .eq('business_id', businessId).eq('id', offerId).maybeSingle()
  if (error || !data) throw new Error('Kundens tidsval kunde inte verifieras i ditt företag.')
  const erbjudande = data as BookingOffer

  if (erbjudande.status !== 'accepted') throw new Error('Tidsvalet gäller inte längre. Skicka nya tider i stället.')
  const slot = erbjudande.chosen_slot
  if (!slot?.start || !slot?.end || !Number.isFinite(Date.parse(slot.start)) || !Number.isFinite(Date.parse(slot.end))) {
    throw new Error('Den valda tiden saknas i underlaget.')
  }
  if (erbjudande.resulting_booking_id) throw new Error('Bokningen är redan skapad för det här tidsvalet.')

  let customerName = 'Kunden'
  let phone = erbjudande.phone_e164
  if (erbjudande.customer_id) {
    const { data: kund, error: kundFel } = await db.from('customer').select('customer_id, name, phone_number')
      .eq('business_id', businessId).eq('customer_id', erbjudande.customer_id).maybeSingle()
    if (kundFel || !kund) throw new Error('Kunden kunde inte verifieras i ditt företag.')
    customerName = kund.name || customerName
    phone = kund.phone_number || phone
  } else if (erbjudande.lead_id) {
    const { data: lead, error: leadFel } = await db.from('leads').select('lead_id, name, phone')
      .eq('business_id', businessId).eq('lead_id', erbjudande.lead_id).maybeSingle()
    if (leadFel || !lead) throw new Error('Kundförfrågan kunde inte verifieras i ditt företag.')
    customerName = lead.name || customerName
    phone = lead.phone || phone
  }
  if (!phone) throw new Error('Kundens telefonnummer saknas — bekräftelsen skulle inte nå fram.')

  const ledig = await arSlotenLedig(db, businessId, slot.start, slot.end)
  if (!ledig) throw new Error('Tiden har blivit upptagen sedan kunden valde den. Skicka nya tider i stället.')

  const { data: config, error: configFel } = await db.from('business_config')
    .select('business_name, assigned_phone_number').eq('business_id', businessId).maybeSingle()
  if (configFel || !config?.business_name) throw new Error('Företagets avsändare kunde inte verifieras.')

  const { buildBookingConfirmationSms } = await import('@/lib/bookings/confirmation-sms')
  const message = buildBookingConfirmationSms({
    customerName, businessName: String(config.business_name),
    assignedPhoneNumber: config.assigned_phone_number ?? null, scheduledStart: slot.start,
  })

  const durationMinutes = Math.max(30, Math.round((Date.parse(slot.end) - Date.parse(slot.start)) / 60000))
  const executionPayload: PreparedBookingOffer = {
    offerId, customerId: erbjudande.customer_id, leadId: erbjudande.lead_id,
    customerName, phone, start: slot.start, end: slot.end, label: slot.label || '',
    durationMinutes, businessName: String(config.business_name),
    assignedPhoneNumber: config.assigned_phone_number ?? null, message,
  }
  const executionEvidence = { kind: 'booking_offer_confirm', ...executionPayload, kundensSvar: payload.kundens_svar || null }

  return {
    executionPayload,
    executionEvidence,
    snapshot: { bookingOffer: executionEvidence },
    review: {
      title: `Boka ${customerName} — ${slot.label || 'vald tid'}`,
      effect: 'Skapar bokningen i kalendern och skickar bokningsbekräftelsen till kunden. Kunden har själv valt tiden i sitt SMS-svar.',
      confirmLabel: 'Boka tiden',
      messages: [{ channel: 'SMS', recipients: [phone], text: message }],
      details: [
        { label: 'Kund', text: customerName },
        { label: 'Vald tid', text: `${slot.label || 'Tid'} (${slot.start} – ${slot.end})` },
        { label: 'Besökets längd', text: `${durationMinutes} minuter` },
        { label: 'Kalenderföljd', text: 'En ny bokning skapas. Ingen befintlig bokning flyttas.' },
        { label: 'Kundbekräftelse', text: `Bokningsbekräftelse via SMS till ${phone}` },
        { label: 'Kundens svar', text: String(payload.kundens_svar || 'Svaret finns i SMS-tråden') },
      ],
    },
  }
}
