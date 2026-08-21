/**
 * AgentInteraction — den lilla presentationsformen (Codex audit avsnitt 7–8,
 * Epic 3).
 *
 * ═══ VAD DEN ÄR, OCH SÄRSKILT VAD DEN INTE ÄR ═══
 *
 * Det här är INGEN ny datamodell och inget eventsystem. Approvals förblir den
 * auktoritativa säkerhetsrecorden, chattmeddelanden förblir konversations-
 * historik, moments förblir härledda ur befintliga rader. AgentInteraction är
 * bara ett gemensamt SÄTT ATT VISA dem — en adapter ovanpå data som redan
 * finns, så att samma agent ser ut som samma person oavsett yta.
 *
 * Auditens konkreta fynd: MatteChatModal ritade Mattes porträtt på ALLA svar,
 * även när Karin var den som svarade, och nöjde sig med en fotnot "💬 via
 * Karin". Jobbkompisen hade en egen kopia av exakt samma fotnot. Två ytor,
 * två renderingar, fel ansikte på båda.
 *
 * ═══ IDENTITETSKONTRAKTET ═══
 *
 * `AgentId → namn, roll, porträtt, accent, kort verb`. Verbet är det som gör
 * att raden läses som en kollega som gjort något ("Karin förberedde…") i
 * stället för ett systemmeddelande. Data hämtas ur AGENT_INFO, som i sin tur
 * härleds ur TEAM — ingen fjärde kopia av teamet.
 */

import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { agentForApproval, TYPE_LABEL } from '@/lib/jarvis/approval-view'
import type { AgentMoment } from '@/lib/moments/derive'
import type { BusinessScenarioPresentation } from '@/lib/business-twin/scenario-contract'
import type { MissionPlanPresentation } from '@/lib/mission/mission-presentation'

/** De två presentationskorten AgentMessage.tsx kan rendera under en bubbla —
 *  widened i Etapp C (Goal-to-Plan V1) utan att röra business-scenario-grenen. */
export type AgentPresentation = BusinessScenarioPresentation | MissionPlanPresentation

/** Statusspråket är Epic 2:s — samma ord i koden som på skärmen. */
export type InteractionStatus =
  | 'completed'
  | 'awaiting_approval'
  | 'partial'
  | 'failed'
  | 'informational'

export type InteractionMode = 'informational' | 'proposal' | 'question' | 'result' | 'error' | 'handoff'

export interface AgentInteraction {
  id: string
  source: 'chat' | 'moment' | 'approval'
  agentKey: string
  mode: InteractionMode
  status: InteractionStatus
  /** Huvudtexten. Aldrig omskriven av adaptern — bara vidarebefordrad. */
  body: string
  /** Vad agenten gjorde, i tredje person: "Karin förberedde". */
  byline: string
  value?: { amountKr: number; label: string }
  target?: { label: string; href: string }
  approvalId?: string
  presentation?: AgentPresentation
}

export interface AgentIdentity {
  id: string
  name: string
  role: string
  initials: string
  /** Accentfärgen — bor BARA i avataren (se AgentAvatar). */
  dot: string
  /** Tredjepersonsverbet i bylinen: "Daniel hittade", "Karin förberedde". */
  shortVerb: string
}

/**
 * Verben är medvetet olika per agent. Ett gemensamt "uppdaterade" hade gjort
 * teamet till ett system igen; det är skillnaden mellan att Daniel HITTAR
 * något och att Lars KONTROLLERAR något som gör rollerna begripliga utan att
 * hantverkaren behöver lära sig teamets organisation.
 */
const SHORT_VERB: Record<string, string> = {
  matte: 'sammanställde',
  karin: 'förberedde',
  daniel: 'hittade',
  lars: 'kontrollerade',
  hanna: 'föreslog',
  lisa: 'tog emot',
  support: 'svarade',
}

export function agentIdentity(agentKey: string | null | undefined): AgentIdentity {
  const key = (agentKey || 'matte').toLowerCase()
  const info = AGENT_INFO[key]
  if (!info) {
    // Okänd agent får aldrig en gissad identitet — samma regel som
    // AgentAvatar: hellre neutral än fel person.
    return { id: key, name: 'Teamet', role: '', initials: '?', dot: '#64748b', shortVerb: 'noterade' }
  }
  return {
    id: key,
    name: info.name,
    role: info.role,
    initials: info.initials,
    dot: info.dot,
    shortVerb: SHORT_VERB[key] || 'noterade',
  }
}

/** "Karin · Ekonom förberedde" — utan roll om agenten saknar en. */
export function byline(agentKey: string): string {
  const id = agentIdentity(agentKey)
  return id.role ? `${id.name} · ${id.role} ${id.shortVerb}` : `${id.name} ${id.shortVerb}`
}

/** Svenska ord för statusen. Används på alla tre ytorna — samma ord överallt. */
export function statusLabel(status: InteractionStatus): string | null {
  switch (status) {
    case 'awaiting_approval': return 'Väntar på ditt godkännande'
    case 'partial': return 'Delvis klart'
    case 'failed': return 'Gick inte'
    case 'completed': return 'Klart'
    case 'informational': return null
  }
}

// ── Adaptrar: tre konkreta ytor, ingen generell motor ────────────────────

export interface ChatMessageLike {
  id?: string
  role: 'user' | 'assistant'
  content: string
  agent?: string | null
  is_handoff_announcement?: boolean
  /** Sätts av orkestreringen på Mattes sammanfattning (Epic 2). */
  status?: InteractionStatus | null
  presentation?: AgentPresentation
}

export function fromChatMessage(msg: ChatMessageLike, index = 0): AgentInteraction {
  const agentKey = (msg.agent || 'matte').toLowerCase()
  const status: InteractionStatus = msg.status || 'informational'
  return {
    id: msg.id || `chat:${index}`,
    source: 'chat',
    agentKey,
    mode: msg.is_handoff_announcement ? 'handoff' : status === 'informational' ? 'informational' : 'result',
    status,
    body: msg.content,
    byline: byline(agentKey),
    ...(msg.presentation ? { presentation: msg.presentation } : {}),
  }
}

export function fromMoment(moment: AgentMoment): AgentInteraction {
  return {
    id: moment.id,
    source: 'moment',
    agentKey: moment.agentId,
    // Ett fynd är alltid informational tills hantverkaren öppnar det —
    // ett moment får aldrig se ut som en redan utförd åtgärd.
    mode: 'informational',
    status: 'informational',
    body: moment.headline,
    byline: byline(moment.agentId),
    ...(typeof moment.amountKr === 'number'
      ? { value: { amountKr: moment.amountKr, label: moment.valueKind } }
      : {}),
    target: { label: moment.action.label, href: moment.action.href },
  }
}

export interface ApprovalLike {
  id?: string
  approval_type: string
  risk_level?: string | null
  payload?: Record<string, unknown> | null
  status?: string | null
}

export function fromApproval(approval: ApprovalLike): AgentInteraction {
  const agentKey = agentForApproval(approval)
  const typLabel = TYPE_LABEL[approval.approval_type] || approval.approval_type
  const status: InteractionStatus =
    approval.status === 'approved' || approval.status === 'executed' ? 'completed'
    : approval.status === 'failed' ? 'failed'
    : 'awaiting_approval'
  return {
    id: approval.id || `appr:${approval.approval_type}`,
    source: 'approval',
    agentKey,
    mode: status === 'awaiting_approval' ? 'proposal' : 'result',
    status,
    body: typLabel,
    byline: byline(agentKey),
    ...(approval.id ? { approvalId: approval.id } : {}),
  }
}
