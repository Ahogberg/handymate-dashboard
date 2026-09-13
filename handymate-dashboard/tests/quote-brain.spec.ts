import { test, expect } from '@playwright/test'
import { latestQuoteFollowupReceipt, quoteFollowupApprovalId, type QuoteFollowupRound } from '../lib/quotes/followup-round'
import { deriveQuoteHandoff, type HandoffInput } from '../lib/quotes/handoff'

const businessId = 'b1'
const sentAt = '2026-09-01T08:00:00.000Z'
const scopes: QuoteFollowupRound[] = [
  { quote_id: 'q1', sent_at: sentAt, round: 1, channel: 'sms' },
  { quote_id: 'q1', sent_at: sentAt, round: 2, channel: 'email' },
  { quote_id: 'q1', sent_at: sentAt, round: 3, channel: 'sms' },
]

function card(scope: QuoteFollowupRound, executedAt: string, id = quoteFollowupApprovalId(businessId, scope)) {
  return { id, status: 'approved', payload: {
    quote_followup_round: scope,
    execution_result: { outcome: 'success', executed_at: executedAt, artifacts: {
      [scope.channel === 'sms' ? 'sms_id' : 'message_id']: `provider-${scope.round}`,
    } },
  } }
}

test('läser högst tre deterministiska omgångar och väljer senaste giltiga sändkvittot', () => {
  const latest = latestQuoteFollowupReceipt([
    card(scopes[0], '2026-09-05T10:00:00Z'),
    card(scopes[1], '2026-09-08T10:00:00Z'),
    card(scopes[2], '2026-09-07T10:00:00Z'),
  ], scopes, businessId, Date.parse('2026-09-10T10:00:00Z'))
  expect(latest).toMatchObject({ round: 2, channel: 'email', artifactId: 'provider-2' })
})

test('framtida, före sent_at och icke-deterministiska kort blir aldrig kvitto', () => {
  expect(latestQuoteFollowupReceipt([
    card(scopes[0], '2026-08-31T10:00:00Z'),
    card(scopes[1], '2026-09-11T10:00:00Z'),
    card(scopes[2], '2026-09-07T10:00:00Z', 'annan-identitet'),
  ], scopes, businessId, Date.parse('2026-09-10T10:00:00Z'))).toBeNull()
})

for (const status of ['pending', 'failed', 'skipped']) test(`${status} eller saknat provider-id blir aldrig sändkvittens`, () => {
  const candidate = card(scopes[0], '2026-09-05T10:00:00Z')
  candidate.status = status
  expect(latestQuoteFollowupReceipt([candidate], scopes, businessId, Date.parse('2026-09-10T10:00:00Z'))).toBeNull()
  candidate.status = 'approved'
  candidate.payload.execution_result.artifacts = {}
  expect(latestQuoteFollowupReceipt([candidate], scopes, businessId, Date.parse('2026-09-10T10:00:00Z'))).toBeNull()
})

test('ny sent_at skapar andra deterministiska identiteter och återanvänder inte gammalt kvitto', () => {
  const newScopes = scopes.map(scope => ({ ...scope, sent_at: '2026-09-09T08:00:00.000Z' }))
  expect(latestQuoteFollowupReceipt([card(scopes[0], '2026-09-05T10:00:00Z')], newScopes, businessId, Date.parse('2026-09-10T10:00:00Z'))).toBeNull()
})

test('ett sparat kvitto överlever reconcile och ändrar inte accepterad stopprubrik', () => {
  const receipt = latestQuoteFollowupReceipt([card(scopes[0], '2026-09-05T10:00:00Z')], scopes, businessId, Date.parse('2026-09-10T10:00:00Z'))
  const input: HandoffInput = {
    quote: { status: 'accepted', sent_at: sentAt, valid_until: '2026-10-01', follow_up_count: 1 },
    paused: false, teamActive: true, hasPhone: true, hasEmail: true, latestReceipt: receipt,
    rules: [], logs: [], pendingId: null, intervalDays: 5, today: '2026-09-10', now: Date.parse('2026-09-10T10:00:00Z'),
  }
  expect(deriveQuoteHandoff(input).headline).toBe('Kunden har accepterat offerten')
  expect(receipt?.round).toBe(1)
})
