/**
 * DB-backed rate limiting (persistent across serverless instances).
 *
 * Använder Supabase-tabellen `rate_limit_bucket` + RPC `rate_limit_check`
 * för atomiska increment-operationer.
 *
 * Använd denna istället för `checkRateLimit()` från lib/auth.ts när det är
 * kritiskt att limiten faktiskt håller (externa API-kostnader, anti-spam).
 */

import { createHash } from 'crypto'
import { getServerSupabase } from './supabase'
import { RATE_LIMITS } from './auth'

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Atomisk rate limit-kontroll via Supabase RPC.
 *
 * Fallbackar till allowed=true om DB-anropet misslyckas (better availability
 * than false-deny, men logga alltid felet så vi kan åtgärda det).
 */
export async function checkRateLimitDb(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase.rpc('rate_limit_check', {
      p_key: key,
      p_max: config.maxRequests,
      p_window_ms: config.windowMs,
    })

    if (error || !data || !Array.isArray(data) || data.length === 0) {
      console.error('[rate-limit-db] RPC failed, allowing request:', error)
      return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs }
    }

    const row = data[0]
    const resetAt = new Date(row.reset_at).getTime()
    return {
      allowed: row.allowed,
      remaining: Math.max(0, config.maxRequests - row.new_count),
      resetAt,
    }
  } catch (err) {
    console.error('[rate-limit-db] Unexpected error, allowing request:', err)
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs }
  }
}

/**
 * FAIL-CLOSED-varianten för PUBLIKA, oautentiserade rutter (tenant-svepet
 * 2026-09-01): kontaktformulär, chattwidgeten, portalens meddelanden,
 * publik bokning, partnerregistrering. Där är "tillåt vid DB-fel" fel
 * avvägning — det är exakt när räknaren är nere som en angripare kan
 * bränna SMS/LLM-budget obegränsat. En riktig kund som får 429 en gång
 * under ett Supabase-hack försöker igen; en fyllnadsattack gör det inte.
 *
 * Nyckeln bör vara IP-hash (hashClientIp) eller ett kund-/kod-id, aldrig
 * något klienten fritt kan variera.
 */
export async function checkPublicRateLimitDb(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase.rpc('rate_limit_check', {
      p_key: key,
      p_max: config.maxRequests,
      p_window_ms: config.windowMs,
    })
    if (error || !data || !Array.isArray(data) || data.length === 0) {
      console.error('[rate-limit-db] RPC failed on public route, DENYING request:', error)
      return { allowed: false, remaining: 0, resetAt: Date.now() + config.windowMs }
    }
    const row = data[0]
    return {
      allowed: row.allowed,
      remaining: Math.max(0, config.maxRequests - row.new_count),
      resetAt: new Date(row.reset_at).getTime(),
    }
  } catch (err) {
    console.error('[rate-limit-db] Unexpected error on public route, DENYING request:', err)
    return { allowed: false, remaining: 0, resetAt: Date.now() + config.windowMs }
  }
}

/**
 * Stabil, icke-reversibel IP-nyckel för publika rate limits. x-real-ip sätts
 * av Vercels edge och kan inte sättas av klienten; x-forwarded-for är
 * fallback för lokal drift.
 */
export function hashClientIp(request: { headers: Pick<Headers, 'get'> }): string {
  const ip =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  return createHash('sha256').update(ip).digest('hex').slice(0, 24)
}

/**
 * DB-backed SMS rate limit — använder samma presets som in-memory-versionen.
 */
export async function checkSmsRateLimitDb(businessId: string): Promise<{ allowed: boolean; error?: string }> {
  const minuteCheck = await checkRateLimitDb(`sms:minute:${businessId}`, RATE_LIMITS.SMS_PER_MINUTE)
  if (!minuteCheck.allowed) {
    return {
      allowed: false,
      error: `SMS rate limit överskriden. Max ${RATE_LIMITS.SMS_PER_MINUTE.maxRequests} per minut. Försök igen om ${Math.ceil((minuteCheck.resetAt - Date.now()) / 1000)} sekunder.`,
    }
  }

  const dayCheck = await checkRateLimitDb(`sms:day:${businessId}`, RATE_LIMITS.SMS_PER_DAY)
  if (!dayCheck.allowed) {
    return {
      allowed: false,
      error: `Daglig SMS-gräns uppnådd (max ${RATE_LIMITS.SMS_PER_DAY.maxRequests} per dag).`,
    }
  }

  return { allowed: true }
}

/**
 * DB-backed email rate limit.
 */
export async function checkEmailRateLimitDb(businessId: string): Promise<{ allowed: boolean; error?: string }> {
  const minuteCheck = await checkRateLimitDb(`email:minute:${businessId}`, RATE_LIMITS.EMAIL_PER_MINUTE)
  if (!minuteCheck.allowed) {
    return {
      allowed: false,
      error: `E-post rate limit överskriden. Max ${RATE_LIMITS.EMAIL_PER_MINUTE.maxRequests} per minut.`,
    }
  }

  const dayCheck = await checkRateLimitDb(`email:day:${businessId}`, RATE_LIMITS.EMAIL_PER_DAY)
  if (!dayCheck.allowed) {
    return {
      allowed: false,
      error: `Daglig e-postgräns uppnådd (max ${RATE_LIMITS.EMAIL_PER_DAY.maxRequests} per dag).`,
    }
  }

  return { allowed: true }
}

/**
 * DB-backed AI API rate limit.
 */
export async function checkAiApiRateLimitDb(businessId: string): Promise<{ allowed: boolean; error?: string }> {
  const check = await checkRateLimitDb(`ai:minute:${businessId}`, RATE_LIMITS.AI_API_PER_MINUTE)
  if (!check.allowed) {
    return {
      allowed: false,
      error: `AI API rate limit överskriden. Max ${RATE_LIMITS.AI_API_PER_MINUTE.maxRequests} per minut.`,
    }
  }
  return { allowed: true }
}
