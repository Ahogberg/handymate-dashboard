import { test, expect } from '@playwright/test'
import { autonomyDigest } from '../lib/notifications/autonomy-digest'
import {
  pickMorningDecisions,
  expirySummary,
} from '../lib/notifications/morning-decisions'
import {
  autonomyOffToken,
  verifyAutonomyOffToken,
} from '../lib/autonomy/off-token'
test('morning has three oldest decisions; money breaks ties, expiry names at most three', () => {
  expect(
    pickMorningDecisions([
      { id: '1', title: 'a', created_at: '2026-01-01', amount_kr: 1 },
      { id: '2', title: 'b', created_at: '2026-01-01', amount_kr: 20 },
      { id: '3', title: 'c', created_at: '2026-02-01' },
      { id: '4', title: 'd', created_at: '2026-03-01' },
    ]).map((x) => x.id),
  ).toEqual(['2', '1', '3'])
  expect(
    expirySummary(
      [1, 2, 3, 4].map((n) => ({ kind: 'expired', title: `Förslag ${n}` })),
    ),
  ).toBe('4 förslag fick inget svar: Förslag 1 · Förslag 2 · Förslag 3')
})
test('supervised lists each result; earned counts successes without hiding unknown outcomes', () => {
  const line = (mode: string, outcome: string, title: string) => ({
    kind: 'autonomy',
    autonomy_key: 'invoice_reminder',
    mode,
    outcome,
    title,
  })
  const result = autonomyDigest([
    line('supervised', 'success', 'A'),
    line('supervised', 'failed', 'B'),
    line('earned', 'success', 'C'),
    line('earned', 'success', 'D'),
    line('earned', 'unknown', 'E'),
  ])
  expect(result).toEqual([
    'Karin: A — skickat.',
    'Karin: B — misslyckades.',
    'Karin: E — utfallet är inte bekräftat.',
    'Karin: 2 fakturapåminnelser skickade.',
  ])
})
test('off token binds tenant/key/purpose/expiry and rejects tampering', () => {
  const original = process.env.AUTONOMY_OFF_SECRET
  process.env.AUTONOMY_OFF_SECRET = 'test-only-secret'
  try {
    const token = autonomyOffToken('a', 'booking_reminder', 1000)!
    expect(verifyAutonomyOffToken(token, 1001)).toEqual({
      businessId: 'a',
      key: 'booking_reminder',
    })
    expect(verifyAutonomyOffToken(token, 1000 + 8 * 86400000)).toBeNull()
    expect(verifyAutonomyOffToken(token + 'x', 1001)).toBeNull()
  } finally {
    if (original === undefined) delete process.env.AUTONOMY_OFF_SECRET
    else process.env.AUTONOMY_OFF_SECRET = original
  }
})
