/**
 * lib/matte/ask-coverage.ts (Etapp L, Mission Control — ask-täckningsmätningen).
 *
 * Instrument, INTE en produktfunktion. Andreas roadmap-underlag: av allt
 * som ställs till Matte per tur, hur mycket kunde faktiskt hanteras
 * mekaniskt (fanns ett verktyg, krävde det ett godkännande, gjordes det)?
 * Svaret matas ur samma metering-kanal som redan bokför tokenkostnaden
 * (meterDirectLlmCall, refType 'matte_chat_turn') — ingen ny tabell.
 *
 * ═══ VAD SOM MÄTS — MEKANISKT, INTE TOLKAT ═══
 *
 * Hela klassificeringen härleds ur samma härledda fält orkestreringslagret
 * redan bygger (lib/agent/orchestration.ts): verktygens FAKTISKA utfall
 * (steg-actions), antal specialister som togs in, och vilken presentation
 * (om någon) turen slutade i. Inget språkmodellsanrop bedömer något här —
 * en modell som fick betygsätta sin egen täckning är exakt den part som kan
 * ha fel om saken (samma princip som deriveStepStatus i orchestration.ts).
 *
 * ═══ VAD SOM INTE MÄTS — MEDVETEN V1-GRÄNS ═══
 *
 * Den fulla kedjan i planen är: förstod → kunde planera → hade verktyg →
 * krävde beslut → utfördes → verifierades. Bara de fyra sista fångas här:
 *
 *   - "förstod" och "kunde planera" kräver ett omdöme om vad frågan
 *     egentligen bad om — det är LLM-bedömning, inte en mekanisk härledning,
 *     och hör hemma i en senare, uttryckligen språkmodellsdriven version.
 *     Att smyga in dem här hade brutit hela poängen med instrumentet: att
 *     varje fält går att härleda från samma spår som redan finns, utan att
 *     någon (människa eller modell) tolkar vad ärendet "egentligen" var.
 *
 *   - "verifierades" går inte att avgöra INOM turen — ett godkännande kan
 *     exekveras timmar senare, i en helt annan HTTP-request. Att avgöra det
 *     är en analys-tidsfråga (facit: JOIN:a ref_id mot approvals i efterhand),
 *     inte en logg-tidsfråga. Ett fält som alltid vore null eller alltid
 *     gissat vore sämre än att inte ha det alls.
 *
 * ═══ INGEN FRI SLUTANVÄNDARTEXT FÅR IN HÄR ═══
 *
 * Den här filen tar aldrig emot och lagrar aldrig själva meddelandet någon
 * skrev. Bara härledda, kategoriska fält (antal, status, ett enumvärde för
 * vilken sorts strukturerad vy turen visade). Facit i
 * tests/ask-coverage.spec.ts skannar den här filens KÄLLKOD och underkänner
 * den om ett fält för själva meddelandeinnehållet någonsin dyker upp här.
 */

import type { AgentResult } from '@/lib/agent/orchestration'

export interface AskCoverage {
  version: 1
  tool_calls: number
  outcomes: { completed: number; awaiting_approval: number; failed: number }
  handoff_count: number
  presentation_kind: 'business_scenario' | 'mission_plan' | null
  // Funnelflaggor, mekaniskt härledda — se filhuvudet för vad som INTE ingår.
  /** tool_calls > 0 */
  hade_verktyg: boolean
  /** minst ett verktygsanrop lades i godkännandekön i stället för att verkställas */
  kravde_beslut: boolean
  /** minst ett verktygsanrop verkställdes faktiskt */
  utfordes: boolean
  /** noll verktygsanrop OCH noll specialister — en ren konversations-/svarsvända.
      INTE ett misslyckande, bara en egen klass: turen bad aldrig om en åtgärd. */
  ingen_atgard: boolean
}

/**
 * Bygger ask-täckningsposten för EN chattur.
 *
 * `steps` är de AgentResult som orkestreringsloopen redan ackumulerar under
 * turen (lib/agent/orchestration.ts, toAgentResult) — vid bokföringstillfället
 * i app/api/matte/chat/route.ts finns inga råa verktygsutfall kvar i scope
 * (de är förbrukade in i respektive AgentResult.actions redan i loopen), så
 * räkningen görs mot actions i stället för mot ett separat ToolOutcome[]-spår.
 * `handoffCount` speglar hur många specialister (utöver Matte själv) som togs
 * in i turen. `presentation` är den sista strukturerade vyn turen visade, om
 * någon — bara dess `kind`, aldrig själva innehållet.
 */
export function byggAskCoverage(input: {
  steps: AgentResult[]
  handoffCount: number
  presentation: { kind: string } | null
}): AskCoverage {
  const actions = input.steps.flatMap(step => step.actions)

  const outcomes = {
    completed: actions.filter(a => a.status === 'completed').length,
    awaiting_approval: actions.filter(a => a.status === 'awaiting_approval').length,
    failed: actions.filter(a => a.status === 'failed').length,
  }
  const toolCalls = actions.length
  const handoffCount = Math.max(0, input.handoffCount)

  const rawKind = input.presentation?.kind
  const presentationKind: AskCoverage['presentation_kind'] =
    rawKind === 'business_scenario' || rawKind === 'mission_plan' ? rawKind : null

  return {
    version: 1,
    tool_calls: toolCalls,
    outcomes,
    handoff_count: handoffCount,
    presentation_kind: presentationKind,
    hade_verktyg: toolCalls > 0,
    kravde_beslut: outcomes.awaiting_approval > 0,
    utfordes: outcomes.completed > 0,
    ingen_atgard: toolCalls === 0 && handoffCount === 0,
  }
}
