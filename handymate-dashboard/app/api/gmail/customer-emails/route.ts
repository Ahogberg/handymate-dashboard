import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken } from '@/lib/google-calendar'
import { getCustomerEmails } from '@/lib/gmail'

/**
 * GET /api/gmail/customer-emails?email=customer@example.com
 * Fetch Gmail threads involving a customer email.
 * Requires Gmail scope and gmail_sync_enabled.
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

    const customerEmail = request.nextUrl.searchParams.get('email')
    if (!customerEmail) {
      return NextResponse.json({ error: 'email parameter required' }, { status: 400 })
    }

    // Get Google connection with Gmail enabled
    const supabase = getServerSupabase()
    const { data: connection } = await supabase
      .from('calendar_connection')
      .select('*')
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
    }

    if (!connection.gmail_scope_granted) {
      return NextResponse.json({ error: 'Gmail scope not granted. Reconnect Google.' }, { status: 400 })
    }

    if (!connection.gmail_sync_enabled) {
      return NextResponse.json({ error: 'Gmail sync not enabled' }, { status: 400 })
    }

    // Ensure valid token
    const tokenResult = await ensureValidToken(connection)
    if (!tokenResult) {
      return NextResponse.json({ error: 'Token expired. Reconnect Google.' }, { status: 401 })
    }

    // Update token if refreshed
    if (tokenResult.access_token !== connection.access_token) {
      await supabase
        .from('calendar_connection')
        .update({
          access_token: tokenResult.access_token,
          token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
        })
        .eq('id', connection.id)
    }

    // Fetch emails from Gmail API
    const threads = await getCustomerEmails(tokenResult.access_token, customerEmail)

    return NextResponse.json({ threads })
  } catch (error: unknown) {
    console.error('Gmail customer-emails error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch emails'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
