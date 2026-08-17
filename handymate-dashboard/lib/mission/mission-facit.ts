/**
 * Uppdragsfacit — per-uppdrags-summering för historik + per-agent-läge +
 * Mission Learning-läslagret (Etapp H, tasks/jaunty-pondering-hummingbird.md).
 *
 * ═══ PLANANSVAR ≠ UTFÖRANDE (Codex-precision 1) ═══
 *
 * Ett plansteg säger vem som ÄR TÄNKT att göra jobbet — ingenting mer.
 * `ansvarar_steg` kommer UTESLUTANDE ur mission.plan_snapshot.steps[].agent_key.
 * `utforda`/`vantar`/`kunde_inte_verifieras` kommer UTESLUTANDE ur uppdragets
 * approval-kedja (pending_approvals via payload.mission_id, samma läsning
 * som mission-progress.ts): agenten avgörs av agentForApproval() (lib/jarvis/
 * approval-view.ts — samma attribuering som resten av teamytorna), utfallet
 * av approval.status + payload.execution_result.outcome (lib/approvals/
 * execution-outcome.ts). De två räknarna delar ALDRIG källa. Ett uppdrag där
 * Karin äger två plansteg men noll godkännanden någonsin skapats ger
 * ansvarar_steg: 2, utforda: 0 — planen lovade, ingenting hände än.
 *
 * ═══ LÄRANDE-GRINDEN (Codex-precision 2) ═══
 *
 * learning_eligible är sann ENDAST för status 'completed' UTAN degraderings-
 * blockerare (kapaciteten okonfigurerad, eller en plan utan ett enda steg).
 * 'cancelled'/'expired'/'active' är ALDRIG lärandeexempel — de syns i
 * historiken, men lär aldrig ut något (lib/mission/mission-learning.ts
 * filtrerar strikt på det här fältet). Varje icke-eligible rad bär sin egen
 * svenska blockerare i learning_blockers, aldrig en tom förklaring.
 *
 * ═══ VERIFIERAT BETALT ═══
 *
 * Samma tal som mission-progress.ts:s gap_kr bygger på (Etapp D-regeln:
 * summan av VERIFIERAT BETALDA kronor över kr-klasserna är samma
 * epistemiska klass, inte den förbjudna klassblandningen) — redan
 * fakturadedupat inom uppdraget av byggMissionProgress:s attributionsloop.
 * Den här filen räknar aldrig om det, den läser bara resultatet.
 *
 * Ren kärna (byggMissionFacit) + fail-soft I/O (listMissionFacit) — samma
 * tvådelning som mission-progress.ts. Ett läsfel för HELA mission-tabellen
 * ger tom lista; ett läsfel för ETT enskilt uppdrags approval-/faktura-
 * indata ger det uppdraget ett nollfacit (samma idiom som
 * getMissionProgress) i stället för att dra ner hela historiken.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { agentForApproval } from '@/lib/jarvis/approval-view'
import { resolveGoalType, type MissionGoalType } from './goal-type'
import { buildMissionHeadline } from './mission-summary'
import { KR_CLASS_ORDER } from './progress-parts'
import {
  byggMissionProgress,
  loadMissionProgressInputs,
  type MissionApprovalInput,
  type MissionCapacityWeekInput,
  type MissionContactOutcomeInput,
  type MissionInvoiceInput,
  type MissionQuoteInput,
  type MissionRow,
} from './mission-progress'

export interface AgentUtfall {
  /** Ur plan_snapshot.agent_key — "ansvarar". */
  agent_key: string
  /** Antal plansteg tilldelade agenten. Kommer ALDRIG från approval-raderna. */
  ansvarar_steg: number
  /** Godkända/auto-godkända mission-kort med execution_result.outcome==='success'. */
  utforda: number
  /** Mission-kort med status 'pending'. */
  vantar: number
  /** Resolverat kort utan verifierbart lyckat utfall (failed/skipped/okänt). */
  kunde_inte_verifieras: number
}

