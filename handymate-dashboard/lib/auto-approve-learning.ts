/**
 * Auto-Approval Learning Engine
 *
 * Analyserar approval-historik och returnerar en confidence-boost.
 * Anropas när en ny approval skapas för att avgöra om den kan auto-godkännas.
 *
 * Regler:
 * - 5+ godkännanden med 90%+ no-edit rate → +20 boost
 * - 10+ godkännanden med 95%+ no-edit rate → +30 boost
 * - 3+ avvisningar i rad → -50 boost
 * - Aldrig boost för: send_quote, send_invoice, autopilot_package
 */

import { getServerSupabase } from '@/lib/supabase'

// Typer som ALDRIG får confidence-boost — för högt affärsvärde
const NEVER_BOOST_TYPES = [
  'send_quote',
  'send_invoice',
  'autopilot_package',
  'seasonal_campaign',
]

export interface ApprovalStats {
  total_resolved: number
  approved_count: number
  approved_without_edit: number
  rejected_count: number
  edited_count: number
  consecutive_approvals: number
  acceptance_rate: number
  no_edit_rate: number
}

export interface LearnedConfidence {
  boost: number
  reason: string
  stats: ApprovalStats
}

export interface LearnedPattern {
  approval_type: string
  stats: ApprovalStats
  current_boost: number
  would_auto_approve: boolean
  reason: string
}

/**
 * Analyserar historik och returnerar confidence-boost för en approval-typ.
 */
export async function getLearnedConfidence(
  businessId: string,
  approvalType: string
): Promise<LearnedConfidence> {
  // Aldrig boost för högrisk-typer
  if (NEVER_BOOST_TYPES.includes(approvalType)) {
    return {
      boost: 0,
      reason: `${approvalType} får aldrig auto-boost — kräver alltid granskning`,
      stats: emptyStats(),
    }
  }

  const stats = await getApprovalStats(businessId, approvalType)

  if (stats.total_resolved === 0) {
    return { boost: 0, reason: 'Ingen historik ännu', stats }
  }

  // Negativt mönster: 3+ avvisningar i rad
  if (stats.consecutive_approvals < 0 && Math.abs(stats.consecutive_approvals) >= 3) {
    return {
      boost: -50,
      reason: `${Math.abs(stats.consecutive_approvals)} avvisningar i rad — sänker confidence`,
      stats,
    }
  }

  // Starkt mönster: 10+ med 95%+ no-edit
  if (stats.total_resolved >= 10 && stats.no_edit_rate >= 0.95) {
    return {
      boost: 30,
      reason: `${Math.round(stats.no_edit_rate * 100)}% godkänns utan ändring (${stats.total_resolved} totalt) — hög tillit`,
      stats,
    }
  }

  // Bra mönster: 5+ med 90%+ no-edit
  if (stats.total_resolved >= 5 && stats.no_edit_rate >= 0.90) {
    return {
      boost: 20,
      reason: `${Math.round(stats.no_edit_rate * 100)}% godkänns utan ändring (${stats.total_resolved} totalt)`,
      stats,
    }
  }

  // Svagt mönster: under tröskel
  if (stats.total_resolved >= 5 && stats.no_edit_rate < 0.90) {
    return {
      boost: 0,
      reason: `Godkännandegrad ${Math.round(stats.no_edit_rate * 100)}% — under 90% gränsen`,
      stats,
    }
  }

  // För lite data
  return {
    boost: 0,
    reason: `Bara ${stats.total_resolved} godkännanden — behöver minst 5`,
    stats,
  }
}

/**
 * Hämta statistik för en approval-typ
 */
async function getApprovalStats(
  businessId: string,
  approvalType: string
): Promise<ApprovalStats> {
  const supabase = getServerSupabase()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  // Hämta resolved approvals
  const { data: approvals } = await supabase
    .from('pending_approvals')
    .select('id, status, resolved_at')
    .eq('business_id', businessId)
    .eq('approval_type', approvalType)
    .in('status', ['approved', 'rejected', 'auto_approved'])
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('resolved_at', { ascending: false })

  if (!approvals || approvals.length === 0) return emptyStats()

  // Hämta edit-events från learning_events
  const { data: editEvents } = await supabase
    .from('learning_events')
    .select('event_type, context')
    .eq('business_id', businessId)
    .eq('event_type', 'approval_edited')
    .gte('created_at', sixMonthsAgo.toISOString())

  // Filtrera edits som matchar denna approval_type
  const editedApprovalIds = new Set(
    (editEvents || [])
      .filter((e: any) => e.context?.approval_type === approvalType)
      .map((e: any) => e.context?.approval_id)
      .filter(Boolean)
  )

  const total = approvals.length
  const approved = approvals.filter(a => a.status === 'approved' || a.status === 'auto_approved').length
  const rejected = approvals.filter(a => a.status === 'rejected').length
  const edited = approvals.filter(a => editedApprovalIds.has(a.id)).length
  const approvedWithoutEdit = approved - edited

  // Räkna konsekutiva: positiv = godkännanden i rad, negativ = avvisningar i rad
  let consecutive = 0
  if (approvals.length > 0) {
    const firstStatus = approvals[0].status
    const isApproval = firstStatus === 'approved' || firstStatus === 'auto_approved'
    for (const a of approvals) {
      const thisIsApproval = a.status === 'approved' || a.status === 'auto_approved'
      if (thisIsApproval === isApproval) {
        consecutive += isApproval ? 1 : -1
      } else {
        break
      }
    }
  }

  return {
    total_resolved: total,
    approved_count: approved,
    approved_without_edit: Math.max(0, approvedWithoutEdit),
    rejected_count: rejected,
    edited_count: edited,
    consecutive_approvals: consecutive,
    acceptance_rate: total > 0 ? approved / total : 0,
    no_edit_rate: total > 0 ? Math.max(0, approvedWithoutEdit) / total : 0,
  }
}

/**
 * Hämta alla learned patterns för ett företag (för dashboard)
 */
export async function getAllLearnedPatterns(
  businessId: string
): Promise<LearnedPattern[]> {
  const supabase = getServerSupabase()

  // Hämta unika approval_types
  const { data: types } = await supabase
    .from('pending_approvals')
    .select('approval_type')
    .eq('business_id', businessId)
    .in('status', ['approved', 'rejected', 'auto_approved'])

  if (!types) return []

  const uniqueTypes = Array.from(new Set(types.map((t: any) => t.approval_type)))
  const patterns: LearnedPattern[] = []

  for (const type of uniqueTypes) {
    const learned = await getLearnedConfidence(businessId, type)
    patterns.push({
      approval_type: type,
      stats: learned.stats,
      current_boost: learned.boost,
      would_auto_approve: learned.boost >= 20,
      reason: learned.reason,
    })
  }

  return patterns.sort((a, b) => b.current_boost - a.current_boost)
}

function emptyStats(): ApprovalStats {
  return {
    total_resolved: 0,
    approved_count: 0,
    approved_without_edit: 0,
    rejected_count: 0,
    edited_count: 0,
    consecutive_approvals: 0,
    acceptance_rate: 0,
    no_edit_rate: 0,
  }
}
