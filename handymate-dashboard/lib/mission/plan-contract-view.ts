/**
 * Frontendvy av planens sanningsklasser — Goal-to-Plan V1 (Etapp C,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Ren gruppering, ingen I/O: MissionPlanCard.tsx behöver stegen ordnade per
 * klass för att kunna rita en kantad sektion per klass. Beloppen står kvar
 * på VARJE steg för sig — den här filen lägger aldrig ihop dem, den bara
 * sorterar. Facit i tests/mission-plan-card.spec.ts.
 */

import { TRUTH_CLASSES, type TruthClass } from './opportunity-portfolio'
import type { ValidatedMissionStep } from './plan-validation'

export interface MissionPlanClassSection {
  truth_class: TruthClass
  steps: ValidatedMissionStep[]
}

/**
 * Grupperar planens steg per sanningsklass, i TRUTH_CLASSES-ordning.
 * Klasser som inte förekommer i just den här planen utelämnas — en tom
 * sektion vore brus, inte information.
 */
export function groupStepsByClass(steps: ValidatedMissionStep[]): MissionPlanClassSection[] {
  const byClass = new Map<TruthClass, ValidatedMissionStep[]>()
  for (const step of steps) {
    const list = byClass.get(step.truth_class) ?? []
    list.push(step)
    byClass.set(step.truth_class, list)
  }

  const sections: MissionPlanClassSection[] = []
  for (const cls of TRUTH_CLASSES) {
    const list = byClass.get(cls)
    if (list && list.length > 0) sections.push({ truth_class: cls, steps: list })
  }
  return sections
}
