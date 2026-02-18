import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

/**
 * POST /api/auth/logout - Logga ut användare
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.signOut()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
