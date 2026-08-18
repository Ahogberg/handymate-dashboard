/**
 * Mission Mandates V1 — allowlisten och dess typer, ISOLERADE FRÅN NODE-
 * SPECIFIK I/O (Etapp X-fix, tasks/jaunty-pondering-hummingbird.md).
 *
 * ═══ VARFÖR DEN HÄR FILEN FINNS SEPARAT FRÅN mission-mandate.ts ═══
 *
 * lib/mandates/mission-mandate.ts importerar `node:crypto` (computePlanHash).
 * lib/mandates/create.ts återanvänds ÄVEN av klientkomponenten
 * components/mission/MissionPanel.tsx (deriveMandateCandidates ritar
 * mandatdialogens kryssrutor) — ett VÄRDE-import av MANDATE_ALLOWED_TYPES ur
 * mission-mandate.ts drog in HELA den modulen i webpacks klient/edge-bygge,
 * inklusive node:crypto (`UnhandledSchemeError: node:crypto`, upptäckt av
 * `npx next build` under Etapp X-verifieringen). Den här filen bär bara de
 * rena konstanterna/typerna — noll I/O, noll node-specifika imports — så
 * create.ts kan importera VÄRDET MANDATE_ALLOWED_TYPES utan att dra med sig
 * crypto. mission-mandate.ts importerar och re-exporterar exakt samma sak,
 * så INGEN befintlig import (`from './mission-mandate'`, `from
 * '../lib/mandates/mission-mandate'` i tester) behöver ändras.
 */

import type { AutonomyKey } from '@/lib/autonomy/earned-autonomy'
import { AUTONOMY_META } from '@/lib/autonomy/earned-autonomy'

// ─────────────────────────────────────────────────────────────────
// ALLOWLIST-speglingen — den ENDA utbyggnadspunkten (se planens "Vägen till
// fullständighet"). MandateActionType ÄR AutonomyKey, ingen egen parallell
// union.
// ─────────────────────────────────────────────────────────────────

export const MANDATE_ALLOWED_TYPES = [
  'invoice_reminder', 'booking_reminder', 'quote_followup_sms', 'review_request',
] as const

export type MandateActionType = AutonomyKey

// Kompilatorbevis: om MANDATE_ALLOWED_TYPES och AutonomyKey någonsin driver
// isär (ny typ läggs till i den ena men inte den andra) slutar filen
// kompilera — INNAN någon körning når skillnaden.
type _MandateTypesSubsetOfAllowlist = (typeof MANDATE_ALLOWED_TYPES)[number] extends AutonomyKey ? true : never
type _AllowlistSubsetOfMandateTypes = AutonomyKey extends (typeof MANDATE_ALLOWED_TYPES)[number] ? true : never
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mandateAllowlistLock: [_MandateTypesSubsetOfAllowlist, _AllowlistSubsetOfMandateTypes] = [true, true]

export function isMandateActionType(v: unknown): v is MandateActionType {
  return typeof v === 'string' && (MANDATE_ALLOWED_TYPES as readonly string[]).includes(v)
}

/** Körtids-mängdlikhet mot AUTONOMY_META (vars nycklar TypeScript redan
    tvingar att exakt vara AutonomyKey-domänen). */
export function mandateAllowlistMatchesAutonomyAllowlist(): boolean {
  const a = [...MANDATE_ALLOWED_TYPES].sort()
  const b = Object.keys(AUTONOMY_META).sort()
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// ─────────────────────────────────────────────────────────────────
// Målens namngivna listor. Tre av de fyra typerna har en direkt motsvarande
// entitet (faktura/offert/bokning); review_request-kort skapas mot ett
// AVSLUTAT PROJEKT (customer_id löses ur project_id), därför project_ids
// för den typen.
// ─────────────────────────────────────────────────────────────────

export interface MandateTargets {
  invoice_ids?: string[]
  quote_ids?: string[]
  booking_ids?: string[]
  project_ids?: string[]
}

export const MANDATE_TARGET_LIST_KEY: Record<MandateActionType, keyof MandateTargets> = {
  invoice_reminder: 'invoice_ids',
  quote_followup_sms: 'quote_ids',
  booking_reminder: 'booking_ids',
  review_request: 'project_ids',
}

// ─────────────────────────────────────────────────────────────────
// Rad-typen — mirrorar sql/v150_mission_mandate.sql kolumn för kolumn.
// ─────────────────────────────────────────────────────────────────

export type MandateStatus = 'active' | 'paused' | 'revoked' | 'expired' | 'completed'

export interface MandateRow {
  id: string
  business_id: string
  mission_id: string
  plan_hash: string
  allowed_action_types: MandateActionType[]
  targets: MandateTargets
  daily_cap: number
  total_cap: number
  amount_cap_kr: number | null
  /** DATE-kolumn — 'YYYY-MM-DD' (kan komma som fullt ISO-datum från vissa
      klienter; all jämförelse sker via .slice(0, 10)). */
  expires_at: string
  status: MandateStatus
  pause_reason: string | null
  created_by: string | null
  created_at: string
  revoked_at: string | null
  paused_at: string | null
}
