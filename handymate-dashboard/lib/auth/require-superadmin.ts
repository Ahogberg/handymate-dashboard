/**
 * Gate-helper för admin-routes. Verifierar att inloggad user är superadmin
 * (app_metadata.is_superadmin === true) — annars returnerar 403-response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { isSuperAdmin } from './superadmin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name && rest.length > 0) cookies[name] = rest.join('=')
  })
  return cookies
}

function extractAccessToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7)

  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = parseCookies(cookieHeader)
  if (cookies['sb-access-token']) return cookies['sb-access-token']
  if (cookies['supabase-auth-token']) return cookies['supabase-auth-token']

  // Supabase v2 session-cookie
  const sbMatch = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/)
  if (sbMatch) {
    try {
      const decoded = decodeURIComponent(sbMatch[1])
      const parsed = JSON.parse(decoded)
      return parsed[0] || null
    } catch {
      return null
    }
  }
  return null
}

export interface SuperAdminContext {
  user: User
  supabase: ReturnType<typeof getSupabase>
}

/**
 * Returnerar { user, supabase } om superadmin, annars NextResponse 401/403.
 */
export async function requireSuperAdmin(
  request: NextRequest,
): Promise<SuperAdminContext | NextResponse> {
  const accessToken = extractAccessToken(request)
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized — login required' }, { status: 401 })
  }

  const supabase = getSupabase()
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized — invalid session' }, { status: 401 })
  }

  if (!isSuperAdmin(user)) {
    console.warn(`[admin] denied non-superadmin: ${user.email} (${user.id})`)
    return NextResponse.json({ error: 'Forbidden — superadmin required' }, { status: 403 })
  }

  return { user, supabase }
}
