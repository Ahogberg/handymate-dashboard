/**
 * Utfalls-klassificering för approval-exekvering (juli-audit, fix/exec-utfall).
 * Körs: npx playwright test tests/execution-outcome.spec.ts --no-deps
 *
 * classifyExecutionResult() speglar hur components/dashboard/PendingApprovalsBlock.tsx
 * redan idag läser execution-objektet i klienten — testerna säkerställer att
 * det som PERSISTERAS på pending_approvals-raden matchar det UI:t visar.
 */
import { test, expect } from '@playwright/test'
import { classifyExecutionResult, extractExecutionArtifacts } from '../lib/approvals/execution-outcome'

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

  test('executed:false → skipped — ett review-kort har inte utfört en handling', () => {
    const r = classifyExecutionResult({
      action: 'missad_intakt',
      executed: false,
      action_class: 'REVIEW_REQUIRED',
      note: 'Öppna ärendet och granska det innan något skickas.',
    })
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

test.describe('extractExecutionArtifacts — Value Ledger-grunden (kort → skapad artefakt)', () => {
  test('null-resultat → undefined (reject-actions kör aldrig exekvering)', () => {
    expect(extractExecutionArtifacts(null)).toBeUndefined()
  })

  test('resultat utan vitlistade fält → undefined, ingen tom {}-nyckel', () => {
    const r = extractExecutionArtifacts({ action: 'send_sms', sms_sent: true, error: undefined })
    expect(r).toBeUndefined()
  })

  test('fakturera_projekt-resultat: invoice_id plockas ut', () => {
    const r = extractExecutionArtifacts({ action: 'fakturera_projekt', invoice_id: 'inv_1', ok: true })
    expect(r).toEqual({ invoice_id: 'inv_1' })
  })

  test('create_ata_draft-resultat: ata_id + project_id + total plockas ut, ok/action hoppas över', () => {
    const r = extractExecutionArtifacts({
      action: 'create_ata_draft', ok: true, ata_id: 'ch_5', project_id: 'proj_1', total: 4000,
    })
    expect(r).toEqual({ ata_id: 'ch_5', project_id: 'proj_1', total: 4000 })
  })

  test('null- och undefined-värden skrivs aldrig, även om nyckeln är vitlistad', () => {
    const r = extractExecutionArtifacts({ action: 'create_quote_draft', quote_id: undefined, ok: false, error: 'fel' })
    expect(r).toBeUndefined()
  })

  test('rena metadatafält (results/error/ok/reason/navigate_to) tas ALDRIG med', () => {
    const r = extractExecutionArtifacts({
      action: 'send_invoice', ok: false, error: 'Fortnox-fel', reason: 'fail', navigate_to: '/dashboard/invoices',
      invoice_id: 'inv_9',
    })
    expect(r).toEqual({ invoice_id: 'inv_9' })
  })

  test('send_email: message_id plockas ut (INTE ett fabricerat email_id-fält)', () => {
    const r = extractExecutionArtifacts({ action: 'send_email', ok: true, message_id: 'msg_1' })
    expect(r).toEqual({ message_id: 'msg_1' })
  })

  test('playbook_pattern_confirmation: knowledge_id plockas ut (Playbook → Project-slutförande, 2026-08-17)', () => {
    const r = extractExecutionArtifacts({
      action: 'playbook_pattern_confirmation', ok: true, knowledge_id: 'know_1',
    })
    expect(r).toEqual({ knowledge_id: 'know_1' })
  })

  test('playbook_kickoff_suggestion: checklist_id + project_id plockas ut', () => {
    const r = extractExecutionArtifacts({
      action: 'playbook_kickoff_suggestion', ok: true, checklist_id: 'cl_1', project_id: 'proj_1',
    })
    expect(r).toEqual({ checklist_id: 'cl_1', project_id: 'proj_1' })
  })
})
