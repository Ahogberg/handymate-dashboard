import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface BusinessUser {
  id: string
  business_id: string
  user_id: string | null
  role: 'owner' | 'admin' | 'employee'
  name: string
  email: string
  phone: string | null
  title: string | null
  hourly_cost: number | null
  hourly_rate: number | null
  color: string
  avatar_url: string | null
  is_active: boolean
  can_see_all_projects: boolean
  can_see_financials: boolean
  can_manage_users: boolean
  can_approve_time: boolean
  can_create_invoices: boolean
}

export type Permission =
  | 'see_all_projects'
  | 'see_financials'
  | 'manage_users'
  | 'approve_time'
  | 'create_invoices'
  | 'manage_settings'

const PERMISSION_MAP: Record<Permission, keyof BusinessUser> = {
  see_all_projects: 'can_see_all_projects',
  see_financials: 'can_see_financials',
  manage_users: 'can_manage_users',
  approve_time: 'can_approve_time',
  create_invoices: 'can_create_invoices',
  manage_settings: 'can_manage_users' // mapped to manage_users for owner/admin check
}

/**
 * Kontrollerar om en användare har en viss permission
 */
export function hasPermission(user: BusinessUser, permission: Permission): boolean {
  // Owner har alltid alla permissions
  if (user.role === 'owner') return true

  // Admin har alla utom manage_settings (om inte explicit satt)
  if (user.role === 'admin') {
    if (permission === 'manage_settings') return false
    return true
  }

  // Employee: kolla specifika flaggor
  const field = PERMISSION_MAP[permission]
  if (!field) return false
  return user[field] as boolean
}

/**
 * Kontrollerar om en användare är owner eller admin
 */
export function isOwnerOrAdmin(user: BusinessUser): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

/**
 * Extraherar user_id från request (samma logik som getAuthenticatedBusiness)
 */
async function extractUserId(request: NextRequest): Promise<string | null> {
  const supabase = getSupabase()

  const authHeader = request.headers.get('authorization')
  const cookieHeader = request.headers.get('cookie')

  let accessToken: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7)
  } else if (cookieHeader) {
    const cookies: Record<string, string> = {}
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=')
      if (name && rest.length > 0) {
        cookies[name] = rest.join('=')
      }
    })
    accessToken = cookies['sb-access-token'] || cookies['supabase-auth-token']
  }

  if (!accessToken) {
    const sbCookie = cookieHeader?.match(/sb-[^=]+-auth-token=([^;]+)/)
    if (sbCookie) {
      try {
        const decoded = decodeURIComponent(sbCookie[1])
        const parsed = JSON.parse(decoded)
        accessToken = parsed[0]
      } catch {
        // Ignore parse errors
      }
    }
  }

  if (!accessToken) return null

  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  if (error || !user) return null
  return user.id
}

/**
 * Hämta aktuell BusinessUser från request.
 * Söker först i business_users med user_id.
 * Om inget hittas returneras null.
 */
export async function getCurrentUser(request: NextRequest): Promise<BusinessUser | null> {
  try {
    const userId = await extractUserId(request)
    if (!userId) return null

    const supabase = getSupabase()

    // Hitta business_user med detta user_id
    const { data: businessUser, error } = await supabase
      .from('business_users')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (error || !businessUser) return null

    return businessUser as BusinessUser
  } catch (error) {
    console.error('getCurrentUser error:', error)
    return null
  }
}

/**
 * Kräver en inloggad BusinessUser, annars kastar error
 */
export async function requireUser(request: NextRequest): Promise<BusinessUser> {
  const user = await getCurrentUser(request)
  if (!user) {
    throw new AuthError('Unauthorized', 401)
  }
  return user
}

/**
 * Kräver en specifik permission, annars kastar error
 */
export async function requirePermission(
  request: NextRequest,
  permission: Permission
): Promise<BusinessUser> {
  const user = await requireUser(request)
  if (!hasPermission(user, permission)) {
    throw new AuthError('Insufficient permissions', 403)
  }
  return user
}

/**
 * Kräver en av de specificerade rollerna
 */
export async function requireRole(
  request: NextRequest,
  roles: string[]
): Promise<BusinessUser> {
  const user = await requireUser(request)
  if (!roles.includes(user.role)) {
    throw new AuthError('Insufficient role', 403)
  }
  return user
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'AuthError'
  }
}
