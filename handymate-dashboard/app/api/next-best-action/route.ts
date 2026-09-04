import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { canActOnApproval, type ApprovalRoutingRow } from '@/lib/approvals/routing'
import { arTestdataApproval } from '@/lib/testdata'
import { svDateStr } from '@/lib/dates'

export const dynamic = 'force-dynamic'

/** Veckomötets beslutskort (2026-08-14) visar upp till tre kandidater —
 *  samma rangordnade rader, bara fler av dem. Ingen egen selektion: Veckomötet
 *  återanvänder exakt denna lista, den beräknar aldrig en egen "veckans tre". */
const MAX_RECOMMENDATIONS = 3

/**
 * GET /api/next-best-action
 *
 * JarvisHome.tsx:s vanliga hämtning (/api/approvals?status=pending&limit=15)
 * ser bara de 15 senaste — hela poängen med Next Best Action är att lyfta
 * fram något som INTE nödvändigtvis är senast skapat, så den träffen kan
 * missas helt. Den här endpointen gör uppslaget mot en känd approval-id
 * istället för att lita på en redan hämtad, begränsad lista.
 *
 * Går igenom dagens next_best_action.ranked_candidates I ORDNING och samlar
 * alla som fortfarande är 'pending' (samma arTestdataApproval +
 * canActOnApproval-filter som huvudkön) — `recommendation` är den FÖRSTA
 * träffen (oförändrat, samma kontrakt som innan), `recommendations` är upp
 * till MAX_RECOMMENDATIONS av dem i samma ordning (additiv, för Veckomötets
 * beslutskort). En kandidat som redan hanterades innan sidan laddades hoppas
 * bara över — träffarna använder alltid SIN EGEN sparade rationale, aldrig
 * en påhittad förklaring för varför en högre rankad kandidat försvann.
 *
 * Ingen rad för idag, eller ingen kandidat kvar pending →
 * { recommendation: null, recommendations: [] }. Det är det ärliga svaret,
 * inte ett fel.
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

    const recommendations: Array<Record<string, unknown>> = []
    for (let rank = 0; rank < ranked.length && recommendations.length < MAX_RECOMMENDATIONS; rank++) {
      const entry = ranked[rank]
      const approval = byId.get(entry.approval_id)
      if (!approval || !permittedIds.has(entry.approval_id)) continue

      recommendations.push({
        approval,
        rank,
        rationale: entry.rationale,
        financialImpactKr: entry.financial_impact_kr,
        financialImpactKind: entry.financial_impact_kind,
        urgencyNote: entry.urgency_note,
        reasoning: nba.reasoning,
        // principles_applied (jsonb) är { source, citerat } sedan
        // Pass D (husregler som standard-fallback, lib/jarvis/husregler.ts)
        // — UI:t vill bara ha citaten, aldrig källflaggan.
        principlesApplied: (nba.principles_applied as { citerat?: string[] } | null)?.citerat || [],
      })
    }

    return NextResponse.json({
      recommendation: recommendations[0] ?? null,
      recommendations,
    })
  } catch (error: any) {
    console.error('GET /api/next-best-action error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
