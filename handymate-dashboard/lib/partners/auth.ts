/**
 * Partner authentication — registration, login, JWT token management.
 * Separate from Supabase auth (partners are external, not Handymate users).
 */

import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { getServerSupabase } from '@/lib/supabase'

// PARTNER_JWT_SECRET är en separat secret från CRON_SECRET.
// Fallback till CRON_SECRET för bakåtkompatibilitet, men logga varning.
// Inga fallback till hårdkodad sträng — det är en säkerhetsrisk om env-vars saknas.
function getJwtSecret(): Uint8Array {
  const secret = process.env.PARTNER_JWT_SECRET || process.env.CRON_SECRET
  if (!secret) {
    throw new Error(
      'PARTNER_JWT_SECRET (eller CRON_SECRET som fallback) måste vara satt. ' +
      'Konfigurera minst en i miljövariablerna innan partner-API används.'
    )
  }
  return new TextEncoder().encode(secret)
}

const JWT_EXPIRES = '30d'

export interface Partner {
  id: string
  email: string
  name: string
  company: string | null
  referral_code: string
  referral_url: string | null
  commission_rate: number
  total_earned_sek: number
  total_pending_sek: number
  status: string
  created_at: string
  approved_at: string | null
}

/**
 * Generate a partner referral code: P-{3 letters}-{4 digits}
 */
function generatePartnerCode(name: string): string {
  const letters = (name || 'XXX')
    .replace(/[^a-zA-ZåäöÅÄÖ]/g, '')
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X')
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  return `P-${letters}-${digits}`
}

/**
 * Register a new partner. Status starts as 'pending_approval'.
 */
export async function registerPartner(
  email: string,
  name: string,
  company: string | null,
  password: string
): Promise<{ partner: Partner | null; error?: string }> {
  const supabase = getServerSupabase()

  // Check if email already exists
  const { data: existing } = await supabase
    .from('partners')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (existing) {
    return { partner: null, error: 'E-postadressen är redan registrerad' }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  // Generate unique referral code (retry up to 5 times)
  let referralCode = ''
  for (let i = 0; i < 5; i++) {
    const candidate = generatePartnerCode(company || name)
    const { data: codeExists } = await supabase
      .from('partners')
      .select('id')
      .eq('referral_code', candidate)
      .maybeSingle()

    if (!codeExists) {
      referralCode = candidate
      break
    }
  }
  if (!referralCode) {
    referralCode = `P-${Date.now().toString(36).toUpperCase().slice(-7)}`
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const referralUrl = `${appUrl}/registrera?ref=${referralCode}`

  const { data, error } = await supabase
    .from('partners')
    .insert({
      email: email.toLowerCase(),
      name,
      company: company || null,
      password_hash: passwordHash,
      referral_code: referralCode,
      referral_url: referralUrl,
    })
    .select('id, email, name, company, referral_code, referral_url, commission_rate, total_earned_sek, total_pending_sek, status, created_at, approved_at')
    .single()

  if (error) {
    console.error('[partner-auth] Register error:', error)
    return { partner: null, error: 'Registrering misslyckades' }
  }

  return { partner: data as Partner }
}

/**
 * Login partner — returns JWT token (30 days).
 */
export async function loginPartner(
  email: string,
  password: string
): Promise<{ token: string | null; partner: Partner | null; error?: string }> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('partners')
    .select('id, email, name, company, referral_code, referral_url, commission_rate, total_earned_sek, total_pending_sek, status, created_at, approved_at, password_hash')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (!data) {
    return { token: null, partner: null, error: 'Fel e-post eller lösenord' }
  }

  const valid = await bcrypt.compare(password, data.password_hash)
  if (!valid) {
    return { token: null, partner: null, error: 'Fel e-post eller lösenord' }
  }

  if (data.status === 'pending_approval') {
    return { token: null, partner: null, error: 'Ditt konto väntar på godkännande' }
  }

  if (data.status === 'suspended') {
    return { token: null, partner: null, error: 'Ditt konto är inaktiverat' }
  }

  const token = await new SignJWT({ partnerId: data.id, email: data.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(JWT_EXPIRES)
    .setIssuedAt()
    .sign(getJwtSecret())

  // Remove password_hash from response
  const { password_hash: _, ...partner } = data

  return { token, partner: partner as Partner }
}

/**
 * Verify JWT token and return partner.
 */
export async function getPartnerFromToken(token: string): Promise<Partner | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    const partnerId = payload.partnerId as string
    if (!partnerId) return null

    const supabase = getServerSupabase()
    const { data } = await supabase
      .from('partners')
      .select('id, email, name, company, referral_code, referral_url, commission_rate, total_earned_sek, total_pending_sek, status, created_at, approved_at')
      .eq('id', partnerId)
      .eq('status', 'active')
      .maybeSingle()

    return (data as Partner) || null
  } catch {
    return null
  }
}

/**
 * Extract partner token from request cookies.
 */
export function getPartnerTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/partner_token=([^;]+)/)
  return match ? match[1] : null
}
