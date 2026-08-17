/**
 * Sammanfattningstext + rubrik för uppdragsplaner — Goal-to-Plan V1 (Etapp B,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * ═══ KLASSERNA REDOVISAS VAR FÖR SIG, ALDRIG SUMMERADE ═══
 *
 * propose_mission_plan/confirm_mission (app/api/agent/trigger/tool-router.ts)
 * bygger chattsvarets korta textsammanfattning härifrån. Ingen addition över
 * klassernas belopp — bara en rad per klass, med KLASSENS EGET mått. Två
 * kr-klasser på 40 000 respektive 32 000 kr ska aldrig kunna bli en
 * hopslagen siffra här (facit: tests/mission-tools.spec.ts).
 */

import type { MissionPlanPresentation } from './mission-presentation'
import type { TruthClass } from './opportunity-portfolio'

const CLASS_LABELS: Record<TruthClass, string> = {
  indrivningsbart: 'Indrivningsbart',
  faktureringsklart: 'Faktureringsklart',
  pipeline: 'Pipeline (ej säkrat)',
  ateraktivering: 'Återaktivering',
  marginalskydd: 'Marginalskydd',
}

const CLASS_ORDER: readonly TruthClass[] = [
  'indrivningsbart',
  'faktureringsklart',
  'pipeline',
  'ateraktivering',
  'marginalskydd',
]

type MissionStep = MissionPlanPresentation['steps'][number]

function formatStep(step: MissionStep): string {
  const matt = step.measure.kind === 'kr'
    ? `${step.measure.amountKr.toLocaleString('sv-SE')} kr`
    : `${step.measure.count} st`
  return `${step.title} (${matt})`
}

/**
 * Kort svensk text för chattsvaret: en rad per sanningsklass som förekommer
 * i planen, med klassens steg och EGET mått. Ingen klassöverskridande summa
 * — bara grupperad lista.
 */
export function buildMissionSummaryText(presentation: MissionPlanPresentation): string {
  const perClass = new Map<TruthClass, MissionStep[]>()
  for (const step of presentation.steps) {
    const list = perClass.get(step.truth_class) ?? []
    list.push(step)
    perClass.set(step.truth_class, list)
  }

  const rader: string[] = []
  for (const cls of CLASS_ORDER) {
    const steg = perClass.get(cls)
    if (!steg || steg.length === 0) continue
    rader.push(`${CLASS_LABELS[cls]}: ${steg.map(formatStep).join(', ')}`)
  }
  return rader.join('\n')
}

/**
 * Uppdragets rubrik — EN formulering delad mellan propose_mission_plan,
 * confirm_mission (samma rubrik i proposal- och confirmed-läget) och det
 * aktiva uppdragets kontextblock i app/api/matte/chat/route.ts, så de aldrig
 * kan glida isär.
 */
export function buildMissionHeadline(goalKr: number, deadline: string): string {
  return `Frigöra ${Math.round(goalKr).toLocaleString('sv-SE')} kr före ${deadline}`
}
