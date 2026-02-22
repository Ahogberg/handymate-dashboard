import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/google/gmail-toggle
 * Toggle Gmail sync on/off for the current user's Google connection
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const enabled = !!body.enabled

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('calendar_connection')
      .update({ gmail_sync_enabled: enabled })
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')

    if (error) throw error

    return NextResponse.json({ gmail_sync_enabled: enabled })
  } catch (error: unknown) {
    console.error('Gmail toggle error:', error)
    const message = error instanceof Error ? error.message : 'Failed to toggle'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
