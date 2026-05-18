/**
 * Superadmin-helpers för impersonation.
 *
 * is_superadmin lagras i auth.users.app_metadata (kan endast sättas via
 * service_role — Supabase säkerhet förhindrar privilege-escalation från UI).
 *
 * Impersonation-state lagras i httpOnly-cookie `hm_impersonate` på server-
 * verifierad basis: cookien innehåller bara target_business_id, men servern
 * accepterar den ENDAST om inloggad user är superadmin. Cookie-injection
 * via DevTools är ofarlig för icke-admins.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export const IMPERSONATION_COOKIE = 'hm_impersonate'
export const IMPERSONATION_MAX_AGE_SECONDS = 24 * 60 * 60 // 24h auto-expiry

export interface ImpersonationContext {
  admin_user_id: string
  admin_email: string
  target_business_id: string
  started_at: string
}

// ─────────────────────────────────────────────────────────────────
// Superadmin-detection
// ─────────────────────────────────────────────────────────────────

// Email-baserad fallback (samma logik som lib/admin-auth.ts isAdmin)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

/**
 * Kollar om en authenticated Supabase user är markerad som superadmin.
 *
 * Tre metoder (i prioritetsordning):
 * 1. user.app_metadata.is_superadmin === true (service_role-skyddat, säkrast)
 * 2. user.email slutar på @handymate.se
 * 3. user.email finns i ADMIN_EMAILS env-var (komma-separerad)
 *
 * Metod 2 + 3 är konsekvent med befintlig lib/admin-auth.ts isAdmin().
 */
export function isSuperAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  // Primary: app_metadata (säkrast — kan endast sättas via service_role)
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>
  if (appMeta.is_superadmin === true) return true
  // Fallback: email-baserad
  const email = (user.email || '').toLowerCase()
  if (!email) return false
  if (email.endsWith('@handymate.se')) return true
  if (ADMIN_EMAILS.includes(email)) return true
  return false
}

// ─────────────────────────────────────────────────────────────────
// Impersonation-cookie helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Läs impersonation-cookie från en NextRequest. Returnerar target_business_id
 * om cookien finns, annars null. OBS: detta verifierar INTE om user är
 * superadmin — det måste callern göra separat.
 */
export function readImpersonationCookie(request: NextRequest): string | null {
  const cookie = request.cookies.get(IMPERSONATION_COOKIE)
  if (!cookie?.value) return null
  // Cookie-värdet är target_business_id direkt. Vi sanity-checkar formatet:
  const value = cookie.value.trim()
  if (!value || value.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    return null
  }
  return value
}

// ─────────────────────────────────────────────────────────────────
// Audit-logging
// ─────────────────────────────────────────────────────────────────

/**
 * Skapa start-rad i admin_impersonation_log. Non-blocking — logging-fel
 * stoppar inte impersonation-start.
 */
export async function logImpersonationStart(
  supabase: SupabaseClient,
  params: {
    admin_user_id: string
    admin_email: string
    target_business_id: string
    target_business_name?: string | null
    reason?: string | null
    admin_ip?: string | null
    admin_user_agent?: string | null
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('admin_impersonation_log')
      .insert({
        admin_user_id: params.admin_user_id,
        admin_email: params.admin_email,
        target_business_id: params.target_business_id,
        target_business_name: params.target_business_name ?? null,
        reason: params.reason ?? null,
        admin_ip: params.admin_ip ?? null,
        admin_user_agent: params.admin_user_agent ?? null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[superadmin/log-start] insert error:', error)
      return null
    }
    return data?.id || null
  } catch (err) {
    console.error('[superadmin/log-start] unexpected:', err)
    return null
  }
}

/**
 * Sätt ended_at på senaste aktiva impersonation-rad för admin+target.
 * Non-blocking.
 */
export async function logImpersonationEnd(
  supabase: SupabaseClient,
  adminUserId: string,
  targetBusinessId: string,
): Promise<void> {
  try {
    await supabase
      .from('admin_impersonation_log')
      .update({ ended_at: new Date().toISOString() })
      .eq('admin_user_id', adminUserId)
      .eq('target_business_id', targetBusinessId)
      .is('ended_at', null)
  } catch (err) {
    console.error('[superadmin/log-end] unexpected:', err)
  }
}
