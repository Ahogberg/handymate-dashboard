import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { cleanText } from '@/lib/launch-desk/normalize'
import { GTM_SUPPRESSION_REASONS, type GtmSuppressionReason } from '@/lib/launch-desk/types'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const accountId = cleanText(body?.account_id, 80)
  const reason = body?.reason as GtmSuppressionReason
  if (!accountId || !GTM_SUPPRESSION_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Prospekt eller spärrorsak är ogiltig' }, { status: 400 })
  }

  const supabase = getAdminSupabase()
  const { data: suppressionId, error } = await supabase.rpc('suppress_gtm_account', {
    p_account_id: accountId,
    p_admin_user_id: admin.userId,
    p_reason: reason,
    p_notes: cleanText(body?.notes, 3000),
  })
  if (error) {
    if (arSchemaSaknas(error)) return NextResponse.json({ error: 'Kör sql/v166_launch_desk.sql först' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction('launch_desk_suppress', admin.userId, null, {
    account_id: accountId,
    suppression_id: suppressionId,
    reason,
  })
  return NextResponse.json({ success: true, suppression_id: suppressionId })
}
