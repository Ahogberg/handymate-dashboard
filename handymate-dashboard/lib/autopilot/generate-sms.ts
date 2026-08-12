import { extractFirstName, halsning } from '@/lib/customers/namn'

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
}): Promise<string> {
  const { businessName, contactName, customerName, bookingDate } = params
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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Skriv ett kort, vänligt SMS (max 160 tecken) till ${customerFirstName || 'kunden'} som bekräftar att vi tagit emot deras godkännande av offerten. ${bookingPart}Signera med ${contactName} från ${businessName}. Skriv på svenska. Använd kundens förnamn (eller "Hej!" om inget namn finns). Referera till offerten generiskt — nämn ALDRIG interna arbetsnamn eller titlar. Bara SMS-texten, inget annat.`,
          }],
        }),
      })

      if (res.ok) {
        const data = await res.json()
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
