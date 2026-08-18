/**
 * Facit för eskaleringsklassaren (Etapp Å) — den slutna listan
 * deterministiska klasser som får pusha under ett aktivt frånvarofönster.
 *
 *   npx playwright test tests/absence-escalation.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  classifyAbsenceEvent,
  isEscalationClass,
  raknaFranvaroStatus,
  ESCALATION_CLASSES,
  type AbsenceEvent,
  type PendingApprovalEvent,
} from '../lib/absence/escalation'

const approval = (over: Partial<PendingApprovalEvent> = {}): PendingApprovalEvent => ({
  kind: 'pending_approval',
  approvalType: 'invoice_reminder',
  riskLevel: 'medium',
  payload: null,
  ...over,
})

test.describe('pending_approval-källan', () => {
  test('promise_deadline_signal klassas som promise_deadline', () => {
    expect(classifyAbsenceEvent(approval({ approvalType: 'promise_deadline_signal' }))).toBe('promise_deadline')
  })

  test('mandate_paused_signal klassas som mandate_paused', () => {
    expect(classifyAbsenceEvent(approval({ approvalType: 'mandate_paused_signal' }))).toBe('mandate_paused')
  })

  test('payload.cap_exceeded klassas som autonomy_cap_refusal', () => {
    expect(classifyAbsenceEvent(approval({ payload: { cap_exceeded: true } }))).toBe('autonomy_cap_refusal')
  })

  test('risk_level high klassas som high_risk_approval', () => {
    expect(classifyAbsenceEvent(approval({ riskLevel: 'high' }))).toBe('high_risk_approval')
  })

  test('ett vanligt kort (medium risk, ingen signaltyp) samlas', () => {
    expect(classifyAbsenceEvent(approval())).toBe('samlas')
  })

  test('payload.cap_exceeded=false triggar inte klassen', () => {
    expect(classifyAbsenceEvent(approval({ payload: { cap_exceeded: false } }))).toBe('samlas')
  })

  test('en verifierad payload.escalation_class-tagg (driftlarmets syntetiska push) accepteras', () => {
    expect(classifyAbsenceEvent(approval({ approvalType: 'payment_failed_signal', payload: { escalation_class: 'payment_failed' } })))
      .toBe('payment_failed')
  })

  test('en ogiltig escalation_class-tagg ignoreras, faller tillbaka till vanlig klassning', () => {
    expect(classifyAbsenceEvent(approval({ payload: { escalation_class: 'pahittad_klass' } }))).toBe('samlas')
  })
})

test.describe('billing_event-källan', () => {
  test('payment_failed klassas', () => {
    expect(classifyAbsenceEvent({ kind: 'billing_event', eventType: 'payment_failed' })).toBe('payment_failed')
  })

  test('andra billing-händelser samlas', () => {
    expect(classifyAbsenceEvent({ kind: 'billing_event', eventType: 'invoice_paid' })).toBe('samlas')
  })
})

test.describe('automation_activity-källan', () => {
  test('status failed klassas som external_delivery_failure', () => {
    expect(classifyAbsenceEvent({ kind: 'automation_activity', status: 'failed' })).toBe('external_delivery_failure')
  })

  test('status success samlas', () => {
    expect(classifyAbsenceEvent({ kind: 'automation_activity', status: 'success' })).toBe('samlas')
  })
})

test.describe('isEscalationClass', () => {
  test('alla sex klasser i ESCALATION_CLASSES känns igen', () => {
    for (const c of ESCALATION_CLASSES) expect(isEscalationClass(c)).toBe(true)
  })

  test('okända strängar och andra typer avvisas', () => {
    expect(isEscalationClass('nagot_pahittat')).toBe(false)
    expect(isEscalationClass(null)).toBe(false)
    expect(isEscalationClass(undefined)).toBe(false)
    expect(isEscalationClass(42)).toBe(false)
  })
})

test.describe('raknaFranvaroStatus — statusradens räkning', () => {
  test('delar upp korrekt mellan samlade och eskaleringar', () => {
    const result = raknaFranvaroStatus([
      { approval_type: 'invoice_reminder', risk_level: 'medium', payload: null },
      { approval_type: 'promise_deadline_signal', risk_level: null, payload: null },
      { approval_type: 'send_sms', risk_level: 'high', payload: null },
    ])
    expect(result).toEqual({ samlade: 1, eskaleringar: 2 })
  })

  test('tom lista ger noll och noll', () => {
    expect(raknaFranvaroStatus([])).toEqual({ samlade: 0, eskaleringar: 0 })
  })
})

test.describe('fail-closed — sluten union, ingen okänd händelsetyp slinker igenom', () => {
  test('en runtime-injicerad okänd kind kastar i stället för att tyst returnera samlas', () => {
    const okand = { kind: 'nagot_helt_annat' } as unknown as AbsenceEvent
    expect(() => classifyAbsenceEvent(okand)).toThrow()
  })
})
