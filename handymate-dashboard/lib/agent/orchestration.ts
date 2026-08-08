/**
 * Sekventiell multi-agent V1 (Codex orkestreringsaudit 2026-08-08, Epic 2).
 *
 * Problemet auditen beskrev med Storgatan-exemplet: "Vi är klara på Storgatan,
 * det blev fyra timmar extra och kunden vill ha fakturan idag" rör tre
 * domäner. Chatten klarade EN överlämning per tur, och efter den kom Matte
 * aldrig tillbaka. Nästa specialist fick bara fri historiktext att gissa ur,
 * och ingen bokförde vad som faktiskt hände — så ett svar kunde sluta med
 * "klart!" fast ett verktyg hade felat.
 *
 * Det här lagret är avsiktligt litet. Det är INGEN workflow engine, ingen
 * planner-service och ingen svärm. Tre rena funktioner:
 *
 *   validateNextStep()   — får det här bytet ske? (request-scopat loopskydd)
 *   toAgentResult()      — vad hände egentligen? (härlett ur verktygsutfall)
 *   buildOrchestrationSummary() — vad säger Matte till slut? (deterministiskt)
 *
 * Sammanfattningen byggs i kod, inte av modellen. En modell som ombeds
 * summera sitt eget arbete är precis den part som kan säga "klart" om något
 * som felade. Koden kan bara säga det den ser i utfallen.
 */

import { AGENT_CAPABILITIES, canHandoff, isValidAgentId, type AgentId } from './capabilities'

/** Högst tre specialiststeg per användarrequest (auditens V1-gräns). */
export const MAX_SPECIALIST_STEPS = 3

/**
 * Användarens ursprungliga ärende. Skickas oförändrat vidare till varje
 * specialist — auditens "immutable original intent". Utan den blir turnr 3
 * en viskningslek: varje agent tolkar föregående agents tolkning.
 */
export interface OrchestrationIntent {
  readonly text: string
  readonly customerId: string | null
  readonly projectId: string | null
}

export type StepStatus = 'completed' | 'awaiting_approval' | 'failed' | 'partial'

/** Utfallet av ETT verktygsanrop, som routern faktiskt rapporterade det. */
export interface ToolOutcome {
  tool: string
  ok: boolean
  error?: string
  /** Sant när anropet la något i godkännandekön i stället för att verkställa. */
  awaitingApproval?: boolean
}

/** Ett avslutat specialiststeg. Auditens AgentResult, trimmat till V1. */
export interface AgentResult {
  agent: AgentId
  status: StepStatus
  /** Specialistens egna ord — förkortade, aldrig omskrivna. */
  summary: string
  actions: Array<{ tool: string; status: 'completed' | 'awaiting_approval' | 'failed'; error?: string }>
}

export type PlanRefusal = 'invalid_agent' | 'max_steps' | 'agent_repeat' | 'not_allowed'

/**
 * Får orkestreringen ta nästa steg? Request-scopat, till skillnad från
 * trådtaket i executeHandoff (som är ett dygnsfönster mot spiraler över tid).
 *
 * Tre grindar:
 *   1. giltig och tillåten target enligt agentens handoff_targets
 *   2. högst MAX_SPECIALIST_STEPS unika specialister i samma request
 *   3. ingen agent besöks två gånger — A→B→A är loopens första varv, inte
 *      ett legitimt steg. Matte räknas inte som specialist och får återkomma.
 */
export function validateNextStep(opts: {
  from: AgentId
  target: string
  visited: AgentId[]
}): { ok: true; target: AgentId } | { ok: false; reason: PlanRefusal } {
  const { from, target, visited } = opts

  if (!isValidAgentId(target)) return { ok: false, reason: 'invalid_agent' }
  if (!canHandoff(from, target)) return { ok: false, reason: 'not_allowed' }

  if (target !== 'matte') {
    if (visited.includes(target)) return { ok: false, reason: 'agent_repeat' }
    if (visited.length >= MAX_SPECIALIST_STEPS) return { ok: false, reason: 'max_steps' }
  }

  return { ok: true, target }
}

/**
 * Härleder stegets status ur vad verktygen FAKTISKT returnerade — aldrig ur
 * vad modellen skrev. Ett steg utan verktygsanrop är ett resonemangssteg och
 * räknas som completed; det påstod inget om världen.
 */
export function deriveStepStatus(outcomes: ToolOutcome[]): StepStatus {
  if (outcomes.length === 0) return 'completed'

  const failed = outcomes.filter(o => !o.ok)
  const väntande = outcomes.filter(o => o.ok && o.awaitingApproval)

  if (failed.length === outcomes.length) return 'failed'
  if (failed.length > 0) return 'partial'
  if (väntande.length > 0) return 'awaiting_approval'
  return 'completed'
}

