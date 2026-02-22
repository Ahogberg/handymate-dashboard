import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken } from '@/lib/google-calendar'
import { getEmailContent } from '@/lib/gmail'

/**
 * GET /api/gmail/email-content?messageId=xxx
 * Fetch a single email's full content (on-demand, never cached/stored — GDPR).
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

    const messageId = request.nextUrl.searchParams.get('messageId')
    if (!messageId) {
      return NextResponse.json({ error: 'messageId parameter required' }, { status: 400 })
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

    const email = await getEmailContent(tokenResult.access_token, messageId)

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    return NextResponse.json({ email })
  } catch (error: unknown) {
    console.error('Gmail email-content error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
