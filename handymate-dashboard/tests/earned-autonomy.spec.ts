/**
 * Förtjänad autonomi — enhetstester för de rena funktionerna
 * (deriveAutonomyKey, autonomyKeyFromApproval, computeStreakFromRows).
 * Körs: npx playwright test tests/earned-autonomy.spec.ts --no-deps
 * (samma mönster som tests/skv-rot-rut.spec.ts — inga browser/server-beroenden)
 */
import { test, expect } from '@playwright/test'
import {
  deriveAutonomyKey,
  autonomyKeyFromApproval,
  computeStreakFromRows,
  STREAK_TARGET,
  type ResolvedApprovalRow,
} from '../lib/autonomy/earned-autonomy'

function row(over: Partial<ResolvedApprovalRow>): ResolvedApprovalRow {
  return {
    approval_type: 'automation',
    status: 'approved',
    payload: { autonomy_key: 'invoice_reminder' },
    created_at: new Date().toISOString(),
    ...over,
  }
}

test.describe('deriveAutonomyKey', () => {
  test('mappar de tre motor-signaturerna', () => {
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'invoice', field: 'days_overdue' } })).toBe('invoice_reminder')
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'booking', field: 'hours_until' } })).toBe('booking_reminder')
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'quote', field: 'days_since_sent' } })).toBe('quote_followup_sms')
  })
  test('returnerar null för allt utanför allowlisten', () => {
    expect(deriveAutonomyKey({ trigger_type: 'event', action_type: 'send_sms', trigger_config: { event_name: 'call_missed' } })).toBeNull()
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_email', trigger_config: { entity: 'invoice', field: 'days_overdue' } })).toBeNull()
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'customer', field: 'months_since_last_job' } })).toBeNull()
  })
})

test.describe('autonomyKeyFromApproval', () => {
  test('review_request mappar via approval_type (historik räknas)', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'review_request', payload: null })).toBe('review_request')
  })
  test('automation mappar via payload.autonomy_key', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'automation', payload: { autonomy_key: 'booking_reminder' } })).toBe('booking_reminder')
  })
  test('automation utan autonomy_key → null (äldre rader)', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'automation', payload: { rule_id: 'x' } })).toBeNull()
  })
  test('okänd nyckel i payload → null (aldrig utanför allowlist)', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'automation', payload: { autonomy_key: 'send_invoice' } })).toBeNull()
    expect(autonomyKeyFromApproval({ approval_type: 'proactive_care', payload: {} })).toBeNull()
  })
})

test.describe('computeStreakFromRows (rader sorterade NYAST först)', () => {
  test('räknar raka godkännanden av nyckeln', () => {
    const rows = [row({}), row({}), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(3)
  })
  test('avvisning av samma nyckel stoppar (nollar) streaken', () => {
    const rows = [row({}), row({ status: 'rejected' }), row({}), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(1)
  })
  test('andra nycklar mitt i påverkar inte', () => {
    const rows = [
      row({}),
      row({ approval_type: 'review_request', payload: null, status: 'rejected' }),
      row({}),
    ]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(2)
  })
  test('rader utan nyckel (äldre automation) hoppas över', () => {
    const rows = [row({}), row({ payload: { rule_id: 'x' } }), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(2)
  })
  test('pending/expired är inte beslut — hoppas över', () => {
    const rows = [row({}), row({ status: 'pending' }), row({ status: 'expired' }), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(2)
  })
  test('redigerade godkännanden hoppas över (räknas ej, nollar ej)', () => {
    const rows = [row({}), row({ payload: { autonomy_key: 'invoice_reminder', edited: true } }), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(2)
  })
  test('tom lista → 0', () => {
    expect(computeStreakFromRows([], 'review_request')).toBe(0)
  })
  test('STREAK_TARGET är 15', () => {
    expect(STREAK_TARGET).toBe(15)
  })
})
