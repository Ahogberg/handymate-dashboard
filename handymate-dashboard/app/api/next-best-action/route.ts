import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { canActOnApproval, type ApprovalRoutingRow } from '@/lib/approvals/routing'
import { arTestdataApproval } from '@/lib/testdata'
import { svDateStr } from '@/lib/dates'

export const dynamic = 'force-dynamic'

/**
 * GET /api/next-best-action
 *
 * JarvisHome.tsx:s vanliga hämtning (/api/approvals?status=pending&limit=15)
 * ser bara de 15 senaste — hela poängen med Next Best Action är att lyfta
 * fram något som INTE nödvändigtvis är senast skapat, så den träffen kan
 * missas helt. Den här endpointen gör uppslaget mot en känd approval-id
 * istället för att lita på en redan hämtad, begränsad lista.
 *
 * Går igenom dagens next_best_action.ranked_candidates I ORDNING tills en
 * kandidat fortfarande är 'pending' (samma arTestdataApproval +
 * canActOnApproval-filter som huvudkön). Träffen kan vara #1 ELLER en
 * lägre rankad om toppvalet redan hanterades innan sidan laddades — då
 * används DEN kandidatens EGEN sparade rationale, aldrig en påhittad
 * förklaring för varför #1 försvann.
 *
 * Ingen rad för idag, eller ingen kandidat kvar pending → { recommendation: null }.
 * Det är det ärliga svaret, inte ett fel.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    const { data: nba, error: nbaErr } = await supabase
      .from('next_best_action')
      .select('reasoning, principles_applied, ranked_candidates')
      .eq('business_id', business.business_id)
      .eq('computed_date', svDateStr())
      .maybeSingle()
    if (nbaErr) throw nbaErr
    if (!nba) return NextResponse.json({ recommendation: null })

    const ranked = (nba.ranked_candidates || []) as Array<{
      approval_id: string
      rationale: string
      financial_impact_kr: number | null
      financial_impact_kind: 'KÄNT' | 'UPPSKATTAT' | null
      urgency_note: string | null
    }>
    if (ranked.length === 0) return NextResponse.json({ recommendation: null })

    const approvalIds = ranked.map(r => r.approval_id)
    const { data: approvalRows, error: approvalErr } = await supabase
      .from('pending_approvals')
      .select('*')
      .in('id', approvalIds)
      .eq('status', 'pending')
    if (approvalErr) throw approvalErr

    const byId = new Map((approvalRows || []).map(a => [a.id, a]))
    const visibleRows = ((approvalRows || []) as ApprovalRoutingRow[]).filter(row => !arTestdataApproval(row as any))
    const permits = await Promise.all(visibleRows.map(row => canActOnApproval(supabase, currentUser, row)))
    const permittedIds = new Set(visibleRows.filter((_, i) => permits[i]).map(row => (row as any).id as string))

    for (let rank = 0; rank < ranked.length; rank++) {
      const entry = ranked[rank]
      const approval = byId.get(entry.approval_id)
      if (!approval || !permittedIds.has(entry.approval_id)) continue

      return NextResponse.json({
        recommendation: {
          approval,
          rank,
          rationale: entry.rationale,
          financialImpactKr: entry.financial_impact_kr,
          financialImpactKind: entry.financial_impact_kind,
          urgencyNote: entry.urgency_note,
          reasoning: nba.reasoning,
          principlesApplied: nba.principles_applied || [],
        },
      })
    }

    return NextResponse.json({ recommendation: null })
  } catch (error: any) {
    console.error('GET /api/next-best-action error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
