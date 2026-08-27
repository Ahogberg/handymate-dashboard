/**
 * Aktiveringsmått ur befintliga tidsstämplar (Lager 3 / B8, 2026-08-27).
 *
 *   npx playwright test tests/activation-metrics.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { computeActivation, formatActivation, type ActivationRow } from '../lib/admin/activation-metrics'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const biz = { created_at: '2026-08-20T08:00:00Z', onboarding_completed_at: '2026-08-20T10:00:00Z' }
const rad = (over: Partial<ActivationRow>): ActivationRow => ({
  approval_type: 'invoice_reminder',
  status: 'pending',
  created_at: '2026-08-20T12:00:00Z',
  resolved_at: null,
  outcome: null,
  ...over,
})

test('tid till första fynd, beslut, utförda och kvitto — ur raderna, i timmar från slutförd onboarding', () => {
  const m = computeActivation(
    [
      rad({ approval_type: 'team_intro', created_at: '2026-08-20T10:01:00Z', status: 'approved', resolved_at: '2026-08-20T10:05:00Z' }),
      rad({ created_at: '2026-08-20T12:00:00Z' }),
      rad({ approval_type: 'missad_intakt', created_at: '2026-08-20T13:00:00Z', status: 'approved', resolved_at: '2026-08-20T15:00:00Z', outcome: 'success' }),
      rad({ created_at: '2026-08-21T09:00:00Z', status: 'approved', resolved_at: '2026-08-21T10:00:00Z', outcome: 'success' }),
    ],
    biz,
  )
  expect(m.onboardingHours).toBe(2)
  expect(m.firstFindingH).toBe(2) // startkortet räknas inte
  expect(m.firstApprovalH).toBe(5)
  expect(m.firstExecutedH).toBe(5) // missad_intakt utförd — men ingen kvittotyp
  expect(m.firstReceiptH).toBe(24) // invoice_reminder dagen efter
})

test('utan slutförd onboarding: allt null utom onboardingHours; misslyckat utförande räknas aldrig som utfört', () => {
  expect(computeActivation([rad({})], { created_at: '2026-08-20T08:00:00Z', onboarding_completed_at: null })).toEqual({
    onboardingHours: null, firstFindingH: null, firstApprovalH: null, firstExecutedH: null, firstReceiptH: null,
  })
  const m = computeActivation([rad({ status: 'approved', resolved_at: '2026-08-20T12:00:00Z', outcome: 'failed' })], biz)
  expect(m.firstApprovalH).toBe(2)
  expect(m.firstExecutedH).toBeNull()
})

test('etiketten säger — för det som inte hänt och minuter under en timme', () => {
  expect(formatActivation({ onboardingHours: 1, firstFindingH: 0.5, firstApprovalH: 5, firstExecutedH: null, firstReceiptH: null }))
    .toBe('fynd 30 min · beslut 5 h · utfört — · kvitto —')
})

test('admin-rutten räknar måtten ur pending_approvals och tål läsfel', () => {
  const s = kod('app/api/admin/pilots/route.ts')
  expect(s).toContain("outcome:payload->execution_result->>outcome")
  expect(s).toContain(".neq('approval_type', 'team_intro')")
  expect(s).toContain('activation: computeActivation(')
  expect(s).toContain('måtten utelämnas')
})
