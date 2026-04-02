// System prompt builder for Next.js runtime
// Mirrors supabase/functions/agent/system-prompt.ts

/** +46761234567 → 076-123 45 67 */
function formatAgentPhoneHint(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('46') && digits.length > 9) digits = '0' + digits.substring(2)
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`
  return digits
}

interface BusinessContext {
  business_name: string
  contact_name: string
  branch: string
  service_area: string
  phone_number: string
  assigned_phone_number: string
  pricing_settings: { hourly_rate?: number; vat_rate?: number } | null
  knowledge_base: {
    services?: Array<{ name: string; description: string; priceRange: string }>
    faqs?: Array<{ question: string; answer: string }>
    emergencyInfo?: string
  } | null
  working_hours: Record<string, { active: boolean; start: string; end: string }> | null
  // Google integration status
  google_calendar_connected?: boolean
  google_calendar_email?: string
  gmail_connected?: boolean
  gmail_send_enabled?: boolean
  // Learned preferences
  preferences?: Record<string, string>
  // V3 Automation settings
  automationSettings?: {
    work_start: string
    work_end: string
    work_days: string[]
    night_mode_enabled: boolean
    min_job_value_sek: number
    require_approval_send_quote: boolean
    require_approval_send_invoice: boolean
    require_approval_create_booking: boolean
    lead_response_target_minutes: number
  } | null
  // V4 Phone transfer
  personal_phone?: string | null
  call_handling_mode?: string | null
  // V5 Agent context — tolkad företagsstatus (genererat nattligen)
  agentContext?: {
    generated_at: string
    business_health: string
    open_leads_count: number
    overdue_invoices_count: number
    pending_approvals_count: number
    key_insights: Array<{ type: string; message: string; action_needed: boolean }>
    recommended_priorities: Array<{ priority: number; description: string; lead_id?: string }>
  } | null
  // V5 Learned preferences — per-företags-inlärning
  learnedPreferences?: {
    communication_tone: string | null
    pricing_tendency: string | null
    lead_response_style: string | null
    preferred_sms_length: string | null
    custom_preferences: Array<{ key: string; value: string; confidence: number }> | null
  } | null
  // V4 Pipeline context — injiceras per aktiv konversation om lead finns
  leadPipelineContext?: {
    lead_id: string
    pipeline_stage_key: string
    pipeline_stage_label: string
  } | null
}

const BRANCH_NAMES: Record<string, string> = {
  electrician: 'Elektriker',
  plumber: 'Rörmokare',
  carpenter: 'Snickare',
  painter: 'Målare',
  hvac: 'VVS-tekniker',
  locksmith: 'Låssmed',
  cleaning: 'Städföretag',
  other: 'Hantverkare',
}

export function buildSystemPrompt(
  business: BusinessContext,
  triggerType: string,
  triggerData?: Record<string, unknown>
): string {
  const branchLabel = BRANCH_NAMES[business.branch] || business.branch || 'Hantverkare'
  const hourlyRate = business.pricing_settings?.hourly_rate || 695
  const vatRate = business.pricing_settings?.vat_rate || 25

  const servicesBlock = business.knowledge_base?.services?.length
    ? business.knowledge_base.services
        .map((s) => `- ${s.name}: ${s.description} (${s.priceRange})`)
        .join('\n')
    : 'Ej specificerat'

  const dayNames: Record<string, string> = {
    monday: 'Mån', tuesday: 'Tis', wednesday: 'Ons', thursday: 'Tors',
    friday: 'Fre', saturday: 'Lör', sunday: 'Sön',
  }
  const hoursBlock = business.working_hours
    ? Object.entries(business.working_hours)
        .filter(([, v]) => v && v.active)
        .map(([day, v]) => `${dayNames[day] || day}: ${v.start}–${v.end}`)
        .join(', ') || 'Mån-Fre 07:00–17:00'
    : 'Mån-Fre 07:00–17:00'

  const triggerInstructions = getTriggerInstructions(triggerType, triggerData)

  const contextBlock = buildAgentContextBlock(business.agentContext)
  const learnedPrefsBlock = buildLearnedPreferencesBlock(business.learnedPreferences)

  const prefsBlock = business.preferences && Object.keys(business.preferences).length > 0
    ? '\n\n## Inlärda preferenser\n' +
      Object.entries(business.preferences)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : ''

  return `Du är en AI-assistent för ${business.business_name}, ett ${branchLabel.toLowerCase()}företag i ${business.service_area || 'Sverige'}.

