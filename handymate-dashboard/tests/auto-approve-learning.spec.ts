/**
 * VÅG 1a (value-chain-plan.md) — edited-count-buggen i
 * lib/auto-approve-learning.ts: den gamla koden läste
 * learning_events.context?.approval_type, en kolumn som inte finns
 * (se sql/v5_learning_events.sql). editedApprovalIds blev alltid tom →
 * edited_count alltid 0 → no_edit_rate = acceptance_rate → redigerade
 * förslag räknades som rena godkännanden och blåste upp
 * confidence-boosten för förtjänad autonomi (säkerhetsbugg).
 *
 * Facit-tester på den extraherade rena kärnan computeApprovalStats,
 * som nu bygger edited_count från reference_id (pending_approvals.id,
 * TEXT) på 'approval_edited'-rader i learning_events — inga mockar
 * behövs.
 *
 * Körs: npx playwright test tests/auto-approve-learning.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { computeApprovalStats, type ResolvedApprovalRow } from '../lib/auto-approve-learning'

test.describe('computeApprovalStats', () => {
  test('tom input → säkra defaults (ingen boost möjlig)', () => {
    const stats = computeApprovalStats([], new Set())
    expect(stats.total_resolved).toBe(0)
    expect(stats.edited_count).toBe(0)
    expect(stats.acceptance_rate).toBe(0)
    expect(stats.no_edit_rate).toBe(0)
  })

  test('enbart rena godkännanden (inga redigerade) → no_edit_rate = acceptance_rate', () => {
    const approvals: ResolvedApprovalRow[] = [
      { id: 'appr_1', status: 'approved' },
      { id: 'appr_2', status: 'approved' },
      { id: 'appr_3', status: 'approved' },
      { id: 'appr_4', status: 'rejected' },
    ]
    const stats = computeApprovalStats(approvals, new Set())
    expect(stats.total_resolved).toBe(4)
    expect(stats.approved_count).toBe(3)
    expect(stats.edited_count).toBe(0)
    expect(stats.approved_without_edit).toBe(3)
    expect(stats.acceptance_rate).toBe(3 / 4)
    expect(stats.no_edit_rate).toBe(stats.acceptance_rate)
  })

  test('en redigerad approval sänker no_edit_rate under acceptance_rate', () => {
    const approvals: ResolvedApprovalRow[] = [
      { id: 'appr_1', status: 'approved' },
      { id: 'appr_2', status: 'approved' }, // redigerad innan godkännande
      { id: 'appr_3', status: 'approved' },
      { id: 'appr_4', status: 'rejected' },
    ]
    const editedApprovalIds = new Set(['appr_2'])
    const stats = computeApprovalStats(approvals, editedApprovalIds)
    expect(stats.approved_count).toBe(3)
    expect(stats.edited_count).toBe(1)
    expect(stats.approved_without_edit).toBe(2)
    expect(stats.acceptance_rate).toBe(3 / 4)
    expect(stats.no_edit_rate).toBe(2 / 4)
    expect(stats.no_edit_rate).toBeLessThan(stats.acceptance_rate)
  })

  test('alla godkända redigerade → no_edit_rate = 0 trots 100% acceptance_rate', () => {
    const approvals: ResolvedApprovalRow[] = [
      { id: 'appr_1', status: 'approved' },
      { id: 'appr_2', status: 'auto_approved' },
    ]
    const editedApprovalIds = new Set(['appr_1', 'appr_2'])
    const stats = computeApprovalStats(approvals, editedApprovalIds)
    expect(stats.acceptance_rate).toBe(1)
    expect(stats.no_edit_rate).toBe(0)
  })

  test('edited-id som inte finns bland approvals (annan approval_type) påverkar inte statistiken', () => {
    const approvals: ResolvedApprovalRow[] = [
      { id: 'appr_1', status: 'approved' },
      { id: 'appr_2', status: 'approved' },
    ]
    // appr_99 tillhör en annan approval_type — ska ignoreras eftersom
    // approvals-listan redan är typ-filtrerad av anroparen.
    const editedApprovalIds = new Set(['appr_99'])
    const stats = computeApprovalStats(approvals, editedApprovalIds)
    expect(stats.edited_count).toBe(0)
    expect(stats.no_edit_rate).toBe(1)
  })

  test('auto_approved räknas som godkänt för acceptance_rate och consecutive-räkning', () => {
    const approvals: ResolvedApprovalRow[] = [
      { id: 'appr_1', status: 'auto_approved' },
      { id: 'appr_2', status: 'approved' },
      { id: 'appr_3', status: 'rejected' },
    ]
    const stats = computeApprovalStats(approvals, new Set())
    expect(stats.approved_count).toBe(2)
    expect(stats.consecutive_approvals).toBe(2)
  })

  test('konsekutiva avvisningar i rad ger negativt consecutive_approvals', () => {
    const approvals: ResolvedApprovalRow[] = [
      { id: 'appr_1', status: 'rejected' },
      { id: 'appr_2', status: 'rejected' },
      { id: 'appr_3', status: 'rejected' },
      { id: 'appr_4', status: 'approved' },
    ]
    const stats = computeApprovalStats(approvals, new Set())
    expect(stats.consecutive_approvals).toBe(-3)
  })
})
