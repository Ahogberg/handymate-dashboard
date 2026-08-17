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

export const MAX_MISSION_STEPS = 5

export interface MissionPlanStepInput {
  item_id: string
  motivation: string
}

export interface MissionPlanInput {
  goal_kr: number
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
 * som helst); inga dubbletter; goal_kr ändligt och > 0; deadline ett datum
 * STRIKT efter idag (ren datumjämförelse — svensk arbetsdagssemantik krävs
 * inte i V1).
 */
export function validateMissionPlan(
  plan: MissionPlanInput,
  portfolio: OpportunityPortfolio,
  now: Date,
): PlanValidationResult {
  if (!(typeof plan.goal_kr === 'number' && Number.isFinite(plan.goal_kr) && plan.goal_kr > 0)) {
    return { ok: false, reason: 'bad_goal', detail: 'Målet måste vara ett belopp större än noll.' }
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
