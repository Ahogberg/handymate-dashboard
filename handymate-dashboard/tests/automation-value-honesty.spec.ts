/**
 * Facit för automationsvärdet (2026-09-14, ROI-audit P0): sparad tid är
 * minuter, aldrig kronor, och blandas aldrig in i det bekräftade beloppet.
 *
 *   npx playwright test tests/automation-value-honesty.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import {
  summariseAutomationValue,
  ESTIMATED_MINUTES_PER_BOOKING_REMINDER,
  ESTIMATED_MINUTES_PER_PIPELINE_UPDATE,
  type AutomationLogRow,
} from '../lib/value/automation-value'

const T0 = '2026-09-10T10:00:00.000Z'
const log = (over: Partial<AutomationLogRow>): AutomationLogRow => ({
  rule_name: null, action_type: null, context: null, result: null, created_at: T0, ...over,
})

test.describe('summariseAutomationValue — pengar och tid hålls isär', () => {
  test('tid ger minuter, aldrig kronor, och påverkar inte confirmed_value', () => {
    const out = summariseAutomationValue([
      log({ rule_name: 'booking_reminder' }),
      log({ action_type: 'move_deal' }),
      log({ action_type: 'update_pipeline' }),
    ], { quotes: new Map(), invoices: new Map() })
    expect(out.confirmed_value).toBe(0)
    expect(out.total_value).toBe(0)
    expect(out.estimated_minutes).toBe(ESTIMATED_MINUTES_PER_BOOKING_REMINDER + 2 * ESTIMATED_MINUTES_PER_PIPELINE_UPDATE)
    expect(out.estimate_basis).toContain('Uppskattning')
    for (const item of out.items) {
      expect(item.status).toBe('estimated')
      expect('amount' in item).toBe(false)
    }
  })

  test('betald faktura räknas med paid_amount, signerad offert separat, total_value = confirmed_value', () => {
    const out = summariseAutomationValue([
      log({ rule_name: 'invoice_reminder', context: { invoice_id: 'inv1' }, created_at: '2026-09-08T10:00:00.000Z' }),
      log({ rule_name: 'quote_followup', context: { quote_id: 'q1' } }),
      log({ rule_name: 'booking_reminder' }),
    ], {
      quotes: new Map([['q1', { status: 'accepted', total: 25000, title: 'Altan' }]]),
      invoices: new Map([['inv1', { status: 'paid', total: 12500, paid_amount: 12499.5, paid_at: '2026-09-10T00:00:00.000Z', invoice_number: 'F-1' }]]),
    })
    expect(out.paid_value).toBe(12500)          // avrundat från 12499,50
    expect(out.signed_quote_value).toBe(25000)
    expect(out.confirmed_value).toBe(37500)
    expect(out.total_value).toBe(out.confirmed_value)
    expect(out.estimated_minutes).toBe(ESTIMATED_MINUTES_PER_BOOKING_REMINDER)
    const paid = out.items.find(i => i.type === 'invoice_paid')
    expect(paid && 'amount' in paid ? paid.amount : null).toBe(12499.5)
  })

  test('samma offert eller faktura räknas aldrig två gånger; obesvarad offert räknas som pending', () => {
    const out = summariseAutomationValue([
      log({ rule_name: 'quote_followup', context: { quote_id: 'q1' } }),
      log({ action_type: 'send_sms', result: { quote_id: 'q1' } }),
      log({ rule_name: 'quote_followup', context: { quote_id: 'q2' } }),
      log({ rule_name: 'invoice_reminder', context: { invoice_id: 'inv1' } }),
      log({ rule_name: 'invoice_reminder', result: { invoice_id: 'inv1' } }),
    ], {
      quotes: new Map([['q1', { status: 'accepted', total: 1000 }], ['q2', { status: 'sent', total: 5000 }]]),
      invoices: new Map([['inv1', { status: 'paid', total: 2000, paid_amount: null, paid_at: '2026-09-12T00:00:00.000Z' }]]),
    })
    expect(out.items.filter(i => i.type === 'quote_signed')).toHaveLength(1)
    expect(out.items.filter(i => i.type === 'invoice_paid')).toHaveLength(1)
    expect(out.confirmed_value).toBe(3000)
    expect(out.pending_count).toBe(1)
  })

  test('betalning utanför 7-dagarsfönstret efter påminnelsen attribueras inte', () => {
    const out = summariseAutomationValue([
      log({ rule_name: 'invoice_reminder', context: { invoice_id: 'inv1' }, created_at: '2026-09-01T00:00:00.000Z' }),
    ], { quotes: new Map(), invoices: new Map([['inv1', { status: 'paid', total: 2000, paid_at: '2026-09-12T00:00:00.000Z' }]]) })
    expect(out.confirmed_value).toBe(0)
    expect(out.items).toHaveLength(0)
  })
})

test.describe('källfacit — ingen kr-schablon för tid finns kvar', () => {
  const route = readFileSync('app/api/automation/value/route.ts', 'utf8')
  const lib = readFileSync('lib/value/automation-value.ts', 'utf8')
  const widget = readFileSync('app/dashboard/agent/page.tsx', 'utf8')

  test('rutten räknar inte själv — den anropar den rena funktionen', () => {
    expect(route).toContain('summariseAutomationValue(')
    expect(route).not.toMatch(/TIME_VALUE_PER_MIN|kr\/min|\* *15\b/)
  })

  test('biblioteket har ingen kr-per-minut-konstant och inget time_saved med amount', () => {
    expect(lib).not.toMatch(/TIME_VALUE_PER_MIN|kr\/min/)
    expect(lib).toMatch(/type: 'time_saved'; label: string; minutes: number; status: 'estimated'/)
  })

  test('widgeten visar minuter som uppskattning och summerar aldrig tid i kronor', () => {
    expect(widget).toContain('min sparade (uppskattning, inte mätt)')
    expect(widget).toContain('estimate_basis')
    expect(widget).not.toContain('genererat automatiskt')
    const start = widget.indexOf('function AutomationValueWidget()')
    const block = widget.slice(start)
    expect(block).not.toMatch(/estimated_minutes\s*\*/)
  })
})
