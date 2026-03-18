/**
 * AI-brevgenerering med Claude Haiku
 * Genererar personliga, professionella brev per fastighet.
 */

import type { PropertyLead } from './types'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

interface LetterResult {
  content: string
  mock: boolean
}

export async function generateLetter(
  property: PropertyLead,
  business: {
    business_name: string
    contact_name: string
    phone_number: string
    branch: string | null
    website?: string | null
  },
  letterAngle: string
): Promise<LetterResult> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[generateLetter] API-nyckel saknas — använder malltext')
    return {
      content: buildMockLetter(property, business, letterAngle),
      mock: true,
    }
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Skriv ett professionellt, personligt brev från en hantverkare till en fastighetsägare.

AVSÄNDARE:
- Företag: ${business.business_name}
- Kontaktperson: ${business.contact_name}
- Telefon: ${business.phone_number}
- Bransch: ${business.branch || 'Hantverkare'}
${business.website ? `- Hemsida: ${business.website}` : ''}

MOTTAGARE:
- Namn: ${property.ownerName || 'Fastighetsägaren'}
- Adress: ${property.address}
- Fastighetstyp: ${property.propertyType || 'Villa'}
${property.builtYear ? `- Byggnadsår: ${property.builtYear}` : ''}
${property.energyClass ? `- Energiklass: ${property.energyClass}` : ''}
${property.purchaseDate ? `- Köpdatum: ${property.purchaseDate}` : ''}

BREVVINKEL: ${letterAngle}

REGLER:
- Max 200 ord
- Skriv på svenska
- Professionellt men personligt
- Ingen sälj-push, bara erbjud värde
- Avsluta med kontaktuppgifter
- Nämn ALDRIG exakt pris
- Om nyköpt fastighet: gratulera
- Bara brevtexten, ingen ämnesrad eller "Bästa"/"Med vänliga hälsningar" som separata rader — integrera det naturligt`,
        }],
      }),
    })

    const data = await res.json()
    const content = data.content?.[0]?.text || buildMockLetter(property, business, letterAngle)
    return { content, mock: false }
  } catch (err) {
    console.error('[generateLetter] AI-fel:', err)
    return {
      content: buildMockLetter(property, business, letterAngle),
      mock: true,
    }
  }
}

function buildMockLetter(
  property: PropertyLead,
  business: { business_name: string; contact_name: string; phone_number: string },
  letterAngle: string
): string {
  const name = property.ownerName || 'Fastighetsägaren'
  const isNewPurchase = property.purchaseDate &&
    new Date(property.purchaseDate) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const greeting = isNewPurchase
    ? `Grattis till din nya fastighet på ${property.address}!`
    : `Vi hoppas att allt är bra med dig och din fastighet på ${property.address}.`

  return `Hej ${name}!

${greeting}

${letterAngle}

${property.builtYear ? `Med ett hus byggt ${property.builtYear} finns det ofta behov av uppgraderingar som kan spara både energi och pengar på sikt.` : ''}

Vi på ${business.business_name} erbjuder kostnadsfria besiktningar i ditt område och hjälper dig gärna med en plan för eventuella åtgärder.

Ring oss på ${business.phone_number} eller svara på detta brev så bokar vi en tid som passar dig.

Med vänliga hälsningar,
${business.contact_name}
${business.business_name}
${business.phone_number}`
}
