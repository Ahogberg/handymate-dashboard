import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { generateLaunchBrief } from '@/lib/launch-desk/brief'
import { cleanText } from '@/lib/launch-desk/normalize'
import type { GtmAccount } from '@/lib/launch-desk/types'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const accountId = cleanText(body?.account_id, 80)
  if (!accountId) return NextResponse.json({ error: 'Prospekt saknas' }, { status: 400 })

  const supabase = getAdminSupabase()
  const { data: account, error: readError } = await supabase.from('gtm_account').select('*').eq('id', accountId).maybeSingle()
  if (readError) {
    if (arSchemaSaknas(readError)) return NextResponse.json({ error: 'Kör sql/v166_launch_desk.sql först' }, { status: 503 })
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }
  if (!account) return NextResponse.json({ error: 'Prospektet hittades inte' }, { status: 404 })
  if (account.status === 'suppressed') return NextResponse.json({ error: 'Spärrade prospekt får inga nya kontaktutkast' }, { status: 409 })

  const brief = await generateLaunchBrief(account as GtmAccount)
  const generatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('gtm_account')
    .update({ ...brief, brief_generated_at: generatedAt, updated_by: admin.userId, updated_at: generatedAt })
    .eq('id', accountId)
    .select('*')
    .single()

  if (error) {
    if (arSchemaSaknas(error)) return NextResponse.json({ error: 'Kör sql/v166_launch_desk.sql först' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction('launch_desk_brief', admin.userId, null, {
    account_id: accountId,
    generated_by: brief.brief_generated_by,
    source_checked_at: account.source_checked_at,
  })
  return NextResponse.json({ account: data })
}
