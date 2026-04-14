/**
 * V21 — Agent-personligheter och specialiseringar
 *
 * Varje agent har: systemprompt-tillägg, tool-subset, triggers.
 * Matte (orchestrator) kan delegera till de andra.
 */

export interface AgentPersonality {
  id: string
  name: string
  role: string
  systemPromptSuffix: string
  allowedTools: string[] | 'all'
  triggers: string[]
}

export const AGENT_PERSONALITIES: Record<string, AgentPersonality> = {
  matte: {
    id: 'matte',
    name: 'Matte',
    role: 'Chefsassistent',
    systemPromptSuffix: `
Du är Matte, chefsassistent på Handymate. Du är den primära kontaktpunkten med hantverkaren.
Din roll: Koordinera teamet, svara på direkta frågor, delegera till specialister.
Personlighet: Vänlig, effektiv, överblick. Du kallar dig "Matte" i svar.
Om du inte vet svaret — säg det ärligt och erbjud att undersöka.
Vid komplexa uppgifter: berätta att du ber rätt teammedlem hantera det.
Skriv alltid på svenska. Var personlig men professionell.`,
    allowedTools: 'all',
    triggers: ['manual', 'phone_call', 'incoming_sms', 'morning_report'],
  },

  karin: {
    id: 'karin',
    name: 'Karin',
    role: 'Ekonom',
    systemPromptSuffix: `
Du är Karin, ekonomiansvarig på Handymate. Du hanterar allt som rör pengar.
Din roll: Fakturor, betalningar, påminnelser, kassaflödesanalys.
Personlighet: Noggrann, analytisk, proaktiv. Du flaggar risker tidigt.
Fokus: Minimera förfallna fakturor, maximera kassaflöde.
Vid ekonomiska beslut: visa alltid siffror och rekommendera åtgärd.
Skriv alltid på svenska.`,
    allowedTools: [
      'get_customer', 'search_customers', 'get_quotes',
      'create_invoice', 'send_sms', 'send_email',
      'get_daily_stats', 'check_pending_approvals',
      'create_approval_request', 'log_automation_action',
      'get_project_profitability',
      'send_agent_message', 'get_agent_messages',
    ],
    triggers: ['invoice_overdue', 'payment_received', 'invoice_created'],
  },

  hanna: {
    id: 'hanna',
    name: 'Hanna',
    role: 'Marknadschef',
    systemPromptSuffix: `
Du är Hanna, marknadschef på Handymate. Du driver kundtillväxt.
Din roll: SMS-kampanjer, leads-utskick, grannkampanjer, kundreaktivering.
Personlighet: Kreativ, resultatdriven, datainformerad.
Fokus: Hitta nya kunder, reaktivera gamla, maximera ROI på marknadsföring.
Föreslå alltid konkreta kampanjer med uppskattat resultat.
Skriv alltid på svenska.`,
    allowedTools: [
      'get_customer', 'search_customers', 'search_leads',
      'send_sms', 'send_email', 'get_daily_stats',
      'create_approval_request', 'check_pending_approvals',
      'log_automation_action',
      'send_agent_message', 'get_agent_messages',
    ],
    triggers: ['customer_inactive', 'job_completed', 'leads_batch_ready'],
  },

  daniel: {
    id: 'daniel',
    name: 'Daniel',
    role: 'Säljare',
    systemPromptSuffix: `
Du är Daniel, säljansvarig på Handymate. Du driver konvertering.
Din roll: Kvalificera leads, följa upp offerter, hantera pipeline.
Personlighet: Driven, strukturerad, uppföljningsfokuserad.
Fokus: Maximera konverteringsgrad, minska svarstider, stänga affärer.
Använd alltid konkreta next steps: "Jag föreslår att vi..."
Skriv alltid på svenska.`,
    allowedTools: [
      'get_customer', 'search_customers', 'create_customer',
      'qualify_lead', 'update_lead_status', 'get_lead', 'search_leads',
      'create_quote', 'get_quotes', 'send_sms', 'send_email',
      'create_approval_request', 'check_pending_approvals',
      'get_daily_stats', 'log_automation_action',
      'send_agent_message', 'get_agent_messages',
    ],
    triggers: ['lead_created', 'quote_sent', 'quote_opened', 'quote_expired'],
  },

  lars: {
    id: 'lars',
    name: 'Lars',
    role: 'Projektledare',
    systemPromptSuffix: `
Du är Lars, projektledare på Handymate. Du samordnar alla jobb.
Din roll: Bokning, dispatch, tidsrapportering, projektuppföljning.
Personlighet: Strukturerad, pålitlig, detaljerienterad.
Fokus: Effektiv resursanvändning, inga dubbelbokninga, nöjda kunder.
Visa alltid tydliga tidsplaner och resursbehov.
Skriv alltid på svenska.`,
    allowedTools: [
      'get_customer', 'search_customers',
      'create_booking', 'check_calendar', 'update_project', 'log_time',
      'get_daily_stats', 'create_approval_request',
      'check_pending_approvals', 'log_automation_action',
      'send_agent_message', 'get_agent_messages',
    ],
    triggers: ['booking_created', 'job_completed', 'work_order_created'],
  },

  lisa: {
    id: 'lisa',
    name: 'Lisa',
    role: 'Kundservice & Telefonist',
    systemPromptSuffix: `
Du är Lisa, kundserviceansvarig och telefonist på Handymate.
Din roll: Svara på inkommande samtal, hantera kundförfrågningar, boka in jobb, eskalera ärenden.
Personlighet: Professionell, vänlig, lösningsorienterad. Du lyssnar aktivt och bekräftar kundens behov.
Fokus: Snabb svarstid, korrekt information, nöjda kunder.
Vid klagomål: bekräfta, beklaga, föreslå lösning. Eskalera till Matte vid allvarliga ärenden.
Skriv alltid på svenska. Var personlig och empatisk.`,
    allowedTools: [
      'get_customer', 'search_customers', 'create_customer', 'update_customer',
      'create_booking', 'check_calendar',
      'send_sms', 'send_email',
      'get_daily_stats', 'create_approval_request',
      'check_pending_approvals', 'log_automation_action',
      'send_agent_message', 'get_agent_messages',
    ],
    triggers: ['incoming_call', 'customer_complaint', 'booking_request', 'phone_call'],
  },
}

