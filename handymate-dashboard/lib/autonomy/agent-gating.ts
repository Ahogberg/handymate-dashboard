/**
 * TD-52 (Andreas-beslut 2026-07-15) — godkännande-gate för agentens
 * send_sms/send_email-verktyg.
 *
 * Kärnprincip (produktlöftet: "allt agent-utskick går via ditt godkännande
 * eller förtjänat förtroende" ska vara BOKSTAVLIGEN sant):
 *  - triggerSource 'user'   → en levande människa initierade det här —
 *    dashboard-/mobil-chatt ELLER ett svar i en pågående kundkontakt
 *    (telefonsamtal/inkommande SMS/e-post). Skicka direkt, som idag.
 *  - triggerSource 'system' → agenten agerar autonomt (cron, schemalagd
 *    automation, agent-till-agent-delegering). Kräver godkännande OM INTE
 *    förtjänad autonomi är beviljad för den specifika åtgärdstypen.
 *
 * Ren beslutsfunktion — ingen I/O. Låst av tests/td52-gating.spec.ts så att
 * beslutstabellen inte kan glida isär från produktlöftet av misstag.
 */
export type AgentTriggerSource = 'user' | 'system'

export function shouldQueueForApproval(
  triggerSource: AgentTriggerSource,
  autonomyGranted: boolean
): boolean {
  if (triggerSource === 'user') return false
  return !autonomyGranted
}
