import { checkFuelGate } from '@/lib/costs/fuel'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'
import { getPlanCommercialFacts } from '@/lib/feature-gates'

const ONBOARDING_CHAT_MODEL = 'claude-haiku-4-5-20251001'
const starterFacts = getPlanCommercialFacts('starter')
const firmanFacts = getPlanCommercialFacts('professional')
const storfirmanFacts = getPlanCommercialFacts('business')
const planRow = (facts: ReturnType<typeof getPlanCommercialFacts>) =>
  `${facts.label}: ${facts.monthlyPriceSek.toLocaleString('sv-SE')} kr/mån (${facts.callsPerMonth ?? 'obegränsat'} samtal, ${facts.users ?? 'obegränsat antal'} användare)`

const SYSTEM_PROMPT = `Du är Handymate AI-assistenten som hjälper nya användare under onboarding.
Svara kort och hjälpsamt på svenska. Max 3-4 meningar per svar.

Handymate är en AI-plattform för svenska hantverkare. Här är fakta du kan dela:

PRISPLANER:
- ${planRow(starterFacts)}
- ${planRow(firmanFacts)}
- ${planRow(storfirmanFacts)}
- Prenumerationen startar direkt via Stripe och täcks av den garanti som visas i köpflödet. Lova aldrig en gratis provperiod.

ROT-AVDRAG:
- 30% av arbetskostnaden, max 50 000 kr/person/år
- Gäller: el, VVS, snickeri, måleri, tak, golv, bygg, ventilation, låssmed
- Handymate beräknar automatiskt och skapar korrekta underlag

RUT-AVDRAG:
- 50% av arbetskostnaden, max 75 000 kr/person/år
- Gäller: städ, trädgård, flytt
- Handymate hanterar avdraget direkt på fakturan

FUNKTIONER:
- Lisa fångar nya och missade samtal, skapar lead och återkopplar via SMS. Hon är inte en fri talande röstagent vid lansering.
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

    // Sessionen är valfri här (routen körs före kontoskapande i vissa
    // onboarding-lägen). Finns den: Bränslestoppet gäller, och kostnaden
    // bokförs på kunden nedan. Utan session är det Handymates egen
    // förvärvskostnad — ingen kund att belasta.
    const business = await getAuthenticatedBusiness(request).catch(() => null)
    if (business) {
      const fuel = await checkFuelGate(getServerSupabase(), business.business_id)
      if (!fuel.allowed) {
        return NextResponse.json({ reply: 'Bränslet är slut — AI-chatten pausar tills du tankat under Abonnemang.' })
      }
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
      model: ONBOARDING_CHAT_MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages,
    })

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : 'Kunde inte generera svar.'

    // COGS-boken — bara mätbar om anroparen är inloggad. Denna route körs
    // före kontoskapande i vissa onboarding-lägen (ingen session ännu), och
    // cost_event kräver ett business_id — utan session finns ingen kund att
    // bokföra kostnaden på (recordCost hoppar tyst över annars).
    if (business) {
      const supabase = getServerSupabase()
      await meterDirectLlmCall({
        supabase,
        businessId: business.business_id,
        usage: response.usage,
        costUsd: llmCostUsd(response.usage, ONBOARDING_CHAT_MODEL),
        refType: 'onboarding_chat',
        refId: `onboarding_chat_${Date.now()}`,
      })
    }

    return NextResponse.json({ reply })
  } catch (error: unknown) {
    console.error('Onboarding chat error:', error)
    return NextResponse.json({
      reply: 'Något gick fel. Prova igen eller kontakta support@handymate.se.'
    })
  }
}
