/**
 * Push-policy — klass, TTL, prioritet och dedupe-nyckel per notistyp.
 *
 * Teamet i fickan (docs/roadmap/TEAMET_I_FICKAN_POST_LAUNCH.md) definierar
 * tre notisklasser. Den här filen är V1 av klassningen på sändningssidan:
 *
 *   beslut          — kräver ett beslut; lever länge, hög prioritet
 *   hant            — något viktigt verifierat har hänt; hög prioritet
 *   teamuppdatering — status i ett pågående uppdrag; lägre prioritet, kort TTL
 *
 * TTL skickas till Expo (ttl) och web-push (TTL) så en notis om ett beslut
 * inte dyker upp tre dagar senare på en telefon som legat avstängd.
 * Dedupe-fönstret används av sendApprovalPush mot push_dispatch_log
 * (sql/v191): samma händelse till samma mottagare inom fönstret skickas
 * inte igen.
 *
 * Rena funktioner, ingen I/O.
 */

import { createHash } from 'crypto'

export type PushKlass = 'beslut' | 'hant' | 'teamuppdatering'
export type PushPrioritet = 'high' | 'normal'

export interface PushPolicy {
  klass: PushKlass
  ttlSeconds: number
  priority: PushPrioritet
  dedupeWindowSeconds: number
}

const H = 3600

export const PUSH_POLICY: Record<PushKlass, PushPolicy> = {
  beslut: { klass: 'beslut', ttlSeconds: 24 * H, priority: 'high', dedupeWindowSeconds: 24 * H },
  hant: { klass: 'hant', ttlSeconds: 12 * H, priority: 'high', dedupeWindowSeconds: 24 * H },
  teamuppdatering: { klass: 'teamuppdatering', ttlSeconds: 6 * H, priority: 'normal', dedupeWindowSeconds: 12 * H },
}

/** Klass per approval_type. Typer utan mall i approval-push når aldrig hit. */
export const PUSH_KLASS_PER_TYP: Record<string, PushKlass> = {
  four_eyes_quote: 'beslut',
  review_request: 'beslut',
  publish_microsite: 'beslut',
  agent_observation: 'beslut',
  ata_signed_notification: 'hant',
  ata_declined_notification: 'hant',
  quote_signed: 'hant',
  meeting_summary: 'hant',
  payment_failed_signal: 'hant',
  external_delivery_failure_signal: 'hant',
  agent_insight: 'teamuppdatering',
  monday_brief: 'teamuppdatering',
}

/** Okänd typ → 'beslut' (längst TTL, hög prioritet) — hellre en notis för mycket än ett tappat beslut. */
export function klassificeraPush(approvalType: string): PushPolicy {
  return PUSH_POLICY[PUSH_KLASS_PER_TYP[approvalType] ?? 'beslut']
}

/** Gränser för värden som kommer in via /api/push/send-body. */
export const PUSH_TTL_MIN_SECONDS = 60
export const PUSH_TTL_MAX_SECONDS = 7 * 24 * H

export function normaliseraTtl(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(PUSH_TTL_MAX_SECONDS, Math.max(PUSH_TTL_MIN_SECONDS, Math.round(n)))
}

export function normaliseraPrioritet(value: unknown, fallback: PushPrioritet): PushPrioritet {
  return value === 'high' || value === 'normal' ? value : fallback
}

const OBJEKT_FALT = [
  'approval_id',
  'notification_id',
  'change_id',
  'quote_id',
  'invoice_id',
  'recording_id',
  'booking_id',
  'project_id',
  'customer_id',
  'lead_id',
] as const

function sakertId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value) ? value : null
}

/**
 * Dedupe-nyckel: typ | objekt | mottagare.
 * Objektet är, i ordning:
 *  1. första säkra id:t i payloaden (OBJEKT_FALT ovan)
 *  2. annars en hash av titeln/observationen (agent_insight utan kort-id —
 *     två OLIKA insikter samma dag ska båda nå fram, samma insikt bara en gång)
 *  3. annars dagens datum (monday_brief) — högst en per typ, mottagare och dygn
 */
export function byggDedupeNyckel(
  approvalType: string,
  payload: Record<string, unknown> | null | undefined,
  targetUserId?: string | null,
  nowIso: string = new Date().toISOString(),
): string {
  let objekt: string | null = null
  for (const falt of OBJEKT_FALT) {
    const v = sakertId(payload?.[falt])
    if (v) {
      objekt = `${falt}:${v}`
      break
    }
  }
  if (!objekt) {
    const text = [payload?.title, payload?.observation].filter(v => typeof v === 'string' && v.trim()).join('\n')
    if (text) objekt = `text:${createHash('sha1').update(text).digest('hex').slice(0, 16)}`
  }
  const ref = objekt ?? `dag:${nowIso.slice(0, 10)}`
  return `${approvalType}|${ref}|${targetUserId || 'alla'}`
}
