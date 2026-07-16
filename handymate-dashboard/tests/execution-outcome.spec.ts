/**
 * Utfalls-klassificering för approval-exekvering (juli-audit, fix/exec-utfall).
 * Körs: npx playwright test tests/execution-outcome.spec.ts --no-deps
 *
 * classifyExecutionResult() speglar hur components/dashboard/PendingApprovalsBlock.tsx
 * redan idag läser execution-objektet i klienten — testerna säkerställer att
 * det som PERSISTERAS på pending_approvals-raden matchar det UI:t visar.
 */
import { test, expect } from '@playwright/test'
import { classifyExecutionResult } from '../lib/approvals/execution-outcome'

test.describe('classifyExecutionResult', () => {
  test('error-sträng → failed, error_text = strängen', () => {
    const r = classifyExecutionResult({ action: 'send_quote', error: 'Fortnox-fel' })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('Fortnox-fel')
  })

  test('ok:false → failed', () => {
    const r = classifyExecutionResult({ action: 'create_booking', ok: false })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('Handlingen kunde inte utföras')
  })

  test('sms_sent:false → failed', () => {
    const r = classifyExecutionResult({ action: 'send_sms', sms_sent: false })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('Handlingen kunde inte utföras')
  })

  test("reason:'four_eyes_required' → failed med svensk text", () => {
    const r = classifyExecutionResult({ action: 'send_invoice', reason: 'four_eyes_required' })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('Kräver ny granskning')
  })

  test("reason:'permission_denied' → failed med svensk text", () => {
    const r = classifyExecutionResult({ action: 'send_quote', reason: 'permission_denied' })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('Saknar behörighet')
  })

  test("reason:'rate_limited' → failed med svensk text", () => {
    const r = classifyExecutionResult({ action: 'send_quote', reason: 'rate_limited' })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('För många försök')
  })

  test("reason:'fail' → failed med generisk svensk text", () => {
    const r = classifyExecutionResult({ action: 'create_booking', reason: 'fail' })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('Handlingen kunde inte utföras')
  })

  test('error tar företräde över reason-texten när båda finns', () => {
    const r = classifyExecutionResult({ reason: 'permission_denied', error: 'Specifikt fel från servern' })
    expect(r.outcome).toBe('failed')
    expect(r.error_text).toBe('Specifikt fel från servern')
  })

  test("skipped:'no invoice_id' → skipped, ingen error_text", () => {
    const r = classifyExecutionResult({ action: 'send_invoice', skipped: 'no invoice_id' })
    expect(r.outcome).toBe('skipped')
    expect(r.error_text).toBeNull()
  })

  test('null (reject-actions kör aldrig exekvering) → skipped, null text', () => {
    const r = classifyExecutionResult(null)
    expect(r.outcome).toBe('skipped')
    expect(r.error_text).toBeNull()
  })

  test("rent send_sms-resultat {sms_sent:true} → success", () => {
    const r = classifyExecutionResult({ action: 'send_sms', sms_sent: true })
    expect(r.outcome).toBe('success')
    expect(r.error_text).toBeNull()
  })

  test("autonomy_offer {granted:true} → success", () => {
    const r = classifyExecutionResult({ action: 'autonomy_offer', granted: true })
    expect(r.outcome).toBe('success')
    expect(r.error_text).toBeNull()
  })

  test('acknowledged-only resultat (t.ex. profitability_warning) → success', () => {
    const r = classifyExecutionResult({ action: 'profitability_warning', acknowledged: true })
    expect(r.outcome).toBe('success')
    expect(r.error_text).toBeNull()
  })

  test('tom sträng som error räknas INTE som fel (falsy)', () => {
    const r = classifyExecutionResult({ action: 'send_sms', sms_sent: true, error: '' })
    expect(r.outcome).toBe('success')
  })

  test('ok:true tillsammans med metadata → success', () => {
    const r = classifyExecutionResult({ action: 'confirm_payment', ok: true, metadata: { already_paid: false } })
    expect(r.outcome).toBe('success')
  })
})
