import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// List of admin emails from environment variable
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

/**
 * Check if the current user is an admin
 * Admin = email ends with @handymate.se OR is in ADMIN_EMAILS env variable
 */
export async function isAdmin(request: NextRequest): Promise<{ isAdmin: boolean; userId?: string; email?: string }> {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
      return { isAdmin: false }
    }

    const email = session.user.email?.toLowerCase() || ''
    const userId = session.user.id

    // Check if email ends with @handymate.se or is in admin list
    const isAdminUser = email.endsWith('@handymate.se') || ADMIN_EMAILS.includes(email)

    return {
      isAdmin: isAdminUser,
      userId,
      email
    }
  } catch (error) {
    console.error('Admin auth check error:', error)
    return { isAdmin: false }
  }
}

/**
 * Log admin action to audit log
 */
export async function logAdminAction(
  action: string,
  adminUserId: string,
  targetBusinessId: string | null,
  details: Record<string, any> = {}
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()

    await supabase.from('admin_audit_log').insert({
      action,
      admin_user_id: adminUserId,
      target_business_id: targetBusinessId,
      details,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    // Log to console but don't fail the request
    console.error('Failed to log admin action:', error)
  }
}

/**
 * Generate a random password
 */
export function generatePassword(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

/**
 * Get Supabase admin client for admin operations
 */
export function getAdminSupabase() {
  return getSupabaseAdmin()
}