export interface MissionFacit {
  mission_id: string
  goal_type: MissionGoalType
  status: 'completed' | 'cancelled' | 'expired' | 'active'
  headline: string
  deadline: string
  resolved_at: string | null
  /** Slutgap för pengamål. null för kapacitets-/kontaktmål. */
  slutgap_kr: number | null
  /** Slutgap för kapacitetsmål. null för penga-/kontaktmål. */
  slutgap_hours: number | null
  /** Etapp I. Slutgap för kontaktmål (goal_count − kontaktade). null för
      penga-/kapacitetsmål. */
  slutgap_count: number | null
  /** Bara kr-klasserna, fakturadedupat inom uppdraget (se filhuvudet). */
  verifierat_betalt_kr: number
  learning_eligible: boolean
  /** Svenska skäl till varför uppdraget INTE är ett lärandeexempel — tom när eligible. */
  learning_blockers: string[]
  per_agent: AgentUtfall[]
}

/** Utfallet av ETT approval-kort ur mission-facits perspektiv — ren
    klassificering, ingen I/O. Delar aldrig källa med ansvarar_steg. */
function klassificeraApproval(approval: MissionApprovalInput): 'utforda' | 'vantar' | 'kunde_inte_verifieras' {
  if (approval.status === 'pending') return 'vantar'
  const execution = approval.payload?.execution_result
  const outcome = execution && typeof execution === 'object'
    ? (execution as Record<string, unknown>).outcome
    : undefined
  return outcome === 'success' ? 'utforda' : 'kunde_inte_verifieras'
}

/**
 * Ren kärna. Bygger EN MissionFacit-rad ur samma indataform som
 * byggMissionProgress (mission + dess redan inlästa approvals/fakturor/
 * offerter/kapacitetsvecka) — kör internt byggMissionProgress för
 * gap_kr/gap_hours/per_class i stället för att räkna om attributionen.
 */
export function byggMissionFacit(input: {
  mission: MissionRow
  invoices: MissionInvoiceInput[]
  missionApprovals: MissionApprovalInput[]
  quotes: MissionQuoteInput[]
  nowMs: number
  capacityWeek?: MissionCapacityWeekInput | null
  /** Etapp I — pre-derived kontaktutfall, se lib/mission/mission-progress.ts. */
  contactOutcomes?: MissionContactOutcomeInput[]
}): MissionFacit {
  const { mission, missionApprovals } = input
  const goalType = resolveGoalType(mission.goal_type)
  const progress = byggMissionProgress(input)
  const steps = Array.isArray(mission.plan_snapshot?.steps) ? mission.plan_snapshot.steps : []

  let verifieratBetaltKr = 0
  for (const cls of KR_CLASS_ORDER) {
    verifieratBetaltKr += progress.per_class[cls]?.verified_paid_kr ?? 0
  }

  const headline = buildMissionHeadline(
    mission.goal_kr ?? 0,
    mission.deadline.slice(0, 10),
    goalType === 'capacity'
      ? { goalType, goalHours: mission.goal_hours ?? undefined }
      : goalType === 'contact'
        ? { goalType, goalCount: mission.goal_count ?? undefined }
        : undefined,
  )

  // ── Lärande-grinden — se filhuvudet. Varje icke-completed status har sin
  //    egna svenska blockerare; completed kollar degraderingarna. ─────────
  const blockers: string[] = []
  if (mission.status === 'cancelled') {
    blockers.push('avbrutet uppdrag')
  } else if (mission.status === 'expired') {
    blockers.push('utgånget uppdrag')
  } else if (mission.status === 'active') {
    blockers.push('uppdraget pågår fortfarande')
  } else {
    if (steps.length === 0) blockers.push('ingen plan sattes')
    if (goalType === 'capacity' && progress.capacity_unconfigured) blockers.push('kapacitet ej konfigurerad')
    // Kontaktmål har ingen egen "okonfigurerad"-degradering (till skillnad
    // från kapacitet finns ingen extern inställning som kan saknas) — ett
    // completed kontaktuppdrag med minst ett plansteg är alltså eligible
    // som vilket annat completed uppdrag som helst.
  }
  const learningEligible = mission.status === 'completed' && blockers.length === 0

  // ── Per-agent — två helt separata räknare, se filhuvudet. ──────────────
  const agentMap = new Map<string, AgentUtfall>()
  const agent = (key: string): AgentUtfall => {
    let entry = agentMap.get(key)
    if (!entry) {
      entry = { agent_key: key, ansvarar_steg: 0, utforda: 0, vantar: 0, kunde_inte_verifieras: 0 }
      agentMap.set(key, entry)
    }
    return entry
  }
  for (const step of steps) {
    if (typeof step.agent_key === 'string' && step.agent_key) agent(step.agent_key).ansvarar_steg += 1
  }
  for (const approval of missionApprovals) {
    const key = agentForApproval(approval)
    agent(key)[klassificeraApproval(approval)] += 1
  }
  const perAgent = Array.from(agentMap.values()).sort((a, b) => a.agent_key.localeCompare(b.agent_key))

  return {
    mission_id: mission.id,
    goal_type: goalType,
    status: mission.status,
    headline,
    deadline: mission.deadline,
    resolved_at: mission.resolved_at,
    slutgap_kr: progress.gap_kr,
    slutgap_hours: progress.gap_hours,
    slutgap_count: progress.gap_count,
    verifierat_betalt_kr: verifieratBetaltKr,
    learning_eligible: learningEligible,
    learning_blockers: blockers,
    per_agent: perAgent,
  }
}

