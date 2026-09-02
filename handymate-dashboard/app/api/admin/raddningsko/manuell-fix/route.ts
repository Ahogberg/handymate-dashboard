import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/raddningsko/manuell-fix — { business_id, summary }
 *
 * Bokför signalen manuell_fix_kravdes (regeln i docs/launch/
 * FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md §2: "Inga manuella databasfixar.
 * Behövs en blir det ett P0-ärende med kodfix, aldrig SQL... Varje sådan
 * frestelse bokförs i räddningskön"). Ett nytt ärende per anrop — cronen
 * rör aldrig den här signalen, så den stängs bara manuellt via
 * /api/admin/raddningsko/[id] ('los'/'avfarda').
 */
export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const businessId = String(body?.business_id || '').trim()
  const summary = String(body?.summary || '').trim()
  if (!businessId || !summary) {
    return NextResponse.json({ error: 'business_id och summary krävs' }, { status: 400 })
  }

  const supabase = getAdminSupabase()
  const nu = new Date().toISOString()

  const { data: inserted, error } = await supabase
    .from('raddningsarende')
    .insert({
      business_id: businessId,
      signal: 'manuell_fix_kravdes',
      severity: 'hog',
      status: 'oppet',
      summary,
      evidence: { bokford_av: admin.email || 'unknown' },
      first_seen_at: nu,
      last_seen_at: nu,
      owner: admin.email || null,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || 'Kunde inte bokföra' }, { status: 500 })
  }

  await logAdminAction('raddningsarende_manuell_fix', admin.userId || 'unknown', businessId, {
    arendeId: inserted.id,
    adminEmail: admin.email,
    summary,
  })

  return NextResponse.json({ success: true, id: inserted.id })
}
