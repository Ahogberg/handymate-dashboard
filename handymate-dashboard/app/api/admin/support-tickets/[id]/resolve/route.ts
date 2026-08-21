import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/support-tickets/[id]/resolve — markerar ärendet löst.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: updated, error } = await supabase
    .from('support_ticket')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: admin.email || 'unknown',
    })
    .eq('id', params.id)
    .select('id, business_id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Ärendet hittades inte' }, { status: 404 })
  }

  await logAdminAction('support_ticket_resolve', admin.userId || 'unknown', updated.business_id, {
    ticketId: updated.id,
    adminEmail: admin.email,
  })

  return NextResponse.json({ success: true })
}
