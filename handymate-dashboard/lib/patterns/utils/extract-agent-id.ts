/**
 * extract-agent-id.ts (Fas 1a Dag 3, 2026-05-30).
 *
 * EN sanning för "vilken agent skapade denna approval?".
 *
 * Två konsumenter MÅSTE använda denna helper för att inte drifta isär:
 *   1. lib/agents/shared/save-and-push.ts (rate-limit: räkna dagens
 *      approvals per agent för att gate:a >3/dag)
 *   2. lib/patterns/calculators/approve-rate.ts (approve-rate per agent
 *      för Fas 1 pattern-extraction)
 *
 * Om saveAndPush räknar "Karin har 3 idag" och approve-rate räknar
 * "Karin har inga" → divergens. Rate-limit blockar, approve-rate säger
 * "ingen data". Båda fel.
 *
 * Policy (en sanning, hårdkodad här):
 *   1. payload->>'agent_id' — typed actions (Dag 2 Karin/Daniel/Lisa)
 *   2. payload->>'routed_agent' fallback — generic agent_observation
 *      (Lars, Hanna, legacy)
 *   3. null om ingen — approval-typer som inte tillhör en agent
 *      (ex. autopilot_package, dispatch_suggestion). Exkluderas från
 *      per-agent-stats.
 *
 * Princip: samma som verify-ownership, strip-prices, deriveMarginalState
 * — delad helper hindrar future drift.
 */

/**
 * Subset av pending_approvals-rad som extractAgentId behöver.
 * Calculator-call-sites lägger till andra fält de behöver utöver detta.
 */
export interface ApprovalForAgentExtraction {
  payload: Record<string, unknown> | null
}

/**
 * Returnerar agent-id om approval kan attribueras till en specifik agent,
 * annars null. Null = approval tillhör inget agent-flöde (autopilot,
 * dispatch m.fl.) och ska EXKLUDERAS från per-agent-statistik.
 *
 * Caller är ansvarig för att hantera null:
 *   - Rate-limit: räkna inte null mot någon agents kvot
 *   - approve-rate: hoppa över null-rader (de räknas inte i sample_size)
 *
 * Implementation: case-insensitive string-extraction. Returnerar trimmad
 * lowercase-string för konsekvent matchning.
 */
export function extractAgentId(approval: ApprovalForAgentExtraction): string | null {
  const payload = approval.payload
  if (!payload || typeof payload !== 'object') return null

  // 1. agent_id (typed actions, högsta prioritet)
  const agentId = payload.agent_id
  if (typeof agentId === 'string' && agentId.trim().length > 0) {
    return agentId.trim().toLowerCase()
  }

  // 2. routed_agent (legacy/generic agent_observation fallback)
  const routedAgent = payload.routed_agent
  if (typeof routedAgent === 'string' && routedAgent.trim().length > 0) {
    return routedAgent.trim().toLowerCase()
  }

  // 3. Ingen agent → exkludera från per-agent-stats
  return null
}
