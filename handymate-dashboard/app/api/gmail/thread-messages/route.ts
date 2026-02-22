import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken } from '@/lib/google-calendar'
import { getThreadMessages } from '@/lib/gmail'

/**
 * GET /api/gmail/thread-messages?threadId=xxx
 * Fetch all messages in a Gmail thread (on-demand, never cached/stored — GDPR).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const threadId = request.nextUrl.searchParams.get('threadId')
    if (!threadId) {
      return NextResponse.json({ error: 'threadId parameter required' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: connection } = await supabase
      .from('calendar_connection')
      .select('*')
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')
      .single()

    if (!connection?.gmail_scope_granted || !connection?.gmail_sync_enabled) {
      return NextResponse.json({ error: 'Gmail not enabled' }, { status: 400 })
    }

    const tokenResult = await ensureValidToken(connection)
    if (!tokenResult) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    if (tokenResult.access_token !== connection.access_token) {
      await supabase
        .from('calendar_connection')
        .update({
          access_token: tokenResult.access_token,
          token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
        })
        .eq('id', connection.id)
    }

    const messages = await getThreadMessages(tokenResult.access_token, threadId)

    return NextResponse.json({ messages })
  } catch (error: unknown) {
    console.error('Gmail thread-messages error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch thread'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
