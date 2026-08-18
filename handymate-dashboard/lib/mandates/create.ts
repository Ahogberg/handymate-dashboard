/**
 * Mandatskapandets facit-först-validering — Mission Mandates V1, Etapp X
 * (ägarens upplevelse, tasks/jaunty-pondering-hummingbird.md).
 *
 * Ren funktion, INGEN I/O. Mandatskapande är en ÄGAR-UI-handling
 * (POST /api/mission/[id]/mandate) — den här filen är facit-lagret bakom
 * knappen, delad mellan servern (som validerar på riktigt) och panelen (som
 * behöver EXAKT samma kandidatlista för att rita kryssrutorna).
 *
 * ═══ LLM:EN PEKAR ALDRIG HÄR — ÄGAREN VÄLJER TYPER, PLANEN GER MÅLEN ═══
 *
 * `deriveMandateCandidates` läser bara ValidatedMissionStep[] (redan
 * servervaliderad, se lib/mission/plan-validation.ts) — item_id/evidence/
 * title kommer alltid ur portföljens item, aldrig från fri text. Ägaren kan
 * bara kryssa i TYPER som redan finns i planen; hen kan ALDRIG skriva in ett
 * nytt mål. `validateMandateCreateInput` upprätthåller samma regel
 * server-sidan: varje inskickat mål måste vara ⊆ planens namngivna lista för
 * just den typen — annars target_not_in_plan, aldrig en tyst trunkering.
 *
 * ═══ TAK-INTERVALLEN SPEGLAR sql/v150 ═══
 *
 * daily_cap [1,25], total_cap [1,200] — samma CHECK-gränser som
 * sql/v150_mission_mandate.sql. En drift mellan de två skulle bara upptäckas
 * som ett 500-fel vid INSERT; valideringen här fångar det innan dess.
 */

// VÄRDE-import (MANDATE_ALLOWED_TYPES) hämtas medvetet ur ./types, ALDRIG ur
// ./mission-mandate: den senare importerar node:crypto (computePlanHash), och
// den här filen återanvänds av klientkomponenten components/mission/
// MissionPanel.tsx (deriveMandateCandidates). Ett värde-import ur mission-
// mandate.ts skulle dra hela den modulen — inklusive crypto — in i webpacks
// klient/edge-bygge (UnhandledSchemeError: node:crypto, se lib/mandates/types.ts:s
// filhuvud för hela historien).
import { MANDATE_ALLOWED_TYPES, MANDATE_TARGET_LIST_KEY, type MandateActionType, type MandateTargets } from './types'
import type { ValidatedMissionStep } from '@/lib/mission/plan-validation'

export { MANDATE_TARGET_LIST_KEY }

export interface MandateCandidateTarget {
  ref_id: string
  /** Steget titel — den enda ledtext ägaren ser, ALDRIG en modell-genererad text. */
  title: string
}

export interface MandateCandidateType {
  type: MandateActionType
  targets: MandateCandidateTarget[]
}

/**
 * Vilka typer/mål en given (validerad) plan faktiskt KAN mandateras för —
 * skärningen mellan planens egna steg och MANDATE_ALLOWED_TYPES. Ordningen
 * följer MANDATE_ALLOWED_TYPES, inte planens stegordning (stabil rendering).
 * En typ utan ett enda steg i planen får ingen (tom) kandidat.
 */
export function deriveMandateCandidates(steps: ValidatedMissionStep[]): MandateCandidateType[] {
  const byType = new Map<MandateActionType, MandateCandidateTarget[]>()
  for (const s of steps) {
    const type = s.approval_type
    if (!type || !(MANDATE_ALLOWED_TYPES as readonly string[]).includes(type)) continue
    const key = type as MandateActionType
    const list = byType.get(key) ?? []
    list.push({ ref_id: s.evidence.ref_id, title: s.title })
    byType.set(key, list)
  }
  const out: MandateCandidateType[] = []
  for (const type of MANDATE_ALLOWED_TYPES) {
    const targets = byType.get(type)
    if (targets && targets.length > 0) out.push({ type, targets })
  }
  return out
}

/** Konservativa startvärden (Codex-planen: "förifyllda konservativt, ägaren
    kan sänka"). */
export const MANDATE_DEFAULT_DAILY_CAP = 5
export const MANDATE_DEFAULT_TOTAL_CAP = 25

/**
 * En liten plan ska aldrig föreslå ett tak större än planen faktiskt
 * innehåller (ett förslag om "25 om dagen" på en plan med 2 fakturor vore
 * en tom siffra) — men aldrig 0 heller, ett mandat utan utrymme är
 * meningslöst. Räknar ALLA kandidaters mål ihop (taken gäller hela
 * mandatet, inte per typ — se sql/v150s enda daily_cap/total_cap-kolumn).
 */
export function deriveDefaultCaps(candidates: MandateCandidateType[]): { daily_cap: number; total_cap: number } {
  let targetCount = 0
  for (const c of candidates) targetCount += c.targets.length
  const ceiling = targetCount > 0 ? Math.min(MANDATE_DEFAULT_TOTAL_CAP, targetCount) : MANDATE_DEFAULT_TOTAL_CAP
  return {
    daily_cap: Math.max(1, Math.min(MANDATE_DEFAULT_DAILY_CAP, ceiling)),
    total_cap: Math.max(1, ceiling),
  }
}

// ─────────────────────────────────────────────────────────────────
// validateMandateCreateInput — den fulla server-sidiga valideringen.
// ─────────────────────────────────────────────────────────────────

