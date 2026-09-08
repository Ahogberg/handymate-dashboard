import { halsning } from '@/lib/customers/namn'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

/**
 * Offert-SMS:et till kunden — EN text, två avsändare (yta 9, 2026-09-07).
 *
 * Texten låg tidigare inline i app/api/quotes/send/route.ts. Demo-offerten
 * på handymate.se (app/api/public/demo-quote) lovar besökaren "du får den
 * som din kund får den" — det löftet håller bara om båda vägarna bygger
 * SMS:et här. Ändra ordalydelsen på ETT ställe.
 *
 * Skillnad mot den gamla literalen: raden "Frågor? Ring …" utelämnas när
 * firman saknar telefonnummer (tidigare skrevs "Ring null" till kunden).
 */
export interface QuoteSmsInput {
  customerName: string | null | undefined
  businessName: string
  /** Firmans publika nummer — raden utelämnas helt om null. */
  businessPhone: string | null | undefined
  /** Handymate-numret (svara-hinten i suffixet). */
  assignedPhoneNumber: string | null | undefined
  total: number
  /** Vad kunden betalar efter ROT/RUT — används bara när rotRutType är satt. */
  customerPays: number | null | undefined
  rotRutType: string | null | undefined
  /** ISO-datum eller null. */
  validUntil: string | null | undefined
  portalUrl: string
}

export function formatSmsCurrency(amount: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)
}

export function buildQuoteSmsText(input: QuoteSmsInput): string {
  const customerPays = input.rotRutType ? (input.customerPays ?? input.total) : input.total
  const rotText = input.rotRutType
    ? ` (efter ${input.rotRutType.toUpperCase()}: ${formatSmsCurrency(customerPays)} kr)`
    : ''
  const suffix = buildSmsSuffix(input.businessName, input.assignedPhoneNumber)
  const fragor = input.businessPhone ? `Frågor? Ring ${input.businessPhone}\n` : ''

  return `${halsning(input.customerName)}

Här kommer din offert från ${input.businessName}:

Totalt: ${formatSmsCurrency(input.total)} kr${rotText}
${input.validUntil ? `Giltig till: ${new Date(input.validUntil).toLocaleDateString('sv-SE')}\n` : ''}
Öppna din kundportal:
${input.portalUrl}

${fragor}${suffix}`
}
