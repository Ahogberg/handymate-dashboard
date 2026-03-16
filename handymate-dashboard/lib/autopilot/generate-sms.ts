/**
 * Generera bekräftelse-SMS till kund efter offertacceptans.
 * Försöker använda Claude Haiku, fallback till mall.
 */
export async function generateCustomerSms(params: {
  businessName: string
  contactName: string
  customerName: string
  quoteTitle: string
  bookingDate?: string
}): Promise<string> {
  const { businessName, contactName, customerName, quoteTitle, bookingDate } = params

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
            content: `Skriv ett kort, vänligt SMS (max 160 tecken) till ${customerName} som bekräftar att vi tagit emot deras godkännande av offerten för "${quoteTitle}". ${bookingPart}Signera med ${contactName} från ${businessName}. Skriv på svenska. Bara SMS-texten, inget annat.`,
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
  return `Hej ${customerName}! Tack för att du valt ${businessName} för "${quoteTitle}".${bookingPart} Vi återkommer snart med detaljer. //${contactName}`
}
