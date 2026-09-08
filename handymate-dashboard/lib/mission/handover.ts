import type { MissionRow, MissionApprovalInput } from './mission-progress'
import { svDateStr } from '@/lib/dates'

export interface MissionHandover {
  state: 'needs_review' | 'needs_attention' | 'recorded' | 'expired'
  headline: string
  nextStep: string
  deadline: string
  checkedAt: string
  planned: Array<{ id: string; title: string; owner: string }>
  pending: number
  executed: number
  unverified: number
  followups?: Array<{id:string;quoteId:string;dueAt:string;label:string;detail:string}>
  scope: string
}
const AGENTS: Record<string, string> = { matte: 'Matte', daniel: 'Daniel', karin: 'Karin', hanna: 'Hanna', lars: 'Lars', lisa: 'Lisa' }

/** A saved plan proves intent, never that a scheduler or external delivery ran. */
export function deriveMissionHandover(mission: MissionRow, approvals: MissionApprovalInput[], now = new Date()): MissionHandover {
  let pending = 0, executed = 0, unverified = 0
  for (const row of approvals) {
    if (row.status === 'pending') { pending++; continue }
    if (['rejected', 'expired', 'cancelled'].includes(row.status)) continue
    const execution = row.payload?.execution_result as { outcome?: string } | undefined
    if (execution?.outcome === 'success') executed++
    else unverified++
  }
  const expired = mission.status !== 'active' || mission.deadline.slice(0, 10) < svDateStr(now)
  const state = expired ? 'expired' : unverified ? 'needs_attention' : pending ? 'needs_review' : 'recorded'
  return {
    state,
    headline: expired ? 'Uppdragets tidsram har passerat' : unverified ? 'En del behöver kontrolleras' : pending ? 'Teamet har förberett nästa beslut' : 'Din uppdragsplan finns sparad',
    nextStep: expired ? 'Gå igenom utfallet med Matte innan du startar en ny plan.'
      : unverified ? 'Öppna uppdragets historik och kontrollera utfallet före ett nytt försök.'
      : pending ? 'Granska de förberedda besluten. Planen i sig är inget godkännande av utskick.'
      : 'Öppna planen med Matte för att gå vidare. Här finns inget väntande beslut som bevisar att nästa steg är förberett.',
    deadline: mission.deadline.slice(0, 10), checkedAt: now.toISOString(), pending, executed, unverified,
    planned: (Array.isArray(mission.plan_snapshot?.steps) ? mission.plan_snapshot.steps : []).map(s => ({ id: s.item_id, title: s.title, owner: AGENTS[s.agent_key] ?? 'Teamet' })),
    scope: 'Gäller detta uppdrag. Tidsramen är ett mål, inte en bokad avstämning. Utförda åtgärder är inte samma sak som uppnått kundresultat.',
  }
}