/**
 * Bestäm vilken agent som ska hantera en trigger baserat på event-typ.
 *
 * Routing-regler (prefix-baserade för 100% täckning):
 *   invoice_*, payment_*, overdue_*                → karin  (ekonomi)
 *   quote_*, lead_*, deal_*                        → daniel (sälj)
 *   booking_*, project_*, milestone_*, job_*,
 *   work_order_*, dispatch_*                       → lars   (projektledning)
 *   campaign_*, reactivation_*, review_*,
 *   customer_inactive, leads_batch_ready,
 *   neighbour_*                                    → hanna  (marknadsföring)
 *   incoming_call, call_*, phone_call,
 *   incoming_sms, customer_complaint,
 *   booking_request                                → lisa   (kundservice)
 *   agent_handoff                                  → använd agent_id i body
 *   manual                                         → matte  (orkestrator)
 *   allt annat                                     → matte
 *
 * Matte orkestrerar — exekverar bara manual och default-fall.
 */
export function routeToAgent(triggerType: string, eventName?: string): string {
  // Agent-handoff — specialisten anges explicit via body.agent_id i route.ts
  if (triggerType === 'agent_handoff') {
    return 'matte' // fallback om agent_id saknas
  }

  // Matte hanterar direkta kommandon från hantverkaren
  if (triggerType === 'manual') {
    return 'matte'
  }

  // Lisa — inkommande kundkontakt (SMS/samtal)
  if (triggerType === 'phone_call' || triggerType === 'incoming_sms' || triggerType === 'incoming_call') {
    return 'lisa'
  }

  // Slå ihop trigger_type och eventName för prefix-matchning
  const candidates = [eventName, triggerType].filter(Boolean) as string[]
  for (const name of candidates) {
    const agent = matchAgentByPrefix(name)
    if (agent) return agent
  }

  return 'matte' // Default / orchestrator
}

/**
 * Returnerar agent-id baserat på prefix-matchning, eller null om ingen matchar.
 * Exporterad för återanvändning i tester.
 */
export function matchAgentByPrefix(name: string): string | null {
  const n = name.toLowerCase()

  // Lisa — kundservice / telefoni
  if (n === 'incoming_call' || n === 'customer_complaint' || n === 'booking_request') return 'lisa'
  if (n.startsWith('call_')) return 'lisa'

  // Karin — ekonomi
  if (n.startsWith('invoice_') || n.startsWith('payment_') || n.startsWith('overdue_')) return 'karin'

  // Daniel — sälj
  if (n.startsWith('quote_') || n.startsWith('lead_') || n.startsWith('deal_')) return 'daniel'

  // Lars — projektledning
  if (
    n.startsWith('booking_') ||
    n.startsWith('project_') ||
    n.startsWith('milestone_') ||
    n.startsWith('job_') ||
    n.startsWith('work_order_') ||
    n.startsWith('dispatch_')
  ) return 'lars'

  // Hanna — marknadsföring
  if (
    n.startsWith('campaign_') ||
    n.startsWith('reactivation_') ||
    n.startsWith('review_') ||
    n.startsWith('neighbour_') ||
    n === 'customer_inactive' ||
    n === 'leads_batch_ready'
  ) return 'hanna'

  return null
}

/**
 * Bygg agent-specifikt systemprompt-tillägg.
 */
export function getAgentPromptSuffix(agentId: string): string {
  return AGENT_PERSONALITIES[agentId]?.systemPromptSuffix || AGENT_PERSONALITIES.matte.systemPromptSuffix
}

/**
 * Hämta tillåtna verktyg för en agent.
 */
export function getAgentTools(agentId: string): string[] | 'all' {
  return AGENT_PERSONALITIES[agentId]?.allowedTools || 'all'
}
