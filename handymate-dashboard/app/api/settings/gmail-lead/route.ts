import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

/**
 * GET /api/settings/gmail-lead  — fetch current settings
 * PUT /api/settings/gmail-lead  — update settings
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    const { data: conn } = await supabase
      .from('calendar_connection')
      .select('gmail_lead_import_enabled, gmail_lead_approved_senders, gmail_lead_blocked_senders, gmail_lead_last_import_at')
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')
      .maybeSingle()

    return NextResponse.json({
      enabled: conn?.gmail_lead_import_enabled ?? false,
      approved_senders: conn?.gmail_lead_approved_senders ?? '',
      blocked_senders: conn?.gmail_lead_blocked_senders ?? '',
      last_import_at: conn?.gmail_lead_last_import_at ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { enabled, approved_senders, blocked_senders } = body

    const supabase = getServerSupabase()

    const { error } = await supabase
      .from('calendar_connection')
      .update({
        gmail_lead_import_enabled: enabled ?? false,
        gmail_lead_approved_senders: approved_senders ?? '',
        gmail_lead_blocked_senders: blocked_senders ?? '',
      })
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
