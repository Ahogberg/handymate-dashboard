/**
 * Våg 2c (tasks/value-chain-plan.md) — facit-tester för urvalslogiken i
 * lib/cron/overdue-trigger-selection.ts (invoice_overdue-triggern i
 * app/api/cron/check-overdue/route.ts).
 * Körs: npx playwright test tests/overdue-trigger-selection.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  pickOverdueInvoicesToNotifyKarin,
  MAX_AGENT_TRIGGERS_PER_RUN,
} from '../lib/cron/overdue-trigger-selection'

test.describe('pickOverdueInvoicesToNotifyKarin', () => {
  test('inga fakturor har pending påminnelse → alla väljs (under cap)', () => {
    const invoices = [{ invoice_id: 'inv_1' }, { invoice_id: 'inv_2' }]
    const result = pickOverdueInvoicesToNotifyKarin(invoices, () => false)
    expect(result).toEqual(invoices)
  })

  test('dedup: faktura med pending invoice_reminder-kort hoppas över', () => {
    const invoices = [{ invoice_id: 'inv_1' }, { invoice_id: 'inv_2' }]
    const result = pickOverdueInvoicesToNotifyKarin(invoices, (id) => id === 'inv_1')
    expect(result).toEqual([{ invoice_id: 'inv_2' }])
  })

  test('cap: fler fakturor än max → trunkeras, resten faller till send-reminders-fallbacken', () => {
    const invoices = Array.from({ length: 15 }, (_, i) => ({ invoice_id: `inv_${i}` }))
    const result = pickOverdueInvoicesToNotifyKarin(invoices, () => false, 10)
    expect(result.length).toBe(10)
    expect(result[0].invoice_id).toBe('inv_0')
    expect(result[9].invoice_id).toBe('inv_9')
  })

  test('default cap matchar MAX_AGENT_TRIGGERS_PER_RUN', () => {
    const invoices = Array.from({ length: 25 }, (_, i) => ({ invoice_id: `inv_${i}` }))
    const result = pickOverdueInvoicesToNotifyKarin(invoices, () => false)
    expect(result.length).toBe(MAX_AGENT_TRIGGERS_PER_RUN)
  })

  test('dedup filtrerar INNAN cap appliceras (dedupade fakturor tar inte upp cap-platser)', () => {
    const invoices = Array.from({ length: 12 }, (_, i) => ({ invoice_id: `inv_${i}` }))
    // De tre första har redan ett kort — resten (9 st) ryms under cap 10.
    const result = pickOverdueInvoicesToNotifyKarin(
      invoices,
      (id) => ['inv_0', 'inv_1', 'inv_2'].includes(id),
      10,
    )
    expect(result.length).toBe(9)
    expect(result.map((r) => r.invoice_id)).not.toContain('inv_0')
  })

  test('tom lista → tom lista', () => {
    expect(pickOverdueInvoicesToNotifyKarin([], () => false)).toEqual([])
  })

  test('alla fakturor dedupade → tom lista', () => {
    const invoices = [{ invoice_id: 'inv_1' }, { invoice_id: 'inv_2' }]
    expect(pickOverdueInvoicesToNotifyKarin(invoices, () => true)).toEqual([])
  })
})
