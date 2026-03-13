/**
 * V6 Lead-agent — snabb kvalificering och SMS-respons
 *
 * Modell: Claude Haiku (snabb, billig)
 * Fokus: Inkommande leads, SMS-svar, pipeline-beslut
 */

import { BusinessContext, escalateToolDefinition, filterTools } from './shared'

export const LEAD_MODEL = 'claude-haiku-4-5-20251001'
export const LEAD_MAX_STEPS = 6

export const LEAD_TOOL_NAMES = [
  'qualify_lead',
  'update_lead_status',
  'get_lead',
  'search_leads',
  'send_sms',
  'search_customers',
  'create_customer',
  'get_customer',
  'create_approval_request',
  'check_pending_approvals',
]

export function getLeadTools() {
  const tools = filterTools(LEAD_TOOL_NAMES)
  return [...tools, escalateToolDefinition] as any
}

export function buildLeadPrompt(
  ctx: BusinessContext,
  triggerType: string,
  triggerData: Record<string, unknown>
): string {
  const biz = ctx.bizConfig
  const settings = ctx.v3Settings
  const prefs = ctx.learnedPreferences

  const branchMap: Record<string, string> = {
    electrician: 'Elektriker', plumber: 'Rörmokare', carpenter: 'Snickare',
    painter: 'Målare', hvac: 'VVS-tekniker', locksmith: 'Låssmed',
    cleaning: 'Städföretag', other: 'Hantverkare',
  }
  const branch = branchMap[biz.branch] || biz.branch || 'Hantverkare'

  const workHours = settings
    ? `${settings.work_start}–${settings.work_end}`
    : '07:00–17:00'

  const responseTarget = settings?.lead_response_target_minutes || 30

  const toneInstruction = prefs?.communication_tone
    ? `Kommunikationston: ${prefs.communication_tone}.`
    : 'Var professionell men vänlig.'

  const smsLength = prefs?.preferred_sms_length
    ? `SMS-längd: ${prefs.preferred_sms_length}.`
    : 'Håll SMS korta och tydliga.'

  // Agent context insights
  let contextBlock = ''
  if (ctx.agentContext) {
    const ac = ctx.agentContext
    contextBlock = `
## Företagets nuläge
- Öppna leads: ${ac.open_leads_count}
- Förfallna fakturor: ${ac.overdue_invoices_count}
- Väntande godkännanden: ${ac.pending_approvals_count}
`
  }

  // Trigger-specific block
  let triggerBlock = ''
  if (triggerType === 'incoming_sms') {
    triggerBlock = `## Inkommande SMS
Från: ${triggerData?.phone_number || 'Okänt'}
Meddelande: ${triggerData?.message || '(Tomt)'}
Historik: ${triggerData?.conversation_history || '(Ingen)'}

**Uppgift:** Kvalificera som lead, sök befintlig kund, svara med SMS.`
  } else if (triggerType === 'phone_call') {
    triggerBlock = `## Samtal avslutat
Telefon: ${triggerData?.phone_number || 'Okänt'}
Längd: ${triggerData?.duration_seconds || '?'} sek
Transkription: ${triggerData?.transcript || '(Saknas)'}

**Uppgift:** Kvalificera som lead, skapa kund om ny, vidta åtgärd.`
  } else {
    triggerBlock = `## Uppgift
${triggerData?.instruction || 'Hantera lead-relaterad uppgift.'}
${triggerData?.rule_name ? `Regel: ${triggerData.rule_name}` : ''}`
  }

  return `Du är Lead-agenten för ${biz.business_name}, ett ${branch.toLowerCase()}företag.
Du hanterar ENBART leads, kundkontakt och pipeline-beslut. Snabba, korta svar.

## Företag
- ${biz.business_name} (${branch})
- Område: ${biz.service_area || 'Sverige'}
- Arbetstider: ${workHours}
- Svarstid: max ${responseTarget} minuter på nya leads

## Regler
- ${toneInstruction}
- ${smsLength}
- Sök ALLTID befintlig kund innan du skapar ny (search_customers)
- Skicka ALDRIG SMS mellan 21:00 och 08:00
- Kvalificera ALLTID inkommande kontakt som lead med qualify_lead
- Heta leads (urgency high/emergency) kräver omedelbar åtgärd
- Pipeline: Ny lead → Kontaktad → Offert skickad → Aktivt jobb → Fakturerad → Avslutad

## Eskalering
Eskalera till strategi-agenten om:
- Jobbet uppskattas > 50 000 kr
- Kunden har dålig historik
- Du är osäker på rätt åtgärd
${contextBlock}
${triggerBlock}
Dagens datum: ${new Date().toISOString().split('T')[0]}`
}
