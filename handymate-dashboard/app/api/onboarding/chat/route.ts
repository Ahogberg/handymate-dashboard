import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Du är Handymate AI-assistenten som hjälper nya användare under onboarding.
Svara kort och hjälpsamt på svenska. Max 3-4 meningar per svar.

Handymate är en AI-plattform för svenska hantverkare. Här är fakta du kan dela:

PRISPLANER:
- Starter: 2 495 kr/mån (100 samtal, 1 användare)
- Professional: 5 995 kr/mån (400 samtal, 5 användare)
- Business: 11 995 kr/mån (Obegränsat)
- 14 dagars gratis provperiod, inget betalkort behövs

ROT-AVDRAG:
- 30% av arbetskostnaden, max 50 000 kr/person/år
- Gäller: el, VVS, snickeri, måleri, tak, golv, bygg, ventilation, låssmed
- Handymate beräknar automatiskt och skapar korrekta underlag

RUT-AVDRAG:
- 50% av arbetskostnaden, max 75 000 kr/person/år
- Gäller: städ, trädgård, flytt
- Handymate hanterar avdraget direkt på fakturan

FUNKTIONER:
- AI-telefonassistent som svarar och bokar åt dig
- Automatisk samtalsanalys och transkribering
- CRM med kundkort och tidslinje
- Offert- och fakturagenerering med PDF
- Tidrapportering och projekthantering
- Lead-import från Offerta, ServiceFinder m.fl.
- Google Calendar & Gmail-integration
- Materialbeställning och leverantörshantering

ONBOARDING:
- Steg 1: Företag & konto
- Steg 2: Tjänster & priser
- Steg 3: Telefonnummer
- Steg 4: Google-koppling, öppettider, kundimport
- Steg 5: Leadkällor
- Steg 6: Automationer (konfigurera vad som sker automatiskt)
- Steg 7: Aktivering

Svara ALDRIG på frågor utanför Handymate-kontexten. Hänvisa istället till support@handymate.se.`

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Tom fråga' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ reply: 'AI-chatten är inte konfigurerad. Kontakta support@handymate.se för hjälp.' })
    }

    const anthropic = new Anthropic({ apiKey })

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (Array.isArray(history)) {
      for (const msg of history.slice(-6)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: String(msg.content) })
        }
      }
    }
    messages.push({ role: 'user', content: message })

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages,
    })

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : 'Kunde inte generera svar.'

    return NextResponse.json({ reply })
  } catch (error: unknown) {
    console.error('Onboarding chat error:', error)
    return NextResponse.json({
      reply: 'Något gick fel. Prova igen eller kontakta support@handymate.se.'
    })
  }
}