export interface MandateCreateInput {
  allowed_action_types: unknown
  targets: unknown
  daily_cap: unknown
  total_cap: unknown
  amount_cap_kr?: unknown
  expires_at: unknown
}

export type MandateCreateReason =
  | 'no_types'
  | 'bad_type'
  | 'type_not_in_plan'
  | 'target_not_in_plan'
  | 'no_targets'
  | 'bad_daily_cap'
  | 'bad_total_cap'
  | 'bad_amount_cap'
  | 'bad_expires'
  | 'expires_in_past'
  | 'expires_after_deadline'

export interface MandateCreateRow {
  allowed_action_types: MandateActionType[]
  targets: MandateTargets
  daily_cap: number
  total_cap: number
  amount_cap_kr: number | null
  expires_at: string
}

export type MandateCreateValidation =
  | { ok: true; row: MandateCreateRow }
  | { ok: false; reason: MandateCreateReason; detail: string }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validerar ägarens formulär mot den FÄRSKT härledda kandidatlistan
 * (deriveMandateCandidates över uppdragets AKTUELLA plan_snapshot — anroparen
 * ansvarar för färskheten, precis som validateMissionPlan). FAIL-CLOSED: allt
 * som inte uttryckligen godkänns här ⇒ ok:false, aldrig en tyst
 * normalisering till "ungefär rätt".
 */
export function validateMandateCreateInput(
  input: MandateCreateInput,
  candidates: MandateCandidateType[],
  missionDeadline: string,
): MandateCreateValidation {
  const candidateByType = new Map<MandateActionType, Set<string>>(
    candidates.map(c => [c.type, new Set(c.targets.map(t => t.ref_id))]),
  )

  const rawTypes = Array.isArray(input.allowed_action_types) ? input.allowed_action_types : []
  if (rawTypes.length === 0) {
    return { ok: false, reason: 'no_types', detail: 'Välj minst en typ av handling teamet får genomföra.' }
  }
  const types: MandateActionType[] = []
  for (const t of rawTypes) {
    if (typeof t !== 'string' || !(MANDATE_ALLOWED_TYPES as readonly string[]).includes(t)) {
      return { ok: false, reason: 'bad_type', detail: `"${String(t)}" är inte en typ som kan mandateras.` }
    }
    if (!candidateByType.has(t as MandateActionType)) {
      return { ok: false, reason: 'type_not_in_plan', detail: `Uppdragets plan innehåller inga steg av typen "${t}".` }
    }
    types.push(t as MandateActionType)
  }

  const rawTargets = input.targets && typeof input.targets === 'object' ? (input.targets as Record<string, unknown>) : {}
  const targets: MandateTargets = {}
  for (const type of types) {
    const listKey = MANDATE_TARGET_LIST_KEY[type]
    const allowedIds = candidateByType.get(type)!
    const submitted = Array.isArray(rawTargets[listKey]) ? (rawTargets[listKey] as unknown[]) : []
    const ids: string[] = []
    for (const id of submitted) {
      if (typeof id !== 'string' || !allowedIds.has(id)) {
        return { ok: false, reason: 'target_not_in_plan', detail: `Ett valt mål för "${type}" finns inte i uppdragets plan.` }
      }
      ids.push(id)
    }
    if (ids.length === 0) {
      return { ok: false, reason: 'no_targets', detail: `Inga mål valda för "${type}".` }
    }
    targets[listKey] = ids
  }

  const dailyCap = Number(input.daily_cap)
  if (!Number.isInteger(dailyCap) || dailyCap < 1 || dailyCap > 25) {
    return { ok: false, reason: 'bad_daily_cap', detail: 'Dagstaket måste vara ett heltal mellan 1 och 25.' }
  }
  const totalCap = Number(input.total_cap)
  if (!Number.isInteger(totalCap) || totalCap < 1 || totalCap > 200) {
    return { ok: false, reason: 'bad_total_cap', detail: 'Taket för hela mandatet måste vara ett heltal mellan 1 och 200.' }
  }

  let amountCapKr: number | null = null
  if (input.amount_cap_kr !== null && input.amount_cap_kr !== undefined && input.amount_cap_kr !== '') {
    const parsed = Number(input.amount_cap_kr)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, reason: 'bad_amount_cap', detail: 'Beloppstaket måste vara ett positivt belopp, eller lämnas tomt (standardtaket gäller då).' }
    }
    amountCapKr = parsed
  }

  const expiresAt = typeof input.expires_at === 'string' ? input.expires_at.trim().slice(0, 10) : ''
  if (!DATE_ONLY.test(expiresAt) || !Number.isFinite(Date.parse(expiresAt))) {
    return { ok: false, reason: 'bad_expires', detail: 'Sista giltighetsdag måste vara ett datum (ÅÅÅÅ-MM-DD).' }
  }
  const idag = new Date().toISOString().slice(0, 10)
  if (expiresAt < idag) {
    return { ok: false, reason: 'expires_in_past', detail: 'Sista giltighetsdag kan inte ligga i det förflutna.' }
  }
  const deadline = missionDeadline.slice(0, 10)
  if (expiresAt > deadline) {
    return { ok: false, reason: 'expires_after_deadline', detail: 'Sista giltighetsdag kan inte vara efter uppdragets deadline.' }
  }

  return {
    ok: true,
    row: { allowed_action_types: types, targets, daily_cap: dailyCap, total_cap: totalCap, amount_cap_kr: amountCapKr, expires_at: expiresAt },
  }
}
