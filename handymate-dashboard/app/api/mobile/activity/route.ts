import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { activityLinks } from '@/lib/approvals/activity-links'
import { canActOnApproval } from '@/lib/approvals/routing'

export const dynamic = 'force-dynamic'

// Owners/admins see company history; members can reread their own decisions
// only while they still meet the card's current routing permissions.
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    const user = await getCurrentUser(request)
    if (!business || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.business_id !== business.business_id) {
      return NextResponse.json({ error: 'Användaren tillhör inte det verifierade företaget.' }, { status: 403 })
    }
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10) || 20))
    const db = getServerSupabase()
    const companyWide = ['owner', 'admin'].includes(user.role)
    let approvalQuery = db.from('pending_approvals').select('id, title, approval_type, business_id, routing_role, resolved_by, resolved_at, payload').eq('business_id', business.business_id).in('status', ['approved', 'rejected', 'auto_approved'])
    if (!companyWide) approvalQuery = approvalQuery.eq('resolved_by', user.id)
    const [rules, approvals] = await Promise.all([
      companyWide ? db.from('v3_automation_logs').select('id, action_type, rule_name, status, approval_id, created_at').eq('business_id', business.business_id).order('created_at', { ascending: false }).limit(limit) : Promise.resolve({ data: [], error: null }),
      approvalQuery.order('resolved_at', { ascending: false }).limit(limit),
    ])
    if (rules.error || approvals.error) return NextResponse.json({ error: 'Kunde inte hämta hela aktivitetsloggen. Försök igen.' }, { status: 500 })
    const labels: Record<string, string> = { success: 'Körningen rapporterade lyckat utfall', failed: 'Körningen misslyckades', pending_approval: 'Väntar på godkännande', rejected: 'Avvisad', skipped: 'Överhoppad' }
    const candidates = (approvals.data || []).filter(row => row.business_id === business.business_id && (companyWide || row.resolved_by === user.id))
    const permits = await Promise.all(candidates.map(row => companyWide ? true : canActOnApproval(db, user, row)))
    const receiptRows = await Promise.all(candidates.filter((_, i) => permits[i]).filter(row => row.resolved_at).map(async row => {
      const receipt = row.payload?.execution_result?.receipt
      const text = typeof receipt?.text === 'string' ? receipt.text : 'Beslutet är registrerat, men en sparad utförandekvittens saknas.'
      return { id: `approval:${row.id}`, type: row.approval_type, description: row.title, receipt_text: text, links: await activityLinks(db, user, row.payload?.execution_result?.artifacts), receipt_state: typeof receipt?.state === 'string' ? receipt.state : 'unknown', created_at: row.resolved_at, auto: false }
    }))
    const represented = new Set(receiptRows.map(row => row.id.slice('approval:'.length)))
    const rows = [
      ...receiptRows,
      ...(rules.data || []).filter(row => !row.approval_id || !represented.has(row.approval_id)).map(row => ({ id: `rule:${row.id}`, type: row.action_type, status: row.status, auto: !row.approval_id, description: `${row.rule_name || 'Automation'} · ${labels[row.status] || 'Utfallet är inte bekräftat'}`, created_at: row.created_at })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit)
    return NextResponse.json({ activities: rows })
  } catch {
    return NextResponse.json({ error: 'Kunde inte hämta aktivitetsloggen' }, { status: 500 })
  }
}
