/**
 * Next Best Action Engine — orkestrering (2026-08-13).
 *
 * Pure/IO-split, samma mönster som lib/jarvis/monday-brief.ts:
 * `byggNextBestAction` är ren (allt via input, inget `new Date()`),
 * `genereraNextBestAction` gör hämtningen + modellanropet och kör den
 * rena funktionen. Facit: tests/next-best-action.spec.ts.
 *
 * Två spärrar MÅSTE klara innan modellen ens anropas — det är mekaniken
 * bakom "inga principer skrivna än ⇒ ingen påhittad rankning":
 *   1. Minst 2 konkurrerande kandidater (en ensam kandidat är redan
 *      otvetydig i den vanliga kön — "gör detta först" kräver en
 *      verklig konkurrent).
 *   2. Minst 1 aktiv priority_rule.
 * Endera saknas → inget skrivs, ingen "Gör detta först"-yta visas.
 *
 * Företagets omsättningsmål (next-best-action-goals.ts, backlog #11:s
 * kvarvarande steg) hämtas EFTER båda spärrarna klarat sig — en
 * målkontext gör aldrig att en rankning skrivs när principer saknas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { svDateStr } from '@/lib/dates'
import { arTestdataApproval } from '@/lib/testdata'
import {
  NEXT_BEST_ACTION_APPROVAL_TYPES,
  enrichAndNormalize,
  type NormalizedCandidate,
  type RawCandidateRow,
} from './next-best-action-normalize'
import { callNextBestActionModel, NEXT_BEST_ACTION_MODEL, type NextBestActionModelOutput } from './next-best-action-prompt'
import { getGoalContext } from './next-best-action-goals'
import { HUSREGLER } from './husregler'

const MIN_CANDIDATES = 2
const MIN_PRINCIPLES = 1

export interface RankedCandidateRow {
  approval_id: string
  approval_type: string
  financial_impact_kr: number | null
  financial_impact_kind: 'KÄNT' | 'UPPSKATTAT' | null
  urgency_note: string | null
  rationale: string
}

export interface NextBestAction {
  id: string
  business_id: string
  computed_date: string
  top_approval_id: string
  reasoning: string
  principles_applied: string[]
  /**
   * Vilka principer som faktiskt gällde den här dagen: kontots egna
   * (business_knowledge, priority_rule) eller husreglerna
   * (lib/jarvis/husregler.ts) som standard-fallback när kontot saknar
   * egna. ALDRIG bådadera — se genereraNextBestAction. Sparas i den
   * insatta radens principles_applied-kolumn (jsonb) tillsammans med
   * citaten, så källan syns i efterhand utan egen kolumn/migration.
   */
  principles_source: 'husregler' | 'kontot'
  ranked_candidates: RankedCandidateRow[]
  candidate_count: number
  model: string
}

/** Deterministisk primärnyckel — dedupe sker via unik-constraint-insert, se insertNextBestAction. */
export function nextBestActionId(businessId: string, computedDate: string): string {
  return `nba_${businessId}_${computedDate}`
}

/**
 * Ren. Ingen I/O. Slår ihop de normaliserade kandidaterna med modellens
 * validerade svar till den sparbara raden. Kräver att `modelOutput` redan
 * är strikt validerad (lib/jarvis/next-best-action-prompt.ts
 * validateModelOutput) — den här funktionen litar på formen, den
 * omvaliderar inte.
 */
export function byggNextBestAction(input: {
  businessId: string
  computedDate: string
  candidates: NormalizedCandidate[]
  modelOutput: NextBestActionModelOutput
  /** Standard 'kontot' för bakåtkompatibilitet med anrop som inte bryr sig. */
  principlesSource?: 'husregler' | 'kontot'
}): NextBestAction {
  const { businessId, computedDate, candidates, modelOutput, principlesSource = 'kontot' } = input
  const byId = new Map(candidates.map(c => [c.approval_id, c]))

  const ranked_candidates: RankedCandidateRow[] = modelOutput.ranked.map(r => {
    const c = byId.get(r.approval_id)
    return {
      approval_id: r.approval_id,
      approval_type: c?.approval_type || 'okänd',
      financial_impact_kr: c?.financial_impact_kr ?? null,
      financial_impact_kind: c?.financial_impact_kind ?? null,
      urgency_note: c?.urgency_note ?? null,
      rationale: r.rationale,
    }
  })

  return {
    id: nextBestActionId(businessId, computedDate),
    business_id: businessId,
    computed_date: computedDate,
    top_approval_id: modelOutput.top_pick_approval_id,
    reasoning: modelOutput.reasoning,
    principles_applied: modelOutput.principles_applied,
    principles_source: principlesSource,
    ranked_candidates,
    candidate_count: candidates.length,
    model: NEXT_BEST_ACTION_MODEL,
  }
}

