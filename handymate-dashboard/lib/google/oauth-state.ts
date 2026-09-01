/**
 * Signerad OAuth-state för Google-kopplingen (tenant-svepet 2026-09-01).
 *
 * Tidigare var state ren base64-JSON: {business_id, user_id, timestamp}. Vem
 * som helst kunde tillverka en state med ett annat företags id och slutföra
 * OAuth med sitt eget Google-konto — offrets Gmail-sändning och kalender
 * hade då bundits till angriparens konto. Omvänt kunde en angripares state
 * skickas till ett offer, som med sitt godkännande gav angriparens företag
 * en levande Google-token till offrets kalender.
 *
 * Nu: HMAC-SHA256 över payloaden med GOOGLE_CLIENT_SECRET som nyckel
 * (finns alltid när OAuth-flödet alls fungerar), 10 minuters giltighet,
 * konstant-tids-jämförelse. Callbacken kräver DESSUTOM att den inloggade
 * sessionen matchar state (se app/api/google/callback/route.ts) — signaturen
 * hindrar förfalskning, sessionsmatchningen hindrar att en äkta state
 * spelas upp av fel person.
 */

import { createHmac, timingSafeEqual } from 'crypto'

export interface GoogleOAuthState {
  business_id: string
  user_id: string
  timestamp: number
}

export const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000

function secret(env: Readonly<Record<string, string | undefined>>): string | null {
  const s = env.GOOGLE_OAUTH_STATE_SECRET || env.GOOGLE_CLIENT_SECRET
  return s && s.trim() ? s : null
}

function sign(payloadB64: string, key: string): string {
  return createHmac('sha256', key).update(payloadB64).digest('base64url')
}

export function signOAuthState(
  state: Omit<GoogleOAuthState, 'timestamp'> & { timestamp?: number },
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const key = secret(env)
  if (!key) throw new Error('GOOGLE_CLIENT_SECRET saknas — kan inte signera OAuth-state')
  const payload: GoogleOAuthState = {
    business_id: state.business_id,
    user_id: state.user_id,
    timestamp: state.timestamp ?? Date.now(),
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, key)}`
}

export type OAuthStateFailure = 'malformed' | 'bad_signature' | 'expired' | 'no_secret'

export function verifyOAuthState(
  raw: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
  nowMs: number = Date.now(),
): { ok: true; state: GoogleOAuthState } | { ok: false; reason: OAuthStateFailure } {
  const key = secret(env)
  if (!key) return { ok: false, reason: 'no_secret' }
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'malformed' }
  const dot = raw.indexOf('.')
  if (dot <= 0) return { ok: false, reason: 'malformed' }
  const payloadB64 = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = sign(payloadB64, key)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const s = parsed as Partial<GoogleOAuthState> | null
  if (!s || typeof s.business_id !== 'string' || typeof s.user_id !== 'string' || typeof s.timestamp !== 'number') {
    return { ok: false, reason: 'malformed' }
  }
  if (nowMs - s.timestamp > GOOGLE_OAUTH_STATE_TTL_MS || s.timestamp > nowMs + 60_000) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, state: { business_id: s.business_id, user_id: s.user_id, timestamp: s.timestamp } }
}
