import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin } from '@/lib/admin-auth'

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

  const { error } = await supabase
    .from('support_ticket')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: admin.email || 'unknown',
    })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
