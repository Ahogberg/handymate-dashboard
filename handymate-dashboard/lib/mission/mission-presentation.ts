/**
 * Presentationskontrakt för uppdragsplaner i chatten — Goal-to-Plan V1
 * (Etapp A). Samma idiom som BusinessScenarioPresentation i
 * lib/business-twin/scenario-contract.ts: ingen lagringsmodell, bara det
 * typade lilla objekt som går från servern via thread_message.metadata till
 * chattens plan-kort (Etapp C).
 *
 * state-resan: 'proposal' skrivs av propose_mission_plan (mission_id null —
 * uppdraget existerar inte förrän ägaren bekräftat), 'confirmed' av
 * confirm_mission (mission_id satt). Stegen bär varje klass eget mått —
 * ytan får aldrig slå ihop dem.
 */

import type { ValidatedMissionStep } from './plan-validation'

export interface MissionPlanPresentation {
  kind: 'mission_plan'
  version: 1
  state: 'proposal' | 'confirmed'
  /** null tills ägaren bekräftat och mis_-raden finns. */
  mission_id: string | null
  goal_kr: number
  deadline: string
  /** T.ex. 'Frigöra 150 000 kr före 30 september'. */
  headline: string
  steps: ValidatedMissionStep[]
  /** Källor som inte kunde läsas när planen byggdes — ärlighet i kortet. */
  degraded_sources: string[]
}

export function isMissionPlanPresentation(value: unknown): value is MissionPlanPresentation {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return p.kind === 'mission_plan'
    && p.version === 1
    && (p.state === 'proposal' || p.state === 'confirmed')
    && (p.mission_id === null || typeof p.mission_id === 'string')
    && typeof p.goal_kr === 'number'
    && typeof p.deadline === 'string'
    && typeof p.headline === 'string'
    && Array.isArray(p.steps)
    && Array.isArray(p.degraded_sources)
}
