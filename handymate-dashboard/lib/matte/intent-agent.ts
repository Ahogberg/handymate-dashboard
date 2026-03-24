/**
 * Matte Intent Agent — Sonnet analyserar intent + bestämmer actions.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ResolvedEntity } from './resolver'
import type { TimeSlot } from './calendar-slots'

export interface IncomingSignal {
  channel: 'sms' | 'email'
  from: string
  body: string
  subject?: string
  receivedAt: string
}

export interface MatteAction {
  type: string
  autonomous: boolean
  params: Record<string, unknown>
  description: string
}

export interface MatteDecision {
  intent: string
  confidence: number
  projectId?: string
  dealId?: string
  invoiceId?: string
  actions: MatteAction[]
  customerReply?: {
    send: boolean
    message: string
  }
  reasoning: string
}

const SYSTEM_PROMPT = `Du är Matte — intelligent back office-assistent för en svensk hantverkare.

Du analyserar inkommande meddelanden (SMS och mail) från kunder och bestämmer rätt åtgärd.

AUTONOMIREGLER — agera DIREKT (autonomous: true) för:
- Svara på informationsfrågor om status
- Uppdatera anteckningar och materialval i pågående projekt
- Tacka för betalning
- Skicka kort bekräftelse eller välkomstmeddelande till ny okänd kontakt

Skapa GODKÄNNANDE (autonomous: false) för:
- Boka eller omboka tider
- Skicka offert eller prisuppgift
- Allt som innebär löften om pengar eller datum
- ÄTA-tillägg till pågående projekt
- Markera deal som förlorad

INTENT-TYPER:
material_change | reschedule_request | new_booking_request | quote_request |
quote_addition | invoice_question | payment_confirmation | general_question |
complaint | confirmation | cancellation | new_contact | unclear

TONLÄGE MOT KUND:
- Professionellt, personligt, kort
- Alltid svenska
- Underteckna med hantverkarens företagsnamn
- Avslöja ALDRIG att du är AI

FÖR BOKNINGS- OCH OMBOKNINGSFÖRFRÅGNINGAR:
- Om TILLGÄNGLIGA TIDER finns i kontexten → inkludera dem i approval-beskrivningen
- Formulera customer_reply med de tre tiderna: "Hej [namn]! Vi kan komma [tid1], [tid2] eller [tid3]. Vilket passar bäst? // [företag]"
- Om inga tider finns → skapa approval utan specifika tider, be hantverkaren kontrollera kalender

BEGRÄNSNINGAR:
- Lova ALDRIG specifika datum/tider som inte kommer från TILLGÄNGLIGA TIDER
- Ge ALDRIG prisuppgifter utan prislista
- Om meddelandet är otydligt — be om förtydligande, skapa inga actions`

export async function runIntentAgent(
  signal: IncomingSignal,
  entity: ResolvedEntity,
  businessConfig: {
    businessName: string
    hourlyRate: number
    rotEnabled: boolean
    workStart: string
    workEnd: string
  },
  availableSlots?: TimeSlot[]
): Promise<MatteDecision> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const context = buildContext(signal, entity, businessConfig, availableSlots)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `${context}

Analysera meddelandet och returnera ENDAST JSON (ingen markdown):
{
  "intent": "...",
  "confidence": 85,
  "projectId": null,
  "dealId": null,
  "invoiceId": null,
  "actions": [
    {
      "type": "update_project_notes",
      "autonomous": true,
      "params": { "booking_id": "...", "notes": "..." },
      "description": "Uppdatera anteckning på projektet"
    }
  ],
  "customerReply": {
    "send": true,
    "message": "Hej! Vi noterar det. // ${businessConfig.businessName}"
  },
  "reasoning": "Kort förklaring"
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      intent: 'unclear',
      confidence: 0,
      actions: [],
      reasoning: 'Kunde inte tolka intent-agentens svar',
    }
  }

  return JSON.parse(jsonMatch[0]) as MatteDecision
}

function buildContext(
  signal: IncomingSignal,
  entity: ResolvedEntity,
  config: { businessName: string; hourlyRate: number; rotEnabled: boolean; workStart: string; workEnd: string },
  availableSlots?: TimeSlot[]
): string {
  const slotsSection = availableSlots && availableSlots.length > 0
    ? `\nTILLGÄNGLIGA TIDER (verifierade mot kalender):\n${availableSlots.map((s, i) => `  ${i + 1}. ${s.label}`).join('\n')}\nOBS: Föreslå KUN dessa tider om kunden frågar om bokning/ombokning.`
    : '\nKALENDER: Inga lediga tider pre-hämtade — skapa approval utan specifika tider.'

  return `INKOMMANDE ${signal.channel.toUpperCase()} FRÅN: ${entity.customerName ?? 'Okänd avsändare'}
Telefon/mail: ${signal.from}
${signal.subject ? `Ämne: ${signal.subject}\n` : ''}Meddelande: "${signal.body}"
Tidpunkt: ${signal.receivedAt}

KUNDSTATUS: ${
    entity.type === 'unknown'
      ? 'Okänd — ingen historik'
      : `${entity.type === 'known_customer' ? 'Kund' : 'Lead'}: ${entity.customerName}`
  }

AKTIVA PROJEKT (${entity.activeProjects.length}):
${entity.activeProjects.map(p =>
    `  • [${p.id}] ${p.title} [${p.status}]${p.scheduledStart ? ` — ${p.scheduledStart.split('T')[0]}` : ''}`
  ).join('\n') || '  Inga'}

AKTIVA DEALS (${entity.activeDeals.length}):
${entity.activeDeals.map(d =>
    `  • [${d.id}] ${d.title} [${d.pipelineStage}]${d.estimatedValue ? ` — ${d.estimatedValue.toLocaleString('sv-SE')} kr` : ''}`
  ).join('\n') || '  Inga'}

SENASTE FAKTUROR (${entity.recentInvoices.length}):
${entity.recentInvoices.map(i =>
    `  • ${i.number}: ${i.amount.toLocaleString('sv-SE')} kr [${i.status}], förfaller ${i.dueDate}`
  ).join('\n') || '  Inga'}

KONVERSATIONSHISTORIK (senaste ${entity.conversationHistory.length}):
${entity.conversationHistory.map(m =>
    `  ${m.direction === 'in' ? '←' : '→'} [${m.timestamp.split('T')[0]}]: "${m.body.slice(0, 80)}${m.body.length > 80 ? '...' : ''}"`
  ).join('\n') || '  Ingen historik'}
${slotsSection}

FÖRETAG: ${config.businessName}
Timpris: ${config.hourlyRate} kr/h | ROT: ${config.rotEnabled ? 'Ja' : 'Nej'} | Arbetstid: ${config.workStart}–${config.workEnd}`
}
