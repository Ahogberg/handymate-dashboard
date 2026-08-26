/**
 * "Nästa att göra" för ett projekt — REN härledning (2026-08-26, Del C).
 *
 * Fanns tidigare bara inline i app/dashboard/projects/[id]/page.tsx (todoMode)
 * och kunde inte återanvändas i projektlistan. Nu EN beräkning, två ytor:
 * listan visar det översta ärendet per rad, detaljsidan visar allt.
 *
 * Prioritet:
 *   1. Ett väntande godkännandekort med payload.project_id (Lars/Karin/Hanna …)
 *      — högst risk_level först, sedan äldst. Det är en konkret sak som väntar
 *      på ägaren och slår alltid en härledd primäråtgärd.
 *   2. Annars den härledda primäråtgärden (TODO_PRIMARY_LABEL[mode]):
 *      över budget → "Skapa ÄTA"; klart men ofakturerat → "Godkänn & skicka";
 *      planering utan arbete → "Boka första besök"; annars "Rapportera tid".
 *
 * Dedup-regeln (jfr lib/jarvis/project-case.ts): listan säger EN sak per
 * projekt; detaljsidan är den enda ytan som listar alla kort.
 */

import { getSystemStage } from '@/lib/project-stages/stages'
import { agentForApproval, typeLabel } from '@/lib/jarvis/approval-view'

export type TodoMode = 'nystartat' | 'pagaende' | 'klart_ofakturerat' | 'over_budget'

export const TODO_PRIMARY_LABEL: Record<TodoMode, string> = {
  nystartat: 'Boka första besök',
  pagaende: 'Rapportera tid',
  klart_ofakturerat: 'Godkänn & skicka',
  over_budget: 'Skapa ÄTA',
}

export type StageBucket = 'planering' | 'pagaende' | 'klart'

/** Steg → grov fas. null/okänt steg = planering (inget arbete är bevisat). */
export function getStageBucket(stageId: string | null | undefined): StageBucket {
  const pos = getSystemStage(stageId)?.position ?? 1
  if (pos <= 2) return 'planering'
  if (pos <= 4) return 'pagaende'
  return 'klart'
}

export interface TodoModeInput {
  stageId: string | null | undefined
  isOverBudget: boolean
  canSeeFinancials: boolean
  /** Det finns utfört, ännu ofakturerat arbete (timmar/kr). */
  hasUninvoicedWork: boolean
  /** Inga timmar och inget material registrerat. */
  noWorkYet: boolean
}

export function deriveTodoMode(i: TodoModeInput): TodoMode {
  const bucket = getStageBucket(i.stageId)
  if (i.isOverBudget) return 'over_budget'
  if (bucket === 'klart' && i.canSeeFinancials && i.hasUninvoicedWork) return 'klart_ofakturerat'
  if (bucket === 'planering' && i.noWorkYet) return 'nystartat'
  return 'pagaende'
}

export interface PendingCardLike {
  id: string
  approval_type: string
  risk_level?: string | null
  created_at?: string | null
  title?: string | null
  payload?: Record<string, unknown> | null
}

export interface ProjectNextTodo {
  mode: TodoMode
  /** Det som ska stå på raden: kortets titel/typ, annars primäråtgärden. */
  label: string
  source: 'card' | 'derived'
  /** Agentnyckel ('lars' | 'karin' | …) när det är ett kort, annars null. */
  agent: string | null
  approval_id: string | null
  approval_type: string | null
  pending_count: number
}

const RISK_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

/** Högst risk först, sedan äldst — deterministiskt. */
export function pickTopCard<T extends PendingCardLike>(cards: T[]): T | null {
  if (!cards.length) return null
  return [...cards].sort((a, b) => {
    const ra = RISK_RANK[a.risk_level || 'low'] ?? 2
    const rb = RISK_RANK[b.risk_level || 'low'] ?? 2
    if (ra !== rb) return ra - rb
    return (a.created_at || '').localeCompare(b.created_at || '')
  })[0]
}

export function deriveProjectTodo(input: TodoModeInput & { pending?: PendingCardLike[] }): ProjectNextTodo {
  const mode = deriveTodoMode(input)
  const pending = input.pending || []
  const top = pickTopCard(pending)
  if (top) {
    return {
      mode,
      label: (top.title && top.title.trim()) || typeLabel(top.approval_type),
      source: 'card',
      agent: agentForApproval(top),
      approval_id: top.id,
      approval_type: top.approval_type,
      pending_count: pending.length,
    }
  }
  return {
    mode,
    label: TODO_PRIMARY_LABEL[mode],
    source: 'derived',
    agent: null,
    approval_id: null,
    approval_type: null,
    pending_count: 0,
  }
}
