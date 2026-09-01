export type AgentPushNotificationClass = 'important_happened' | 'decision_required'
export type AgentPushTargetKind = 'project' | 'approval'

/**
 * Liten presentationstransport för mobilen. Den bär aldrig kundnamn,
 * belopp eller approvalens exekveringspayload; mobilen hämtar alltid färsk
 * data efter tap. URL är avsiktligt inte en del av kontraktet.
 */
export interface AgentPushEnvelopeV1 {
  schema: 'agent_push_v1'
  notification_id: string
  notification_class: AgentPushNotificationClass
  agent_id: 'matte'
  target_kind: AgentPushTargetKind
  target_id: string
  issued_at: string
  expires_at: string
  privacy: 'discrete'
}

const SAFE_TARGET_ID = /^[A-Za-z0-9_-]{1,120}$/

function safeId(value: unknown): string | null {
  return typeof value === 'string' && SAFE_TARGET_ID.test(value) ? value : null
}

function validIsoOrNow(value: unknown): Date {
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

/**
 * P1-6-skivan: ÄTA-händelser får ett versionsmärkt projektmål i stället
 * för de lösa type/project_id-fält som mobilen väntade på men aldrig fick.
 */
export function buildAgentPushEnvelopeV1(
  approvalType: string,
  payload: Record<string, unknown>,
): AgentPushEnvelopeV1 | null {
  if (approvalType !== 'ata_signed_notification' && approvalType !== 'ata_declined_notification') {
    return null
  }

  const projectId = safeId(payload.project_id)
  const changeId = safeId(payload.change_id)
  if (!projectId || !changeId) return null

  const issued = validIsoOrNow(payload.signed_at ?? payload.declined_at)
  const expires = new Date(issued.getTime() + 30 * 24 * 60 * 60 * 1000)

  return {
    schema: 'agent_push_v1',
    notification_id: `${approvalType}:${changeId}`,
    notification_class: 'important_happened',
    agent_id: 'matte',
    target_kind: 'project',
    target_id: projectId,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
    privacy: 'discrete',
  }
}
