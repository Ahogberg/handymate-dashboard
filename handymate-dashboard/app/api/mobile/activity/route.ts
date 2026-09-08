import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Company-wide history. Project/member-scoped history needs separate routing.
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    const user = await getCurrentUser(request)
    if (!business || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.business_id !== business.business_id || !['owner', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Företagets samlade aktivitet kräver ägare eller administratör.' }, { status: 403 })
    }
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10) || 20))
    const db = getServerSupabase()
    const [legacy, rules] = await Promise.all([
      db.from('automation_logs').select('id, type, description, created_at').eq('business_id', business.business_id).order('created_at', { ascending: false }).limit(limit),
      db.from('v3_automation_logs').select('id, action_type, rule_name, status, approval_id, created_at').eq('business_id', business.business_id).order('created_at', { ascending: false }).limit(limit),
    ])
    if (legacy.error || rules.error) return NextResponse.json({ error: 'Kunde inte hämta hela aktivitetsloggen. Försök igen.' }, { status: 500 })
    const labels: Record<string, string> = { success: 'Körningen rapporterade lyckat utfall', failed: 'Körningen misslyckades', pending_approval: 'Väntar på godkännande', rejected: 'Avvisad', skipped: 'Överhoppad' }
    const rows = [
      ...(legacy.data || []).map(row => ({ ...row, id: `legacy:${row.id}` })),
      ...(rules.data || []).map(row => ({ id: `rule:${row.id}`, type: row.action_type, status: row.status, auto: !row.approval_id, description: `${row.rule_name || 'Automation'} · ${labels[row.status] || 'Utfallet är inte bekräftat'}`, created_at: row.created_at })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit)
    return NextResponse.json({ activities: rows })
  } catch {
    return NextResponse.json({ error: 'Kunde inte hämta aktivitetsloggen' }, { status: 500 })
  }
}
