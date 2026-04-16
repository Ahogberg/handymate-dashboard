/**
 * DB-backed rate limiting (persistent across serverless instances).
 *
 * Använder Supabase-tabellen `rate_limit_bucket` + RPC `rate_limit_check`
 * för atomiska increment-operationer.
 *
 * Använd denna istället för `checkRateLimit()` från lib/auth.ts när det är
 * kritiskt att limiten faktiskt håller (externa API-kostnader, anti-spam).
 */

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
