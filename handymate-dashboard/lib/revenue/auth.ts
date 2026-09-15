import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { getAdminSupabase } from '@/lib/admin-auth'
import { getAuthenticatedBusiness } from '@/lib/auth'

/** Server-verified identity. Revenue roles live in app_metadata, never user_metadata.
 * An explicit seller role takes precedence over the legacy internal-admin fallback. */
export function revenueRole(
  user: {
    email?: string
    email_confirmed_at?: string
    app_metadata?: Record<string, unknown>
  },
  adminEmails: string,
): 'manager' | 'seller' | null {
  if (!user.email_confirmed_at || !user.email) return null
  const explicit = user.app_metadata?.revenue_role
  if (explicit === 'disabled') return null
  if (explicit === 'seller' || explicit === 'manager') return explicit
  const email = user.email.toLowerCase()
  return email.endsWith('@handymate.se') ||
    adminEmails
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
      .includes(email)
    ? 'manager'
    : null
}
export async function requireRevenue(request: NextRequest) {
  const client = createRouteHandlerClient({ cookies })
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '')
  const {
    data: { user },
    error,
  } = bearer ? await client.auth.getUser(bearer) : await client.auth.getUser()
  if (error || !user) return null
  const role = revenueRole(user, process.env.ADMIN_EMAILS || '')
  if (!role) return null
  // Reuse the canonical business authentication for attribution and impersonation detection.
  const business = await getAuthenticatedBusiness(request)
  if (business?._impersonation) return null
  return {
    userId: user.id,
    email: user.email!.toLowerCase(),
    manager: role === 'manager',
    businessId: business?.business_id || null,
    db: getAdminSupabase(),
  }
}
