/**
 * Planvalidering — Goal-to-Plan V1 (Etapp A).
 *
 * ═══ LLM:EN PEKAR, SERVERN MÄTER ═══
 *
 * Chattverktyget (propose_mission_plan, Etapp B) levererar bara item_id:n
 * ur portföljen plus motiveringar. Inputtypen SAKNAR beloppfält helt — det
 * är typens jobb, inte en runtime-kontroll: ett mått som inte kan skickas
 * kan inte heller smugglas. Varje stegs mått, klass, bevis och kortkoppling
 * KOPIERAS här ur portföljens motsvarande item; extrafält som en modell
 * ändå hänger på inputobjektet ignoreras (facit-testat i
 * tests/mission-plan-validation.spec.ts).
 *
 * Ren funktion, ingen I/O. Anroparen (Etapp B) ansvarar för att portföljen
 * är FÄRSKT räknad — confirm_mission räknar om och omvaliderar före INSERT.
 */

import type { OpportunityPortfolio, PortfolioItem, PortfolioMeasure, TruthClass } from './opportunity-portfolio'
import { resolveGoalType, CAPACITY_GOAL_HOURS_MAX, CONTACT_GOAL_COUNT_MAX, type MissionGoalType } from './goal-type'

export const MAX_MISSION_STEPS = 5

export interface MissionPlanStepInput {
  item_id: string
  motivation: string
}

export interface MissionPlanInput {
  /** 'money' som standard när fältet saknas (resolveGoalType, se
      lib/mission/goal-type.ts) — samma fail-soft-default som lästa
      DB-rader använder. */
  goal_type?: MissionGoalType
  /** Krävs (ändligt, > 0) för pengamål. Ignoreras helt för kapacitetsmål —
      ett värde här bygger ALDRIG in sig i en kapacitetsplan. */
  goal_kr?: number
  /** Krävs (0 < n ≤ CAPACITY_GOAL_HOURS_MAX) för kapacitetsmål. Ignoreras
      helt för pengamål — timmar och kronor blandas aldrig. */
  goal_hours?: number
  /** Krävs (heltal, 0 < n ≤ CONTACT_GOAL_COUNT_MAX) för kontaktmål (Etapp I).
      Ignoreras helt för penga-/kapacitetsmål — antal kunder blandas aldrig
      med kronor eller timmar. */
  goal_count?: number
  deadline: string
  steps: MissionPlanStepInput[]
}

export interface ValidatedMissionStep {
  item_id: string
  truth_class: TruthClass
  title: string
  /** KOPIERAT från portföljens item — aldrig från input. */
  measure: PortfolioMeasure
  evidence: PortfolioItem['evidence']
  agent_key: string
  approval_type: string | null
  motivation: string
}

export type PlanValidationResult =
  | { ok: true; steps: ValidatedMissionStep[] }
  | {
      ok: false
      reason: 'unknown_item' | 'duplicate_item' | 'too_many_steps' | 'no_steps' | 'bad_goal' | 'bad_deadline'
      detail: string
    }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validerar en föreslagen plan mot en (färsk) portfölj.
 *
 * Regler: 1–5 steg; varje item_id måste finnas i portföljen (vilken klass
 * som helst); inga dubbletter; deadline ett datum STRIKT efter idag (ren
 * datumjämförelse — svensk arbetsdagssemantik krävs inte i V1). Målet
 * grenar på goal_type (Etapp F, Etapp I): pengamål kräver goal_kr ändligt
 * och > 0 (goal_hours/goal_count ignoreras helt); kapacitetsmål kräver
 * goal_hours ändligt, > 0 och ≤ CAPACITY_GOAL_HOURS_MAX (goal_kr/goal_count
 * ignoreras helt); kontaktmål kräver goal_count ett HELTAL, > 0 och ≤
 * CONTACT_GOAL_COUNT_MAX (goal_kr/goal_hours ignoreras helt) — pengar,
 * timmar och antal kan aldrig bli samma målsiffra.
 */
export function validateMissionPlan(
  plan: MissionPlanInput,
  portfolio: OpportunityPortfolio,
  now: Date,
): PlanValidationResult {
  const goalType = resolveGoalType(plan.goal_type)

  if (goalType === 'money') {
    if (!(typeof plan.goal_kr === 'number' && Number.isFinite(plan.goal_kr) && plan.goal_kr > 0)) {
      return { ok: false, reason: 'bad_goal', detail: 'Målet måste vara ett belopp större än noll.' }
    }
  } else if (goalType === 'capacity') {
    if (!(
      typeof plan.goal_hours === 'number'
      && Number.isFinite(plan.goal_hours)
      && plan.goal_hours > 0
      && plan.goal_hours <= CAPACITY_GOAL_HOURS_MAX
    )) {
      return {
        ok: false,
        reason: 'bad_goal',
        detail: `Kapacitetsmålet måste vara fler än 0 och högst ${CAPACITY_GOAL_HOURS_MAX} timmar.`,
      }
    }
  } else {
    if (!(
      typeof plan.goal_count === 'number'
      && Number.isFinite(plan.goal_count)
      && Number.isInteger(plan.goal_count)
      && plan.goal_count > 0
      && plan.goal_count <= CONTACT_GOAL_COUNT_MAX
    )) {
      return {
        ok: false,
        reason: 'bad_goal',
        detail: `Kontaktmålet måste vara ett heltal större än 0 och högst ${CONTACT_GOAL_COUNT_MAX} kunder.`,
      }
    }
  }

  const deadline = typeof plan.deadline === 'string' ? plan.deadline.trim().slice(0, 10) : ''
  const idag = now.toISOString().slice(0, 10)
  if (!DATE_ONLY.test(deadline) || !Number.isFinite(Date.parse(deadline)) || deadline <= idag) {
    return { ok: false, reason: 'bad_deadline', detail: 'Deadline måste vara ett datum efter idag (ÅÅÅÅ-MM-DD).' }
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    return { ok: false, reason: 'no_steps', detail: 'Planen måste ha minst ett steg.' }
  }
  if (plan.steps.length > MAX_MISSION_STEPS) {
    return { ok: false, reason: 'too_many_steps', detail: `Planen får ha högst ${MAX_MISSION_STEPS} steg.` }
  }

  const itemById = new Map<string, PortfolioItem>()
  for (const items of Object.values(portfolio.by_class)) {
    for (const item of items) itemById.set(item.id, item)
  }

  const sedda = new Set<string>()
  const steps: ValidatedMissionStep[] = []
  for (const step of plan.steps) {
    const itemId = typeof step?.item_id === 'string' ? step.item_id : ''
    if (sedda.has(itemId)) {
      return { ok: false, reason: 'duplicate_item', detail: `Steget ${itemId} förekommer mer än en gång.` }
    }
    sedda.add(itemId)
    const item = itemById.get(itemId)
    if (!item) {
      return { ok: false, reason: 'unknown_item', detail: `${itemId || '(saknat id)'} finns inte i den aktuella portföljen.` }
    }
    // Allt utom motiveringen kommer ur portföljens item — inputsteget får
    // bara bidra med sin pekare och sin text.
    steps.push({
      item_id: item.id,
      truth_class: item.truth_class,
      title: item.title,
      measure: { ...item.measure },
      evidence: { ...item.evidence },
      agent_key: item.agent_key,
      approval_type: item.approval_type,
      motivation: typeof step.motivation === 'string' ? step.motivation.trim().slice(0, 500) : '',
    })
  }

  return { ok: true, steps }
}
