/**
 * Dag-7-mailets "nästa bästa steg" (Lager 3 / B9, 2026-08-27).
 *
 * Mailet sammanfattade veckan men pekade bara på /dashboard. Nu bär det ETT
 * konkret nästa steg — ett kort som väntar på hantverkarens beslut — med
 * djuplänk rakt till kortet (#approval-<id>, ankaret finns på godkännande-
 * sidan). Aldrig ett påhittat steg: finns inget riktigt kort utelämnas
 * blocket.
 *
 * Val, i ordning:
 *   1. Dagens next_best_action-rankning (Mattes topp-val) om kortet ännu
 *      är pending.
 *   2. Annars det ÄLDSTA väntande kortet som inte är ett startkort
 *      (team_intro) — exekverbara typer (mayExecute) före rena review-kort.
 *   3. Testdata (arTestdataApproval) räknas aldrig.
 *
 * Den rena väljaren (chooseDay7Candidate) är enhetstestad; DB-läsningen
 * ligger i pickDay7NextAction.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { mayExecute } from '@/lib/approvals/action-contract'
import { arTestdataApproval } from '@/lib/testdata'
import { svDateStr } from '@/lib/dates'

export interface Day7CandidateRow {
  id: string
  approval_type: string
  title: string | null
  status: string
  created_at: string
  payload?: Record<string, unknown> | null
}

export interface Day7NextAction {
  approvalId: string
  title: string
  href: string
}

export function day7Href(approvalId: string): string {
  return `/dashboard/approvals#approval-${approvalId}`
}

/**
 * Ren väljare. `rows` = väntande kort för företaget (alla statusar tillåtna,
 * filtreras här). `nbaTopId` = dagens rankade topp-kort, eller null.
 */
export function chooseDay7Candidate(rows: Day7CandidateRow[], nbaTopId: string | null): Day7NextAction | null {
  const giltiga = rows
    .filter(r => r.status === 'pending')
    .filter(r => r.approval_type !== 'team_intro')
    .filter(r => !arTestdataApproval({ title: r.title, payload: r.payload ?? null }))
    .filter(r => typeof r.title === 'string' && r.title.trim().length > 0)

  if (nbaTopId) {
    const topp = giltiga.find(r => r.id === nbaTopId)
    if (topp) return { approvalId: topp.id, title: topp.title!.trim(), href: day7Href(topp.id) }
  }

  const sorterade = [...giltiga].sort((a, b) => {
    const ea = mayExecute(a.approval_type) ? 0 : 1
    const eb = mayExecute(b.approval_type) ? 0 : 1
    if (ea !== eb) return ea - eb
    return a.created_at.localeCompare(b.created_at)
  })
  const first = sorterade[0]
  return first ? { approvalId: first.id, title: first.title!.trim(), href: day7Href(first.id) } : null
}

export async function pickDay7NextAction(supabase: SupabaseClient, businessId: string): Promise<Day7NextAction | null> {
  const [{ data: nba }, { data: rows, error }] = await Promise.all([
    supabase
      .from('next_best_action')
      .select('ranked_candidates')
      .eq('business_id', businessId)
      .eq('computed_date', svDateStr())
      .maybeSingle(),
    supabase
      .from('pending_approvals')
      .select('id, approval_type, title, status, created_at, payload')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50),
  ])
  if (error) {
    console.warn('[day7-next-action] kunde inte läsa kön (utelämnar steget):', error.message)
    return null
  }
  const ranked = (nba?.ranked_candidates || []) as Array<{ approval_id?: string }>
  const nbaTopId = typeof ranked[0]?.approval_id === 'string' ? ranked[0].approval_id : null
  return chooseDay7Candidate((rows || []) as Day7CandidateRow[], nbaTopId)
}
