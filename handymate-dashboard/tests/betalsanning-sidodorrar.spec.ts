/**
 * Betalsanning — sidodörrarna runt betalkärnan är stängda (2026-09-13).
 *
 * Bakgrund: Financial Kernel-spår B (docs/strategy/FINANCIAL_KERNEL_CALL_SITE_MAP.md)
 * hittade fyra vägar som skrev betalt-tillstånd runt lib/invoices/apply-payment.ts.
 * De var buggar i produktion oberoende av kerneln. Detta facit låser rättningarna
 * så att en sidodörr inte öppnas igen av misstag.
 *
 *   npx playwright test tests/betalsanning-sidodorrar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

test('Matte mark_invoice_paid går genom betalkärnan, inte en rå update', () => {
  const src = read('lib/matte/action-executor.ts')
  expect(src).toContain("import { applyInvoicePayment } from '@/lib/invoices/apply-payment'")
  const block = src.slice(src.indexOf("case 'mark_invoice_paid'"), src.indexOf("case 'create_lead'"))
  expect(block).toContain('applyInvoicePayment({')
  expect(block).toContain("source: 'manual'")
  expect(block).not.toMatch(/\.from\('invoice'\)[\s\S]{0,200}\.update\(/)
  expect(block).not.toContain("status: 'paid'")
})

test('fakturalistans "Markera betald" anropar mark-paid-routen, aldrig PUT med status paid', () => {
  const src = read('app/dashboard/invoices/page.tsx')
  expect(src).toContain('onClick={() => handleMarkPaid(invoice.invoice_id)}')
  const fn = src.slice(src.indexOf('const handleMarkPaid'), src.indexOf('const handleSendReminder'))
  expect(fn).toContain('/mark-paid`')
  expect(fn).toContain("method: 'POST'")
  expect(fn).not.toContain("method: 'PUT'")
  expect(fn).not.toContain("status: 'paid'")
})

test('PUT /api/invoices vägrar betalt-tillstånd och betalfält', () => {
  const src = read('app/api/invoices/route.ts')
  const put = src.slice(src.indexOf('export async function PUT'), src.indexOf('export async function DELETE'))
  expect(put).toContain("fields.status === 'paid' || fields.status === 'customer_paid'")
  expect(put).toContain('/mark-paid')
  expect(put).toContain("fields.paid_amount !== undefined")
  expect(put).not.toContain('updates.paid_at = new Date()')
  // Ingen annan kod i app/ skickar status 'paid' till PUT /api/invoices.
  expect(read('app/dashboard/invoices/page.tsx')).not.toMatch(/fetch\('\/api\/invoices',[\s\S]{0,200}status: 'paid'/)
})

test('ROT/RUT-årstaket räknar customer_paid via den delade statuslistan', () => {
  const src = read('lib/rot-rut-limits.ts')
  expect(src).toContain("import { CUSTOMER_SETTLED_STATUSES } from '@/lib/invoices/status'")
  const fn = src.slice(src.indexOf('export async function getCustomerRotRutUsage'), src.indexOf('let rotUsed'))
  expect(fn).toContain(".in('status', ['sent', 'overdue', ...CUSTOMER_SETTLED_STATUSES])")
  expect(fn).not.toContain("['sent', 'paid', 'overdue']")
  // Den delade listan innehåller verkligen customer_paid.
  expect(read('lib/invoices/status.ts')).toContain("CUSTOMER_SETTLED_STATUSES = ['paid', 'customer_paid']")
})

test('backfillen av paid_amount rör bara NULL-rader i slutförda statusar', () => {
  const sql = read('sql/v237_backfill_paid_amount.sql')
  expect(sql).toContain('WHERE paid_amount IS NULL')
  expect(sql).toContain("AND status IN ('paid', 'customer_paid')")
  expect(sql).not.toMatch(/SET\s+status/i)
  expect(sql).not.toMatch(/SET[\s\S]*?paid_at\s*=/i)
  expect(sql).toMatch(/^BEGIN;/m)
  expect(sql).toMatch(/^COMMIT;/m)
})