function normaliseraRad(raw: MissionRow): MissionRow {
  return {
    ...raw,
    goal_kr: raw.goal_kr == null ? null : Number(raw.goal_kr),
    goal_type: resolveGoalType(raw.goal_type),
    goal_hours: raw.goal_hours == null ? null : Number(raw.goal_hours),
    goal_count: raw.goal_count == null ? null : Number(raw.goal_count),
  }
}

/**
 * Fail-soft I/O: senaste `limit` uppdragen (alla statusar, nyast först) för
 * företaget, varje rad som ett MissionFacit. Ett fel vid mission-uppslaget
 * (tabellen kan saknas — sql/v144 körs manuellt) ger tom lista. Ett fel vid
 * ETT enskilt uppdrags indata (approvals/fakturor/kapacitet) ger det
 * uppdraget ett nollfacit i stället för att fälla hela historiken — samma
 * degraderingsnivå som getMissionProgress redan använder per uppdrag.
 */
export async function listMissionFacit(
  supabase: SupabaseClient,
  businessId: string,
  limit = 12,
): Promise<MissionFacit[]> {
  try {
    const { data, error } = await supabase
      .from('mission')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.warn('[mission-facit] mission-uppslag misslyckades (tom historik):', error.message)
      return []
    }

    const rows = Array.isArray(data) ? (data as MissionRow[]) : []
    const nowMs = Date.now()
    const facit: MissionFacit[] = []
    for (const raw of rows) {
      const mission = normaliseraRad(raw)
      try {
        const { invoices, missionApprovals, quotes, capacityWeek, contactOutcomes } = await loadMissionProgressInputs(supabase, mission, nowMs)
        facit.push(byggMissionFacit({ mission, invoices, missionApprovals, quotes, nowMs, capacityWeek, contactOutcomes }))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[mission-facit] indata för ett uppdrag kunde inte läsas (nollfacit):', msg)
        facit.push(byggMissionFacit({ mission, invoices: [], missionApprovals: [], quotes: [], nowMs, capacityWeek: null, contactOutcomes: [] }))
      }
    }
    return facit
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-facit] oväntat fel (tom historik):', msg)
    return []
  }
}