/** Kortar specialistens text till en mening (max 160 tecken) utan att skriva om den. */
function kortaText(text: string): string {
  const rensad = text.replace(/\s+/g, ' ').trim()
  if (!rensad) return ''
  const meningsslut = rensad.search(/[.!?](\s|$)/)
  const första = meningsslut > 20 ? rensad.slice(0, meningsslut + 1) : rensad
  return första.length > 160 ? `${första.slice(0, 157).trimEnd()}…` : första
}

export function toAgentResult(agent: AgentId, text: string, outcomes: ToolOutcome[]): AgentResult {
  return {
    agent,
    status: deriveStepStatus(outcomes),
    summary: kortaText(text),
    actions: outcomes.map(o => ({
      tool: o.tool,
      status: !o.ok ? ('failed' as const) : o.awaitingApproval ? ('awaiting_approval' as const) : ('completed' as const),
      ...(o.error ? { error: o.error } : {}),
    })),
  }
}

/**
 * Bygger briefingen till nästa specialist: ursprungsärendet OFÖRÄNDRAT,
 * vad tidigare specialister faktiskt gjorde, och den explicita uppgiften.
 * Skickas som ett user-meddelande i nästa runda.
 */
export function buildHandoffBriefing(
  intent: OrchestrationIntent,
  tidigare: AgentResult[],
  uppgift: string,
): string {
  const rader: string[] = [
    `[Ursprungligt ärende, ordagrant: "${intent.text.replace(/\s+/g, ' ').trim()}"]`,
  ]

  if (tidigare.length > 0) {
    rader.push('[Vad kollegorna redan gjort:]')
    for (const r of tidigare) {
      const namn = AGENT_CAPABILITIES[r.agent]?.name || r.agent
      rader.push(`- ${namn} (${statusOrd(r.status)}): ${r.summary || '—'}`)
    }
  }

  rader.push(`[Din uppgift: ${uppgift.trim() || 'ta över ärendet inom ditt område'}]`)
  rader.push('Svara kort. Påstå aldrig att något är gjort som du inte själv gjort.')

  return rader.join('\n')
}

function statusOrd(status: StepStatus): string {
  switch (status) {
    case 'completed': return 'klart'
    case 'awaiting_approval': return 'väntar på godkännande'
    case 'partial': return 'delvis klart'
    case 'failed': return 'gick inte'
  }
}

/**
 * Ska Matte återta samtalet och summera? Ja när flera specialister varit
 * inne, och alltid när något inte blev klart — det är då en falsk
 * "klart!"-känsla annars uppstår. En ensam lyckad specialist får behålla
 * ordet; att lägga en sammanfattning där vore bara brus.
 */
export function shouldMatteSummarize(results: AgentResult[]): boolean {
  if (results.length === 0) return false
  return results.length >= 2 || results.some(r => r.status !== 'completed')
}

/**
 * Matte bokför vad som hände. Deterministisk — inget modellanrop, ingen
 * omskrivning, inga påståenden utöver de tre listorna.
 */
export function buildOrchestrationSummary(results: AgentResult[]): string {
  const klara = results.filter(r => r.status === 'completed')
  const väntande = results.filter(r => r.status === 'awaiting_approval')
  const halva = results.filter(r => r.status === 'partial')
  const misslyckade = results.filter(r => r.status === 'failed')

  const rader: string[] = []
  const namn = (r: AgentResult) => AGENT_CAPABILITIES[r.agent]?.name || r.agent
  const rad = (r: AgentResult) => `• ${namn(r)}: ${r.summary || 'inget att rapportera'}`

  if (klara.length > 0) {
    rader.push('Klart:')
    rader.push(...klara.map(rad))
  }
  if (väntande.length > 0) {
    if (rader.length) rader.push('')
    rader.push('Väntar på ditt godkännande:')
    rader.push(...väntande.map(rad))
  }
  if (halva.length > 0) {
    if (rader.length) rader.push('')
    rader.push('Delvis klart:')
    rader.push(...halva.map(r => `${rad(r)} (${felText(r)})`))
  }
  if (misslyckade.length > 0) {
    if (rader.length) rader.push('')
    rader.push('Gick inte:')
    rader.push(...misslyckade.map(r => `• ${namn(r)}: ${felText(r)}`))
  }

  return rader.join('\n')
}

function felText(r: AgentResult): string {
  const fel = r.actions.filter(a => a.status === 'failed')
  if (fel.length === 0) return 'okänt fel'
  return fel.map(a => a.error || `${a.tool} misslyckades`).join('; ')
}
