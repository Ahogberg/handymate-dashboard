/**
 * Eskaleringsklassaren (Etapp Å) — den SLUTNA listan deterministiska
 * klasser som får pusha ägaren under ett aktivt frånvarofönster. En LLM
 * avgör ALDRIG vad som är akut här — det här är ren kod, en uttömmande
 * switch över en sluten händelsetyp (AbsenceEvent).
 *
 * Klassens mappning mot befintliga signaler (ingen ny sanning uppfinns):
 *   promise_deadline        — pending_approvals.approval_type ===
 *                              'promise_deadline_signal' (löfteskedjan,
 *                              app/api/cron/promise-deadlines, 07:20)
 *   mandate_paused          — pending_approvals.approval_type ===
 *                              'mandate_paused_signal' (lib/mandates/
 *                              mission-mandate.ts)
 *   external_delivery_failure — billing_event/automation_activity-svepets
 *                              motsvarighet (se AutomationActivityEvent)
 *   payment_failed           — billing_event.event_type === 'payment_failed'
 *                              (driftlarm-svepets billing-del)
 *   autonomy_cap_refusal     — pending_approvals.payload.cap_exceeded ===
 *                              true (taggas vid skapande, se app/api/cron/
 *                              send-reminders och quote-follow-up — samma
 *                              kort som redan skapas idag, ingen ny rad)
 *   high_risk_approval       — pending_approvals.risk_level === 'high'
 *
 * En AbsenceEvent-variant utan egen case i switchen är ett TYPFEL vid
 * kompilering (never-checken i default-grenen) — samma fail-closed-princip
 * som lib/agent/external-actor.ts, fast här behövs den verkliga
 * uttömmande-switch-formen eftersom AbsenceEvent (till skillnad från fria
 * verktygsnamnssträngar) FAKTISKT är en sluten union av tre källor.
 */

export type EscalationClass =
  | 'promise_deadline'
  | 'mandate_paused'
  | 'external_delivery_failure'
  | 'payment_failed'
  | 'autonomy_cap_refusal'
  | 'high_risk_approval'

export const ESCALATION_CLASSES: readonly EscalationClass[] = [
  'promise_deadline',
  'mandate_paused',
  'external_delivery_failure',
  'payment_failed',
  'autonomy_cap_refusal',
  'high_risk_approval',
]

/** Klassen ELLER 'samlas' — normalfallet: undertryck pushen, händelsen
 *  ligger kvar precis som idag (i kön/DB), bara pushen hålls tillbaka. */
export type EscalationResult = EscalationClass | 'samlas'

export function isEscalationClass(value: unknown): value is EscalationClass {
  return typeof value === 'string' && (ESCALATION_CLASSES as readonly string[]).includes(value)
}

/**
 * Ett pending_approvals-kort — den ENA chokepoint alla pushar redan går
 * igenom (lib/notifications/approval-push.ts sendApprovalPush).
 */
export interface PendingApprovalEvent {
  kind: 'pending_approval'
  approvalType: string
  riskLevel: string | null
  payload: Record<string, unknown> | null
}

/** En rad ur billing_event (driftlarm-svepets betalningsdel). */
export interface BillingEvent {
  kind: 'billing_event'
  eventType: string
}

/**
 * En rad ur den slagna aktivitetsloggen (driftlarm-svepets
 * automation_activity-del — samma tabell rapporteraTystFel skriver till).
 */
export interface AutomationActivityEvent {
  kind: 'automation_activity'
  status: string
}

export type AbsenceEvent = PendingApprovalEvent | BillingEvent | AutomationActivityEvent

const PROMISE_DEADLINE_TYPE = 'promise_deadline_signal'
const MANDATE_PAUSED_TYPE = 'mandate_paused_signal'

function classifyPendingApproval(event: PendingApprovalEvent): EscalationResult {
  // En syntetisk push från driftlarmet (app/api/cron/driftlarm/route.ts,
  // billing_event/automation_activity → ägar-push) har REDAN klassats via
  // denna funktion innan den byggdes sitt syntetiska kort — taggen
  // verifieras här mot samma slutna lista i stället för att förlita sig
  // blint på payloaden. Samma auktoritet, två anropsställen.
  const tagged = event.payload?.escalation_class
  if (isEscalationClass(tagged)) return tagged

  if (event.approvalType === PROMISE_DEADLINE_TYPE) return 'promise_deadline'
  if (event.approvalType === MANDATE_PAUSED_TYPE) return 'mandate_paused'
  if (event.payload?.cap_exceeded === true) return 'autonomy_cap_refusal'
  if (event.riskLevel === 'high') return 'high_risk_approval'
  return 'samlas'
}

/**
 * Klassar en typad händelse deterministiskt. Uttömmande switch — en
 * framtida fjärde AbsenceEvent-variant utan egen case ger ett
 * kompileringsfel här (never-checken), inte ett tyst missat larm.
 */
export function classifyAbsenceEvent(event: AbsenceEvent): EscalationResult {
  switch (event.kind) {
    case 'pending_approval':
      return classifyPendingApproval(event)
    case 'billing_event':
      return event.eventType === 'payment_failed' ? 'payment_failed' : 'samlas'
    case 'automation_activity':
      return event.status === 'failed' ? 'external_delivery_failure' : 'samlas'
    default: {
      const oklassad: never = event
      throw new Error(`Okänd händelsetyp i frånvaro-eskaleringen: ${JSON.stringify(oklassad)}`)
    }
  }
}

/**
 * Statusradens räkning ("X händelser samlade, Y eskaleringar") — ren
 * funktion över redan hämtade pending_approvals-rader (skapade sedan
 * fönstret öppnades). Samma klassare som push-strypunkten, så statusraden
 * ALDRIG kan säga något annat än vad som faktiskt hände med pushen.
 */
export function raknaFranvaroStatus(
  approvals: Array<{ approval_type: string; risk_level: string | null; payload: Record<string, unknown> | null }>,
): { samlade: number; eskaleringar: number } {
  let samlade = 0
  let eskaleringar = 0
  for (const a of approvals) {
    const cls = classifyAbsenceEvent({
      kind: 'pending_approval',
      approvalType: a.approval_type,
      riskLevel: a.risk_level,
      payload: a.payload,
    })
    if (cls === 'samlas') samlade++
    else eskaleringar++
  }
  return { samlade, eskaleringar }
}
