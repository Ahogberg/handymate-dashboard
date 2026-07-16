/**
 * TD-52 (Andreas-beslut 2026-07-15) — beslutstabellen för agentens
 * send_sms/send_email-godkännande-gate.
 * Körs: npx playwright test tests/td52-gating.spec.ts --no-deps
 *
 * shouldQueueForApproval() är den enda platsen beslutet fattas — låst här
 * så att produktlöftet ("allt agent-utskick går via ditt godkännande eller
 * förtjänat förtroende") inte kan glida isär från koden av misstag.
 */
import { test, expect } from '@playwright/test'
import { shouldQueueForApproval } from '../lib/autonomy/agent-gating'

test.describe('shouldQueueForApproval', () => {
  test('system-triggerad + INTE beviljad autonomi → köa (true)', () => {
    expect(shouldQueueForApproval('system', false)).toBe(true)
  })

  test('system-triggerad + beviljad autonomi → skicka direkt (false)', () => {
    expect(shouldQueueForApproval('system', true)).toBe(false)
  })

  test('user-triggerad (utan beviljad autonomi) → skicka direkt (false)', () => {
    expect(shouldQueueForApproval('user', false)).toBe(false)
  })

  test('user-triggerad (med beviljad autonomi) → skicka direkt (false) — autonomi är irrelevant för user', () => {
    expect(shouldQueueForApproval('user', true)).toBe(false)
  })
})
