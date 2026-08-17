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
 *
 * Etapp F (kapacitetsmål, sql/v145_mission_capacity_goal.sql) lägger till
 * en kapacitetsformulering på buildMissionHeadline — se dess egen
 * kommentar. buildMissionSummaryText rör inget mål-fält alls (den summerar
 * bara PLANSTEGEN), så den är oförändrad av kapacitetsmål.
 */

import type { MissionPlanPresentation } from './mission-presentation'
import type { TruthClass } from './opportunity-portfolio'
import type { MissionGoalType } from './goal-type'

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
 * ISO 8601-veckonummer för ETT valfritt datum (inte bara måndagar) — en
 * liten, MED FLIT duplicerad kusin till lib/jarvis/monday-brief.ts:s
 * isoWeekInfo (som kräver ett redan måndags-snappat datum). Samma
 * duplikationsskäl som lib/mission/suggestions.ts:s jobTypeLabel: den här
 * filen importeras även av en 'use client'-komponent (MatteHero.tsx), och
 * en delad export över den gränsen hade dragit in monday-brief.ts:s
 * serverberoenden i klientbunten helt i onödan för fyra rader matte.
 */
function isoWeekNumber(dateStr: string): number {
  const dateOnly = dateStr.slice(0, 10)
  const d = new Date(`${dateOnly}T12:00:00Z`)
  const dayIdx = (d.getUTCDay() + 6) % 7 // måndag=0 .. söndag=6
  const thursday = new Date(d.getTime() + (3 - dayIdx) * 86_400_000)
  const isoYear = thursday.getUTCFullYear()
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Idx = (jan4.getUTCDay() + 6) % 7
  const firstThursday = new Date(jan4.getTime() + (3 - jan4Idx) * 86_400_000)
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
}

/**
 * Uppdragets rubrik — EN formulering delad mellan propose_mission_plan,
 * confirm_mission (samma rubrik i proposal- och confirmed-läget) och det
 * aktiva uppdragets kontextblock i app/api/matte/chat/route.ts, så de aldrig
 * kan glida isär.
 *
 * Etapp F (kapacitetsmål): opts.goalType === 'capacity' väljer
 * kapacitetsformuleringen ("Boka N timmar till vecka V") i stället för
 * pengaformuleringen — goalKr ignoreras HELT i det läget (anropare som inte
 * har ett meningsfullt kr-tal för en kapacitetsplan skickar bara in 0, det
 * syns aldrig i resultatet). Utan opts (eller goalType 'money') är
 * beteendet exakt det förra — bakåtkompatibel positionell 2-args-signatur.
 */
export function buildMissionHeadline(
  goalKr: number,
  deadline: string,
  opts?: { goalType?: MissionGoalType; goalHours?: number | null },
): string {
  if (opts?.goalType === 'capacity') {
    const hours = Math.round(Number(opts.goalHours) || 0)
    return `Boka ${hours} timmar till vecka ${isoWeekNumber(deadline)}`
  }
  return `Frigöra ${Math.round(goalKr).toLocaleString('sv-SE')} kr före ${deadline}`
}
