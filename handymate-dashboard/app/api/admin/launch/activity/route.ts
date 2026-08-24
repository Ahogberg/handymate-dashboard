import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { canUseChannel } from '@/lib/launch-desk/policy'
import { cleanText, normalizeDateTime } from '@/lib/launch-desk/normalize'
import {
  GTM_ACTIVITY_CHANNELS,
  GTM_OUTCOMES,
  type GtmAccount,
  type GtmActivityChannel,
  type GtmOutcome,
} from '@/lib/launch-desk/types'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const accountId = cleanText(body?.account_id, 80)
  const channel = body?.channel as GtmActivityChannel
  const outcome = body?.outcome as GtmOutcome
  if (!accountId || !GTM_ACTIVITY_CHANNELS.includes(channel) || !GTM_OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: 'Prospekt, kanal eller utfall är ogiltigt' }, { status: 400 })
  }

  const supabase = getAdminSupabase()
  const { data: account, error: readError } = await supabase.from('gtm_account').select('*').eq('id', accountId).maybeSingle()
  if (readError) {
    if (arSchemaSaknas(readError)) return NextResponse.json({ error: 'Kör sql/v166_launch_desk.sql först' }, { status: 503 })
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }
  if (!account) return NextResponse.json({ error: 'Prospektet hittades inte' }, { status: 404 })
  if (!canUseChannel(account as GtmAccount, channel)) {
    return NextResponse.json({ error: 'Kanalen är spärrad för prospektets bolagsform eller kontaktkälla' }, { status: 409 })
  }

  const nextActionAt = normalizeDateTime(body?.next_action_at)
  const happenedAt = normalizeDateTime(body?.happened_at) || new Date().toISOString()
  const { data: activityId, error } = await supabase.rpc('record_gtm_activity', {
    p_account_id: accountId,
    p_admin_user_id: admin.userId,
    p_channel: channel,
    p_outcome: outcome,
    p_notes: cleanText(body?.notes, 3000),
    p_happened_at: happenedAt,
    p_next_action_at: nextActionAt,
  })

  if (error) {
    if (arSchemaSaknas(error)) return NextResponse.json({ error: 'Kör sql/v166_launch_desk.sql först' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction('launch_desk_activity', admin.userId, null, {
    account_id: accountId,
    activity_id: activityId,
    channel,
    outcome,
  })
  return NextResponse.json({ success: true, activity_id: activityId })
}
