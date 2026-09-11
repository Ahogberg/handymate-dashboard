import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { reviewGroup } from '../lib/approvals/review-group'
import { historyStatus } from '../lib/approvals/history-status'
import { signatureLabel } from '../lib/quotes/signature-label'

test('cancelled first review never starts the second review', async () => {
  const calls: number[] = []
  await reviewGroup([1, 2], async item => { calls.push(item); return undefined })
  expect(calls).toEqual([1])
})

test('group preserves completed items and stops on cancellation or failure', async () => {
  const calls: number[] = []
  await reviewGroup([1, 2, 3], async item => { calls.push(item); return item === 1 })
  expect(calls).toEqual([1, 2])
  const complete: number[] = []
  await reviewGroup([1, 2], async item => { complete.push(item); return true })
  expect(complete).toEqual([1, 2])
})

test('failed and partial decisions are attention states, never green success', () => {
  for (const status of ['approved', 'auto_approved']) {
    for (const execution of [{ outcome: 'failed' }, { outcome: 'retrying' }, { outcome: 'success', receipt: { state: 'partial' } }]) {
      expect(historyStatus({ status, approval_type: 'checklist', payload: { execution_result: execution } }))
        .toEqual({ label: 'Behöver följas upp', className: 'bg-amber-50 text-amber-800' })
    }
    expect(historyStatus({ status, approval_type: 'send_sms' }).className).not.toContain('green')
  }
})

test('draft or closed quote never claims it is waiting for signature just because it has a link', () => {
  for (const status of ['draft', 'rejected', 'expired', 'accepted']) {
    expect(signatureLabel({ status, sent_at: '2026-09-01' }).title).toBe('Signeringslänk skapad')
  }
  expect(signatureLabel({ status: 'sent' }).title).toBe('Signeringslänk skapad')
  expect(signatureLabel({ status: 'sent', sent_at: '2026-09-01' }).title).toBe('Väntar på signering')
})

test('actual UI surfaces use the regression-tested helpers', () => {
  const home = readFileSync('components/jarvis/JarvisHome.tsx', 'utf8')
  expect(home).toContain('void reviewGroup(medlemmar, item => executeSend(item, action, editedText))')
  const history = readFileSync('app/dashboard/approvals/page.tsx', 'utf8')
  expect(history.match(/historyStatus\(approval\)\.label/g)).toHaveLength(2)
  const signature = readFileSync('app/dashboard/quotes/[id]/components/QuoteSignatureCard.tsx', 'utf8')
  expect(signature).toContain('const label = signatureLabel(quote)')
})
