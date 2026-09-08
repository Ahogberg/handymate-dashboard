import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { halsning } from '@/lib/customers/namn'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

export interface PreparedSiteVisit extends Record<string, unknown> {
  to: string
  customerId: string | null
  message: string
  slots: Array<{ start: string; end: string; label: string }>
}

const phone = /^\+?[0-9 ()-]{7,20}$/
const cleanSlots = (value: unknown) => Array.isArray(value) ? value.slice(0, 3).map((slot: any) => {
  if (!slot || typeof slot.start !== 'string' || typeof slot.end !== 'string' || typeof slot.label !== 'string' ||
      !Number.isFinite(Date.parse(slot.start)) || !Number.isFinite(Date.parse(slot.end)) || Date.parse(slot.end) <= Date.parse(slot.start) || !slot.label.trim()) {
    throw new Error('Ett föreslaget tidsintervall är ogiltigt.')
  }
  return { start: slot.start, end: slot.end, label: slot.label.trim() }
}) : []

/** The executor may only send this prepared message. It must never fetch a
 * fresh set of times after the user has reviewed the proposal. */
export async function prepareSiteVisitReview(db: SupabaseClient, businessId: string, payload: Record<string, any>): Promise<{
  review: ApprovalReview
  snapshot: Record<string, unknown>
  executionPayload: PreparedSiteVisit
  executionEvidence: Record<string, unknown>
}> {
  const entity = payload.entity || {}
  const customerId = typeof entity.customerId === 'string' && entity.customerId ? entity.customerId : null
  let customer: any = null
  if (customerId) {
    const result = await db.from('customer').select('customer_id, name, phone_number').eq('customer_id', customerId).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Kunden kunde inte verifieras i företaget.')
    customer = result.data
  }
  const to = customer?.phone_number || entity.phone
  if (typeof to !== 'string' || !phone.test(to) || (customer && entity.phone && entity.phone !== customer.phone_number)) throw new Error('Kundens aktuella telefonnummer kunde inte verifieras.')
  const configResult = await db.from('business_config').select('business_name, assigned_phone_number').eq('business_id', businessId).maybeSingle()
  if (configResult.error || !configResult.data?.business_name) throw new Error('Företagets avsändare kunde inte verifieras.')
  const businessName = String(configResult.data.business_name)
  if (/\r|\n/.test(businessName)) throw new Error('Företagets avsändarnamn är ogiltigt.')

  let slots = cleanSlots(payload.available_slots)
  if (!slots.length) {
    const duration = Number(payload.duration_hours ?? 1)
    if (!Number.isFinite(duration) || duration < 0.5 || duration > 8) throw new Error('Platsbesökets längd måste vara mellan 30 minuter och 8 timmar.')
    const { getAvailableSlots } = await import('@/lib/matte/calendar-slots')
    slots = cleanSlots(await getAvailableSlots(businessId, duration))
  }
  const custom = typeof payload.customer_reply_pending === 'string' ? payload.customer_reply_pending.trim() : ''
  if (!slots.length && !custom) throw new Error('Inga aktuella tider eller färdig meddelandetext kunde förberedas.')
  const message = slots.length
    ? `${halsning(customer?.name || entity.customerName)} Vi skulle gärna komma och titta på jobbet. Passar någon av dessa tider?\n${slots.map((slot, index) => `${index + 1}) ${slot.label}`).join('\n')}\nSvara med 1, 2 eller 3. ${buildSmsSuffix(businessName, configResult.data.assigned_phone_number)}`
    : custom
  if (!message || /\{\{[^{}]+\}\}/.test(message)) throw new Error('Platsbesökets meddelande är inte färdigt.')

  const responsible = typeof payload.responsible_name === 'string' && payload.responsible_name.trim() ? payload.responsible_name.trim() : 'Inte tilldelad'
  const executionPayload = { to, customerId, message, slots }
  const executionEvidence = { kind: 'site_visit_proposal', ...executionPayload, responsible,
    calendarEffect: 'Ingen bokning eller kalenderändring', projectEffect: 'Ingen projektändring', customerConfirmation: 'Kundens svar hanteras separat' }
  return {
    executionPayload, executionEvidence, snapshot: { siteVisit: executionEvidence },
    review: {
      title: `Granska förslag om platsbesök${customer?.name || entity.customerName ? ` — ${customer?.name || entity.customerName}` : ''}`,
      effect: 'Skickar exakt SMS-texten nedan. Tiderna erbjuds men bokas inte. Ingen kalender, ansvarig eller projektstatus ändras och kundens svar hanteras separat.',
      confirmLabel: 'Skicka de granskade tiderna',
      messages: [{ channel: 'SMS', recipients: [to], text: message }],
      details: [
        { label: 'Kund', text: customer?.name || entity.customerName || 'Namn saknas' },
        { label: 'Ansvarig', text: responsible },
        { label: 'Kalenderföljd', text: 'Ingen bokning eller kalenderändring' },
        { label: 'Projektföljd', text: 'Ingen projektändring' },
        { label: 'Kundbekräftelse', text: 'Kundens svar hanteras separat' },
        ...slots.map((slot, index) => ({ label: `Tid ${index + 1}`, text: `${slot.label} (${slot.start} – ${slot.end})` })),
      ],
    },
  }
}
