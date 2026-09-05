import { buildSmsSuffix } from '@/lib/sms-reply-number'

/**
 * Bokningsbekräftelsens SMS-text — bruten ut ur app/api/actions/route.ts
 * ("manuellt skapa bokning"-vägen, kalenderns bokningsformulär) 2026-09-05
 * så samma text kan återanvändas av godkännande-executorn (Etapp Starttiden,
 * new_booking_request/source:'quote_signing' — se
 * docs/audits/WOW_GENOMLYSNING_2026-09-05.md, "A. Starttiden").
 *
 * Root cause-fix vid utbrytningen: originalet formatterade `scheduledStart`
 * med `toLocaleDateString`/`toLocaleTimeString` UTAN `timeZone`, vilket läser
 * SERVERNS lokaltid (UTC på Vercel) — en bokning kl 07:30 svensk tid visades
 * som "05:30" eller "06:30" beroende på sommar-/vintertid. Samma bugklass som
 * lib/dates.ts varnar för. Explicit `timeZone: 'Europe/Stockholm'` här löser
 * den, för båda anroparna.
 */
export function buildBookingConfirmationSms(params: {
  customerName?: string | null
  businessName: string
  assignedPhoneNumber?: string | null
  scheduledStart: string
}): string {
  const { customerName, businessName, assignedPhoneNumber, scheduledStart } = params
  const bookingDate = new Date(scheduledStart)
  const dateStr = bookingDate.toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Stockholm',
  })
  const timeStr = bookingDate.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  })
  const suffix = buildSmsSuffix(businessName, assignedPhoneNumber)
  const firstName = customerName ? ' ' + customerName.split(' ')[0] : ''
  return `Hej${firstName}! Din tid hos ${businessName} är bokad: ${dateStr} kl ${timeStr}. Välkommen! Behöver du ändra tiden?\n${suffix}`
}