## Din roll
Du är en professionell affärsassistent som hjälper ${business.contact_name || 'hantverkaren'} att hantera kunder, bokningar, offerter och kommunikation.

## Företagsinformation
- **Företag:** ${business.business_name}
- **Bransch:** ${branchLabel}
- **Område:** ${business.service_area || 'Ej angivet'}
- **Timpris:** ${hourlyRate} kr/tim (exkl. moms)
- **Moms:** ${vatRate}%

## Tjänster
${servicesBlock}

## Arbetstider
${hoursBlock}
${contextBlock}
## Affärsregler
${buildAutomationBlock(business.automationSettings)}
### ROT-avdrag
- 30% av arbetskostnaden, max 50 000 kr/år
### RUT-avdrag
- 50% av arbetskostnaden, max 75 000 kr/år
### SMS
- ALDRIG mellan 21:00 och 08:00
- Avsluta ALLTID SMS med svarsnummer och företagsnamn${business.assigned_phone_number ? `:\n  Svara: ${formatAgentPhoneHint(business.assigned_phone_number)}\n  //${business.business_name}` : `: //${business.business_name}`}
### Offerter
- Giltighetstid 30 dagar
- Separera arbete och material

## Arbetsflöde
${triggerInstructions}

## Lead Pipeline
- Vid inkommande samtal/SMS: kvalificera ALLTID som lead först med qualify_lead
- Heta leads (urgency high/emergency) kräver omedelbar åtgärd
- Vid lead_nurture: referera till kundens SPECIFIKA förfrågan
- Vid hot lead: betona brådskan, inkludera jobbtyp och kontaktinfo
- Pipeline-steg: Ny lead → Kontaktad → Offert skickad → Offert öppnad → Aktivt jobb → Fakturerad → Avslutad | Förlorad
${business.leadPipelineContext ? `
### Aktuell lead i pipeline
- Lead ID: ${business.leadPipelineContext.lead_id}
- Pipeline-steg: **${business.leadPipelineContext.pipeline_stage_label}** (${business.leadPipelineContext.pipeline_stage_key})
- Anpassa ditt beteende efter var kunden befinner sig i tratten. T.ex. om steget är "Offert skickad" handlar kontakten troligen om att diskutera offerten.` : ''}

## Vidarekoppling
${business.personal_phone
  ? `- Hantverkarens privata nummer finns konfigurerat
- Du KAN koppla vidare kunden om de uttryckligen ber att prata med en person
- Samtalsläge: ${business.call_handling_mode || 'agent_with_transfer'}`
  : `- Inget privat nummer konfigurerat — försök ALDRIG koppla vidare
- Ta alltid meddelande och meddela att hantverkaren återkommer`}

## Regler
- Sök alltid kund innan du skapar ny (search_customers)
- Kontrollera kalender innan bokning (check_calendar)
- Skicka aldrig SMS nattetid
- Max 10 verktygsanrop per körning
${buildGoogleSection(business)}${prefsBlock}${learnedPrefsBlock}
Dagens datum: ${new Date().toISOString().split('T')[0]}`
}

function buildAutomationBlock(settings: BusinessContext['automationSettings']): string {
  if (!settings) return ''
  const dayMap: Record<string, string> = {
    mon: 'Mån', tue: 'Tis', wed: 'Ons', thu: 'Tor', fri: 'Fre', sat: 'Lör', sun: 'Sön',
  }
  const days = (settings.work_days || []).map(d => dayMap[d] || d).join(', ')
  return `### Automationsinställningar