export interface GenerateResult {
  status: 'inserted' | 'duplicate' | 'skipped_too_few_candidates' | 'skipped_no_principles' | 'skipped_model_failed'
}

/**
 * IO: hämtar allt Next Best Action behöver för ETT företag, kör
 * spärrarna, anropar modellen, bygger raden och infogar. Kastar ALDRIG
 * ut ur spärrarna — en spärr som inte klarar sig är ett giltigt,
 * förväntat utfall (`skipped_*`), inte ett fel.
 */
export async function genereraNextBestAction(supabase: SupabaseClient, businessId: string): Promise<GenerateResult> {
  const computedDate = svDateStr()

  const { data: approvalRows, error: approvalErr } = await supabase
    .from('pending_approvals')
    .select('id, approval_type, title, description, created_at, payload')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .in('approval_type', NEXT_BEST_ACTION_APPROVAL_TYPES)
  if (approvalErr) throw new Error(`pending_approvals-uppslag misslyckades: ${approvalErr.message}`)

  const realRows = (approvalRows || []).filter(r => !arTestdataApproval(r))
  if (realRows.length < MIN_CANDIDATES) return { status: 'skipped_too_few_candidates' }

  const { data: principleRows, error: principleErr } = await supabase
    .from('business_knowledge')
    .select('observation')
    .eq('business_id', businessId)
    .eq('knowledge_type', 'priority_rule')
    .is('dismissed_at', null)
  if (principleErr) throw new Error(`business_knowledge (priority_rule)-uppslag misslyckades: ${principleErr.message}`)

  const accountPrinciples = (principleRows || []).map(r => r.observation as string).filter(Boolean)

  // Husregler som standard (2026-09-04, tasks/plan-autopilot-D-nba.md):
  // inget betalande konto har någonsin skrivit en egen priority_rule, så
  // spärren nedan slog till för ALLA — next_best_action fick noll rader,
  // någonsin. Kontots egna principer gäller om de finns, annars
  // husreglerna (lib/jarvis/husregler.ts) — ALDRIG bådadera samtidigt.
  // Spärren nedan finns kvar oförändrad; den kan bara aldrig slå till
  // längre eftersom listan aldrig är tom när husreglerna räknas in.
  const principlesSource: 'husregler' | 'kontot' = accountPrinciples.length > 0 ? 'kontot' : 'husregler'
  const principles = principlesSource === 'kontot' ? accountPrinciples : HUSREGLER
  if (principles.length < MIN_PRINCIPLES) return { status: 'skipped_no_principles' }

  const nowIso = new Date().toISOString()
  const rawRows: RawCandidateRow[] = realRows.map(r => ({
    id: r.id,
    approval_type: r.approval_type,
    title: r.title,
    created_at: r.created_at,
    payload: r.payload,
  }))
  const candidates = await enrichAndNormalize(supabase, rawRows, nowIso)
  if (candidates.length < MIN_CANDIDATES) return { status: 'skipped_too_few_candidates' }

  const goalContext = await getGoalContext(supabase, businessId, new Date())
  const modelOutput = await callNextBestActionModel(candidates, principles, businessId, supabase, goalContext)
  if (!modelOutput) return { status: 'skipped_model_failed' }

  const nba = byggNextBestAction({ businessId, computedDate, candidates, modelOutput, principlesSource })
  return insertNextBestAction(supabase, nba)
}

/**
 * Infogar raden. Deterministisk id (`nba_{businessId}_{ÅÅÅÅ-MM-DD}`) gör
 * dubbel-körning för samma företag+dag ofarlig — unik-constraint-krocken
 * (23505) fångas här och rapporteras som 'duplicate', inte som ett fel.
 */
export async function insertNextBestAction(supabase: SupabaseClient, nba: NextBestAction): Promise<GenerateResult> {
  const { error } = await supabase.from('next_best_action').insert({
    id: nba.id,
    business_id: nba.business_id,
    computed_date: nba.computed_date,
    top_approval_id: nba.top_approval_id,
    reasoning: nba.reasoning,
    // principles_applied (jsonb) bär BÅDE citaten och källflaggan — ingen
    // egen kolumn/migration för principles_source (den finns inte i DB).
    // app/api/next-best-action/route.ts läser ut .citerat till UI:t.
    principles_applied: { source: nba.principles_source, citerat: nba.principles_applied },
    ranked_candidates: nba.ranked_candidates,
    candidate_count: nba.candidate_count,
    model: nba.model,
  })
  if (error) {
    if (error.code === '23505') return { status: 'duplicate' }
    throw new Error(`next_best_action insert misslyckades: ${error.message}`)
  }
  return { status: 'inserted' }
}
