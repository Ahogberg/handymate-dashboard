import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface AuthenticatedBusiness {
  business_id: string
  user_id: string
  business_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  phone_number: string | null
  assigned_phone_number: string | null
  forward_phone_number: string | null
  call_recording_enabled: boolean
  pricing_settings: Record<string, any> | null
  knowledge_base: Record<string, any> | null
  org_number: string | null
  address: string | null
  industry: string | null
  bankgiro: string | null
  services_offered: string[] | null
}

/**
 * Verifierar autentisering och returnerar business-config
 * Hämtar session från cookie/header och slår upp business
 */
export async function getAuthenticatedBusiness(
  request: NextRequest
): Promise<AuthenticatedBusiness | null> {
  try {
    const supabase = getSupabase()

    // Hämta auth token från cookie eller header
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')

    let accessToken: string | null = null

    // Prioritera Authorization header
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7)
    }
    // Fallback till cookie
    else if (cookieHeader) {
      const cookies = parseCookies(cookieHeader)
      accessToken = cookies['sb-access-token'] || cookies['supabase-auth-token']
    }

    if (!accessToken) {
      // Försök med Supabase session cookie
      const sbCookie = cookieHeader?.match(/sb-[^=]+-auth-token=([^;]+)/)
      if (sbCookie) {
        try {
          const decoded = decodeURIComponent(sbCookie[1])
          const parsed = JSON.parse(decoded)
          accessToken = parsed[0] // access_token är första elementet
        } catch {
          // Ignorera parse-fel
        }
      }
    }

    if (!accessToken) {
      return null
    }

    // Verifiera token och hämta användare
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)

    if (userError || !user) {
      return null
    }

    // Hämta business_config för användaren
    const { data: business, error: businessError } = await supabase
      .from('business_config')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return null
    }

    return business as AuthenticatedBusiness

  } catch (error) {
    console.error('Auth error:', error)
    return null
  }
}

/**
 * Enkel cookie parser
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=')
    }
  })
  return cookies
}

// ============================================
// RATE LIMITING
// ============================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory rate limit storage (per process)
// I produktion bör detta vara Redis eller liknande
const rateLimitStore = new Map<string, RateLimitEntry>()

// Rensa gamla entries var 5:e minut
setInterval(() => {
  const now = Date.now()
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  })
}, 5 * 60 * 1000)

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

/**
 * Kontrollerar rate limit för en given nyckel
 * Returnerar { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // Om ingen entry eller expired, skapa ny
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs
    }
    rateLimitStore.set(key, newEntry)
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt
    }
  }

  // Inkrementera och kolla limit
  entry.count++
  rateLimitStore.set(key, entry)

  const allowed = entry.count <= config.maxRequests
  const remaining = Math.max(0, config.maxRequests - entry.count)

  return { allowed, remaining, resetAt: entry.resetAt }
}

// Rate limit presets
export const RATE_LIMITS = {
  // SMS: 10 per minut, 50 per dag
  SMS_PER_MINUTE: { maxRequests: 10, windowMs: 60 * 1000 },
  SMS_PER_DAY: { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 },

  // Email: 20 per minut, 100 per dag
  EMAIL_PER_MINUTE: { maxRequests: 20, windowMs: 60 * 1000 },
  EMAIL_PER_DAY: { maxRequests: 100, windowMs: 24 * 60 * 60 * 1000 },

  // API generellt: 100 per minut
  API_PER_MINUTE: { maxRequests: 100, windowMs: 60 * 1000 }
}

/**
 * Helper för att kontrollera SMS rate limits
 */
export function checkSmsRateLimit(businessId: string): {
  allowed: boolean
  error?: string
} {
  const minuteKey = `sms:minute:${businessId}`
  const dayKey = `sms:day:${businessId}`

  const minuteCheck = checkRateLimit(minuteKey, RATE_LIMITS.SMS_PER_MINUTE)
  if (!minuteCheck.allowed) {
    return {
      allowed: false,
      error: `SMS rate limit exceeded. Max ${RATE_LIMITS.SMS_PER_MINUTE.maxRequests} per minute. Try again in ${Math.ceil((minuteCheck.resetAt - Date.now()) / 1000)} seconds.`
    }
  }

  const dayCheck = checkRateLimit(dayKey, RATE_LIMITS.SMS_PER_DAY)
  if (!dayCheck.allowed) {
    return {
      allowed: false,
      error: `Daily SMS limit exceeded. Max ${RATE_LIMITS.SMS_PER_DAY.maxRequests} per day.`
    }
  }

  return { allowed: true }
}

/**
 * Helper för att kontrollera Email rate limits
 */
export function checkEmailRateLimit(businessId: string): {
  allowed: boolean
  error?: string
} {
  const minuteKey = `email:minute:${businessId}`
  const dayKey = `email:day:${businessId}`

  const minuteCheck = checkRateLimit(minuteKey, RATE_LIMITS.EMAIL_PER_MINUTE)
  if (!minuteCheck.allowed) {
    return {
      allowed: false,
      error: `Email rate limit exceeded. Max ${RATE_LIMITS.EMAIL_PER_MINUTE.maxRequests} per minute.`
    }
  }

  const dayCheck = checkRateLimit(dayKey, RATE_LIMITS.EMAIL_PER_DAY)
  if (!dayCheck.allowed) {
    return {
      allowed: false,
      error: `Daily email limit exceeded. Max ${RATE_LIMITS.EMAIL_PER_DAY.maxRequests} per day.`
    }
  }

  return { allowed: true }
}