- Arbetstider: ${settings.work_start}–${settings.work_end}, ${days}
- Nattspärr: ${settings.night_mode_enabled ? 'PÅ' : 'AV'}
- Minsta jobbvärde: ${settings.min_job_value_sek} kr
- Skicka offert: ${settings.require_approval_send_quote ? 'kräver godkännande' : 'auto'}
- Skicka faktura: ${settings.require_approval_send_invoice ? 'kräver godkännande' : 'auto'}
- Boka tid: ${settings.require_approval_create_booking ? 'kräver godkännande' : 'auto'}
- Lead-svarstid: max ${settings.lead_response_target_minutes} minuter
`
}

function buildGoogleSection(business: BusinessContext): string {
  if (!business.google_calendar_connected && !business.gmail_connected) return ''

  let section = '\n## Google-integrationer'

  if (business.google_calendar_connected) {
    section += `\n### Google Calendar (${business.google_calendar_email || 'ansluten'})`
    section += '\n- check_calendar visar BÅDE Handymate-bokningar OCH Google Calendar-händelser'
    section += '\n- create_booking skapar automatiskt en händelse i Google Calendar'
    section += '\n- Undvik dubbelbokningar — kontrollera alltid kalendern först'
  }

  if (business.gmail_connected) {
    section += '\n### Gmail'
    section += '\n- Använd read_customer_emails för att läsa e-posthistorik med en kund innan du svarar'
    if (business.gmail_send_enabled) {
      section += '\n- send_email skickar via hantverkarens Gmail — visas i Skickat-mappen'
    } else {
      section += '\n- send_email använder Resend (Gmail-sändning ej aktiverat)'
    }
  }

  return section + '\n'
}

function getTriggerInstructions(
  triggerType: string,
  triggerData?: Record<string, unknown>
): string {
  switch (triggerType) {
    case 'phone_call':
      return `### Samtal avslutat
1. Kvalificera som lead med qualify_lead
2. Sök kund, skapa vid behov, vidta åtgärd
Transkription: ${triggerData?.transcript || '(Saknas)'}
Telefon: ${triggerData?.phone_number || 'Okänt'}
Längd: ${triggerData?.duration_seconds || '?'} sek`

    case 'incoming_sms':
      return `### Inkommande SMS
1. Kvalificera som lead med qualify_lead
2. Sök kund, förstå behov, vidta åtgärd
Från: ${triggerData?.phone_number || 'Okänt'}
Meddelande: ${triggerData?.message || '(Tomt)'}
Historik: ${triggerData?.conversation_history || '(Ingen)'}`

    case 'cron':
      return `### Schemalagt jobb (${triggerData?.cron_type || 'daily_check'})`

    case 'manual':
      return `### Manuell begäran
${triggerData?.instruction || '(Ingen instruktion)'}`

    default:
      return `### ${triggerType}\n${JSON.stringify(triggerData || {})}`
  }
}

function buildLearnedPreferencesBlock(prefs: BusinessContext['learnedPreferences']): string {
  if (!prefs) return ''

  const lines: string[] = []
  if (prefs.communication_tone) lines.push(`Kommunikationston: ${prefs.communication_tone}`)
  if (prefs.preferred_sms_length) lines.push(`SMS-längd: ${prefs.preferred_sms_length}`)
  if (prefs.pricing_tendency) lines.push(`Prissättningstendans: ${prefs.pricing_tendency}`)
  if (prefs.lead_response_style) lines.push(`Lead-hantering: ${prefs.lead_response_style}`)
  if (prefs.custom_preferences?.length) {
    for (const p of prefs.custom_preferences) {
      if (p.confidence >= 0.5) {
        lines.push(`${p.key}: ${p.value}`)
      }
    }
  }

  if (lines.length === 0) return ''

  return `\n\n## Inlärda preferenser för detta företag\n${lines.map(l => `- ${l}`).join('\n')}`
}

function buildAgentContextBlock(ctx: BusinessContext['agentContext']): string {
  if (!ctx) return ''

  const healthEmoji = ctx.business_health === 'critical' ? 'KRITISKT'
    : ctx.business_health === 'attention' ? 'KRÄVER UPPMÄRKSAMHET'
    : 'STABILT'

  const insights = ctx.key_insights
    .map(i => `- ${i.message}${i.action_needed ? ' ⚡' : ''}`)
    .join('\n')

  const priorities = ctx.recommended_priorities
    .map(p => `${p.priority}. ${p.description}`)
    .join('\n')

  return `
## Företagets nuläge (genererat ${ctx.generated_at.split('T')[0]})
- Hälsa: **${healthEmoji}**
- Öppna leads: ${ctx.open_leads_count}
- Förfallna fakturor: ${ctx.overdue_invoices_count}
- Väntande godkännanden: ${ctx.pending_approvals_count}
${insights ? `\n### Insikter\n${insights}` : ''}
${priorities ? `\n### Prioriteringar\n${priorities}` : ''}
`
}
