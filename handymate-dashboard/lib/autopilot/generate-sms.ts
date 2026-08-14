import { extractFirstName, halsning } from '@/lib/customers/namn'
import { getServerSupabase } from '@/lib/supabase'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'

const CUSTOMER_SMS_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Generera bekräftelse-SMS till kund efter offertacceptans.
 * Försöker använda Claude Haiku, fallback till mall.
 *
 * R1/R2: kundtext får BARA kundens förnamn, ALDRIG offertens interna
 * arbetsnamn (quoteTitle) — referera generiskt till "offerten".
 */
export async function generateCustomerSms(params: {
  businessName: string
  contactName: string
  customerName: string
  quoteTitle: string
  bookingDate?: string
  /** COGS-mätaren (etapp "svansen", 2026-08-14) — optional, se samma
      resonemang som övriga mätpunkter i denna sprint. */
  businessId?: string
  /** Något som pekar tillbaka till raden som orsakade anropet (offert-id). */
  refId?: string
}): Promise<string> {
  const { businessName, contactName, customerName, bookingDate, businessId, refId } = params
  const customerFirstName = extractFirstName(customerName)

  // Försök med Claude Haiku
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const bookingPart = bookingDate
        ? `Nämn att vi föreslår att påbörja arbetet ${bookingDate}.`
        : ''

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CUSTOMER_SMS_MODEL,
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Skriv ett kort, vänligt SMS (max 160 tecken) till ${customerFirstName || 'kunden'} som bekräftar att vi tagit emot deras godkännande av offerten. ${bookingPart}Signera med ${contactName} från ${businessName}. Skriv på svenska. Använd kundens förnamn (eller "Hej!" om inget namn finns). Referera till offerten generiskt — nämn ALDRIG interna arbetsnamn eller titlar. Bara SMS-texten, inget annat.`,
          }],
        }),
      })

      if (res.ok) {
        const data = await res.json()

        // COGS-boken — autopilotens kund-SMS var tidigare helt omätt.
        if (businessId && data.usage) {
          await meterDirectLlmCall({
            supabase: getServerSupabase(),
            businessId,
            usage: data.usage,
            costUsd: llmCostUsd(data.usage, CUSTOMER_SMS_MODEL),
            refType: 'autopilot_customer_sms',
            refId: refId || 'apsms_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          })
        }

        const text = data.content?.[0]?.text
        if (text) return text.trim()
      }
    } catch {
      // Fallback till mall
    }
  }

  // Fallback-mall
  const bookingPart = bookingDate ? ` Vi föreslår start ${bookingDate}.` : ''
  return `${halsning(customerName)} Tack för att du valt ${businessName}.${bookingPart} Vi återkommer snart med detaljer. //${contactName}`
}
