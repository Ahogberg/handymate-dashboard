import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { canActOnApproval, type ApprovalRoutingRow } from '@/lib/approvals/routing'
import { arTestdataApproval } from '@/lib/testdata'
import { svDateStr } from '@/lib/dates'
import { arAktivt, fallbackSortera, senasteKvallsgrans } from '@/lib/approvals/mobile-home'
import { approvalDisplay } from '@/lib/jarvis/approval-view'

// Auth-helpern läser request.headers — utan force-dynamic cachas svaret
// statiskt och kan visa FEL FÖRETAGS data (force-dynamic-cachebuggen
// 2026-08-22, regel i CLAUDE.md).
export const dynamic = 'force-dynamic'

const MAX_KORT = 3

/**
 * GET /api/mobile/home — Mission Control mobil 4a (G3).
 *
 * ETT anrop för hemskärmens kallstart i stället för fyra roundtrips:
 * prioriterade kön (NBA om dagens rad finns, annars G2-fallback),
 * godkännande-badgen, nattens automationsräkning och antal aktiva uppdrag.
 *
 * NBA-läsningen speglar app/api/next-best-action/route.ts medvetet:
 * samma svDateStr-dag, samma arTestdataApproval- och canActOnApproval-
 * filter, kandidaternas EGNA sparade rationale. Källfacit i
 * tests/mobile-home-feed.spec.ts låser att båda rutterna använder samma
 * primitiver så de inte glider isär.
 *
 * Fallbacken är en SORTERING, inte en rekommendation: inga rationale-
 * texter hittas på (sanningsregel S2 i mobil-planen) — fältet `source`
 * säger ärligt vilket läge som gäller.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const currentUser = await getCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const nu = new Date()

    const [nbaRes, pendingRes, nattRes, missionRes] = await Promise.all([
      supabase
        .from('next_best_action')
        .select('reasoning, ranked_candidates')
        .eq('business_id', businessId)
        .eq('computed_date', svDateStr())
        .maybeSingle(),
      supabase
        .from('pending_approvals')
        .select('*')
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('v3_automation_logs')
        .select('id, rule_name, created_at')
        .eq('business_id', businessId)
        .gte('created_at', senasteKvallsgrans(nu).toISOString())
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('mission')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'active'),
    ])
    if (pendingRes.error) throw pendingRes.error

    // Synliga, aktiva (ej snoozade), behörighetsfiltrerade pending-kort.
    const radar = ((pendingRes.data || []) as ApprovalRoutingRow[])
      .filter(row => !arTestdataApproval(row as any))
      .filter(row => arAktivt(row as any, nu))
    const permits = await Promise.all(radar.map(row => canActOnApproval(supabase, currentUser, row)))
    const synliga = radar.filter((_, i) => permits[i]) as any[]
    // Etapp F (2026-09-02): presentationen (etikett/agent/knapptext) följer
    // med kortet — mobilen slipper egna etikettkartor som driver isär.
    const medDisplay = synliga.map(a => ({ ...a, display: approvalDisplay(a) }))
    const synligaById = new Map(medDisplay.map(a => [a.id as string, a]))

    // Prioriterade kön: NBA-ordning om dagens rad finns och träffar synliga
    // kort — annars fallback-sortering. Aldrig en blandning.
    let source: 'nba' | 'fallback' = 'fallback'
    let kort: Array<Record<string, unknown>> = []
    const ranked = ((nbaRes.data?.ranked_candidates || []) as Array<{
      approval_id: string
      rationale: string
      financial_impact_kr: number | null
      financial_impact_kind: 'KÄNT' | 'UPPSKATTAT' | null
      urgency_note: string | null
    }>)
    for (const entry of ranked) {
      if (kort.length >= MAX_KORT) break
      const approval = synligaById.get(entry.approval_id)
      if (!approval) continue
      kort.push({
        approval,
        rationale: entry.rationale,
        financialImpactKr: entry.financial_impact_kr,
        financialImpactKind: entry.financial_impact_kind,
        urgencyNote: entry.urgency_note,
      })
    }
    if (kort.length > 0) {
      source = 'nba'
    } else {
      kort = fallbackSortera(medDisplay)
        .slice(0, MAX_KORT)
        .map(approval => ({ approval }))
    }

    const nattRader = nattRes.data || []

    return NextResponse.json({
      source,
      queue: kort,
      approvals_badge: Math.min(synliga.length, 99),
      night: {
        since: senasteKvallsgrans(nu).toISOString(),
        count: nattRader.length,
        latest: nattRader.slice(0, 3).map(r => ({ id: r.id, rule_name: r.rule_name, created_at: r.created_at })),
      },
      active_missions: missionRes.count ?? 0,
    })
  } catch (error: any) {
    console.error('GET /api/mobile/home error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
