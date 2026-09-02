import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const SEVERITY_ORDER: Record<string, number> = { hog: 0, medel: 1, lag: 2 }

/**
 * GET /api/admin/raddningsko — öppna + pågående ärenden (docs/launch/
 * FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md §3), skrivna av
 * /api/cron/raddningsko. Sorterade allvar hög→låg, sedan senast sedd.
 */
export async function GET(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data, error } = await supabase
    .from('raddningsarende')
    .select(
      'id, business_id, signal, severity, status, summary, evidence, first_seen_at, last_seen_at, owner, atgard, business_config:business_id (business_name)',
    )
    .in('status', ['oppet', 'pagaende'])
    .order('last_seen_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const arenden = (data || []).sort(
    (a: any, b: any) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  )

  return NextResponse.json({ arenden })
}
