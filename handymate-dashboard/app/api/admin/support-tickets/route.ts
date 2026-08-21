import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/support-tickets — Lista öppna supportärenden (ej lösta)
 */
export async function GET(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data, error } = await supabase
    .from('support_ticket')
    .select(
      'id, business_id, thread_id, category, status, summary, escalated_at, resolved_at, satisfaction, business_config:business_id (business_name)'
    )
    .neq('status', 'resolved')
    .order('escalated_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tickets: data || [] })
}
