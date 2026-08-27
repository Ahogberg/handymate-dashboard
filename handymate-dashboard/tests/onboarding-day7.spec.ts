/**
 * Dag-7-mailet bär ett riktigt nästa steg (Lager 3 / B9, 2026-08-27).
 *
 *   npx playwright test tests/onboarding-day7.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { chooseDay7Candidate, day7Href, type Day7CandidateRow } from '../lib/onboarding/day7-next-action'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const rad = (over: Partial<Day7CandidateRow>): Day7CandidateRow => ({
  id: 'a1',
  approval_type: 'invoice_reminder',
  title: 'Skicka påminnelse för faktura 2026-001',
  status: 'pending',
  created_at: '2026-08-20T08:00:00Z',
  payload: {},
  ...over,
})

test.describe('chooseDay7Candidate — ren väljare', () => {
  test('Mattes rankade topp-kort vinner när det fortfarande väntar', () => {
    const rows = [rad({ id: 'gammal', created_at: '2026-08-18T08:00:00Z' }), rad({ id: 'nba', created_at: '2026-08-21T08:00:00Z' })]
    expect(chooseDay7Candidate(rows, 'nba')?.approvalId).toBe('nba')
  })

  test('utan rankning: äldsta väntande, exekverbara typer före review-kort', () => {
    const rows = [
      rad({ id: 'review_gammal', approval_type: 'missad_intakt', title: 'Missad intäkt', created_at: '2026-08-15T08:00:00Z' }),
      rad({ id: 'exec_ny', created_at: '2026-08-21T08:00:00Z' }),
      rad({ id: 'exec_gammal', created_at: '2026-08-19T08:00:00Z' }),
    ]
    expect(chooseDay7Candidate(rows, null)?.approvalId).toBe('exec_gammal')
  })

  test('startkort, lösta kort, testdata och tomma titlar räknas aldrig', () => {
    const rows = [
      rad({ id: 'intro', approval_type: 'team_intro', title: 'Jag vaktar din telefon nu' }),
      rad({ id: 'lost', status: 'approved' }),
      rad({ id: 'test', title: 'E2E Testkund påminnelse' }),
      rad({ id: 'testid', payload: { invoice_id: 'e2e_inv_1' } }),
      rad({ id: 'tom', title: '  ' }),
    ]
    expect(chooseDay7Candidate(rows, null)).toBeNull()
    // Ett rankat id som inte längre väntar faller tillbaka på kön
    expect(chooseDay7Candidate([rad({ id: 'kvar' })], 'lost')?.approvalId).toBe('kvar')
  })

  test('länken går rakt till kortet på godkännandesidan (ankaret finns)', () => {
    expect(day7Href('appr_1')).toBe('/dashboard/approvals#approval-appr_1')
    expect(kod('app/dashboard/approvals/page.tsx')).toContain('id={`approval-${approval.id}`}')
  })
})

test.describe('cronen', () => {
  const cron = kod('app/api/cron/onboarding-followup/route.ts')

  test('fönstret räknas från onboarding_completed_at med created_at som fallback', () => {
    expect(cron).toContain('and(onboarding_completed_at.gte.${from},onboarding_completed_at.lt.${to})')
    expect(cron).toContain('and(onboarding_completed_at.is.null,created_at.gte.${from},created_at.lt.${to})')
  })

  test('nästa steg hämtas per konto, utelämnas vid null/fel, och mailet går ändå', () => {
    expect(cron).toContain('const nextAction = await pickDay7NextAction(supabase, biz.business_id).catch(() => null)')
    expect(cron).toContain('buildDay7EmailHtml(firstName, value, nextAction)')
    const block = cron.slice(cron.indexOf('const nextStepHtml = nextAction'), cron.indexOf("    : ''"))
    expect(block).toContain('Nästa bästa steg')
    expect(block).toContain('${appUrl}${nextAction.href}')
    expect(block).toContain('escapeHtml(nextAction.title)')
    expect(cron).toContain('${nextStepHtml}')
  })
})
