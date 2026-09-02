import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { korSignalerForAccount } from '@/lib/launch-desk/signaler-runner'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

/**
 * POST /api/admin/launch/signaler/batch (pass 1b,
 * tasks/plan-launch-desk-signaler.md).
 *
 * Kör lib/launch-desk/signaler-runner.ts sekventiellt för upp till 25 konton
 * i status imported/qualified som har en webbplats men ännu saknar
 * brief_source_snapshot.signals. Ingen cron i detta pass — bara manuell
 * knapptryckning från Launch Desk-listvyn. Sekventiellt, inte parallellt,
 * så vi inte hamrar 25 externa sajter samtidigt.
 */
export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const supabase = getAdminSupabase()
  const { data: kandidater, error } = await supabase
    .from('gtm_account')
    .select('*')
    .in('status', ['imported', 'qualified'])
    .not('website', 'is', null)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    if (arSchemaSaknas(error)) return NextResponse.json({ error: 'Kör sql/v166_launch_desk.sql först' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const saknarSignaler = (kandidater || []).filter(account => {
    const snapshot = account.brief_source_snapshot
    return !(snapshot && typeof snapshot === 'object' && (snapshot as Record<string, unknown>).signals)
  }).slice(0, 25)

  let okCount = 0
  let errCount = 0
  const results: Array<{ account_id: string; ok: boolean; reason?: string }> = []

  for (const account of saknarSignaler) {
    const result = await korSignalerForAccount(supabase, account, admin.userId)
    if (result.ok) okCount++
    else errCount++
    results.push({ account_id: result.account_id, ok: result.ok, reason: result.reason })
  }

  await logAdminAction('launch_desk_signaler_batch', admin.userId, null, {
    checked: saknarSignaler.length,
    ok: okCount,
    error: errCount,
  })

  return NextResponse.json({ checked: saknarSignaler.length, ok: okCount, error: errCount, results })
}
