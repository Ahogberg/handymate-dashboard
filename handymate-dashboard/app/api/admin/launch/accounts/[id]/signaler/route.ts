import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { korSignalerForAccount } from '@/lib/launch-desk/signaler-runner'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/launch/accounts/[id]/signaler (pass 1b,
 * tasks/plan-launch-desk-signaler.md).
 *
 * Läser prospektets EGEN webbplats — aldrig kataloger, aldrig sociala nätverk
 * (docs/gtm/LAUNCH_DESK.md, dataskyddskontraktet) — med samma SSRF-skyddade
 * hämtning som onboardingens hemsida-förgrening, härleder deterministiska
 * signaler (lib/launch-desk/signaler.ts, ingen AI) och sparar dem i
 * brief_source_snapshot.signals utan att skriva över andra nycklar i
 * snapshoten (lib/launch-desk/signaler-runner.ts).
 *
 * Fel i hämtningen är förväntat (trasig sajt, timeout, robots-liknande
 * blockering) och ger ALDRIG 500 — svaret blir 200 med { ok:false, reason }
 * och en tom signals-snapshot så UI:t kan visa "Sajten gick inte att läsa".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const supabase = getAdminSupabase()
  const { data: account, error: readError } = await supabase.from('gtm_account').select('*').eq('id', id).maybeSingle()
  if (readError) {
    if (arSchemaSaknas(readError)) return NextResponse.json({ error: 'Kör sql/v166_launch_desk.sql först' }, { status: 503 })
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }
  if (!account) return NextResponse.json({ error: 'Prospektet hittades inte' }, { status: 404 })
  if (!account.website) return NextResponse.json({ error: 'Prospektet saknar webbplats' }, { status: 400 })

  const result = await korSignalerForAccount(supabase, account, admin.userId)

  await logAdminAction('launch_desk_signaler', admin.userId, null, {
    account_id: id,
    url: result.snapshot.url,
    ok: result.ok,
    signal_count: result.snapshot.signals.length,
  })

  return NextResponse.json({ ok: result.ok, reason: result.reason, account: result.account, snapshot: result.snapshot })
}
