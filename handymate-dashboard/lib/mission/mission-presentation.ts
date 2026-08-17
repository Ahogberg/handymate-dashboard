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
 *
 * ═══ ETAPP F: KAPACITETSMÅL — ADDITIV SCHEMAÄNDRING ═══
 *
 * goal_type/goal_hours är NYA, valfria fält. version stannar på 1 och
 * isMissionPlanPresentation() kräver INTE dem: äldre lagrade presentationer
 * (thread_message.metadata skrivna innan Etapp F) saknar fälten helt i sin
 * JSON och ska fortsätta tolkas som pengaplaner (samma fail-soft-default
 * som lib/mission/goal-type.ts:s resolveGoalType). goal_kr blir nullbar av
 * samma skäl som mission-tabellens kolumn (sql/v145): en kapacitetsplan har
 * inget kr-mål — pengar och timmar blandas ALDRIG i en siffra.
 */

import type { ValidatedMissionStep } from './plan-validation'
import type { MissionGoalType } from './goal-type'

export interface MissionPlanPresentation {
  kind: 'mission_plan'
  version: 1
  state: 'proposal' | 'confirmed'
  /** null tills ägaren bekräftat och mis_-raden finns. */
  mission_id: string | null
  /** Etapp F, valfritt (se filhuvudet) — 'money' är den underförstådda
      defaulten när fältet saknas. */
  goal_type?: MissionGoalType
  /** null för kapacitetsuppdrag. */
  goal_kr: number | null
  /** Etapp F — null för pengauppdrag OCH för presentationer skapade innan
      Etapp F (valfritt av samma additiv-skäl som goal_type). */
  goal_hours?: number | null
  /** Etapp I (kontaktmål) — null för penga-/kapacitetsuppdrag OCH för
      presentationer skapade innan Etapp I (valfritt, samma additiv-skäl). */
  goal_count?: number | null
  deadline: string
  /** T.ex. 'Frigöra 150 000 kr före 30 september' eller (kapacitetsmål)
      'Boka 12 timmar till vecka 39'. */
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
    && (p.goal_kr === null || typeof p.goal_kr === 'number')
    && typeof p.deadline === 'string'
    && typeof p.headline === 'string'
    && Array.isArray(p.steps)
    && Array.isArray(p.degraded_sources)
}
