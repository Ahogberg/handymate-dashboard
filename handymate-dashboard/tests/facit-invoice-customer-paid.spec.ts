/**
 * Facit: "Kundens del betald" som eget sanningstillstånd (2026-08-26).
 *
 * Bakgrund: när kunden betalade SIN del av en ROT/RUT-faktura stod Fortnox
 * Balance kvar > 0 (= skattereduktionen) → sync-payments gjorde fakturan
 * FÖRFALLEN, påminnelsetrappan jagade kunden för Skatteverkets pengar och
 * fakturan blev aldrig ROT-berättigad (grinden krävde status='paid').
 * Dessutom skrev synken fantomkolumnen payment_method (finns inte) så hela
 * betald-skrivningen avvisades tyst medan automationerna kördes ändå.
 *
 * Låser: migrationen, en betal-kärna, klassificeraren i synken, ROT-grinden,
 * dunning-spärren, portalens synlighet och att fantomkolumnerna är borta.
 *
 *   npx playwright test tests/facit-invoice-customer-paid.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('sql/v170 — tillståndsmodellen finns i databasen', () => {
  const sql = read('sql/v170_invoice_customer_paid.sql')

  test('CHECK-constrainten innehåller customer_paid och credited', () => {
    const check = sql.slice(sql.indexOf('ADD CONSTRAINT invoice_status_check'))
    for (const s of ['draft', 'sent', 'customer_paid', 'paid', 'overdue', 'cancelled', 'credited']) {
      expect(check, `status '${s}' saknas i CHECK`).toContain(`'${s}'`)
    }
  })

  test('kolumnerna som koden skriver finns: paid_amount, settled_at, cancelled_at', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS paid_amount\s+NUMERIC/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS settled_at\s+TIMESTAMPTZ/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS cancelled_at\s+TIMESTAMPTZ/)
  })

  test('ej-ROT betald backfyllas som slutbetald (settled_at = paid_at)', () => {
    expect(sql).toMatch(/UPDATE invoice\s+SET settled_at = paid_at\s+WHERE status = 'paid' AND rot_rut_type IS NULL/)
  })
})

test.describe('en betal-kärna — lib/invoices/apply-payment.ts', () => {
  const s = read('lib/invoices/apply-payment.ts')

  test('beslutet är rent (decidePaymentOutcome) och skriver paid_via, inte payment_method', () => {
    expect(s).toContain('decidePaymentOutcome(invoice, opts.amount)')
    expect(s).not.toContain('payment_method')
    expect(s).toContain('paid_via: paidVia')
  })

  test('registerFortnoxPayment anropas inte längre (saknade scope, gav falskt fel)', () => {
    expect(s).not.toContain('registerFortnoxPayment(')
    expect(s).not.toMatch(/import .*registerFortnoxPayment/)
  })

  test('automationer och portal-tack körs bara när kunden JUST gjort sitt — aldrig vid settled', () => {
    const idx = s.indexOf('const customerJustSettled')
    expect(idx).toBeGreaterThan(-1)
    const after = s.slice(idx)
    expect(after.indexOf('if (customerJustSettled)')).toBeLessThan(after.indexOf('runPostPaymentAutomations('))
    expect(after.indexOf('if (customerJustSettled)')).toBeLessThan(after.indexOf('sendPortalNotification('))
  })

  test('runPostPaymentAutomations exporteras och inkluderar AI-projektledarens avslutskoll', () => {
    expect(s).toContain('export async function runPostPaymentAutomations')
    expect(s).toContain('handleProjectEvent')
  })

  test('UPDATE:en läser error och skrivningen är tenant-scopad', () => {
    expect(s).toContain('if (updateErr)')
    const upd = s.slice(s.indexOf('.update(updates)'))
    expect(upd.slice(0, 200)).toContain(".eq('business_id', businessId)")
  })
})

test.describe('Fortnox-synken — lib/fortnox/sync-payments.ts', () => {
  const s = read('lib/fortnox/sync-payments.ts')

  test('klassificerar via classifyFortnoxPayment och går genom applyInvoicePayment', () => {
    expect(s).toContain('classifyFortnoxPayment(fnInv, inv, todayStr)')
    expect(s).toContain('applyInvoicePayment({')
    expect(s, 'ingen egen kopia av automationskedjan').not.toContain('async function runPostPaymentAutomations')
  })

  test('fantomkolumnen payment_method skrivs inte', () => {
    expect(s).not.toContain('payment_method')
  })

  test('customer_paid ingår i kandidaterna (settle-kollen) — filtret är fortfarande (paid,cancelled)', () => {
    expect(s).toContain(".not('status', 'in', '(paid,cancelled)')")
  })

  test('räknarna är additiva: marked_customer_paid + marked_settled', () => {
    expect(s).toContain('marked_customer_paid')
    expect(s).toContain('marked_settled')
  })

  test('makulering skriver cancelled_at och läser error', () => {
    const fn = s.slice(s.indexOf('async function markInvoiceCancelled'))
    expect(fn.slice(0, 500)).toContain('cancelled_at')
    expect(fn.slice(0, 500)).toContain('if (error) throw error')
  })
})

test.describe('ROT-grinden accepterar customer_paid', () => {
  test('validate-rot-request kräver isCustomerSettled och behåller "inte betald"-texten', () => {
    const s = read('lib/skv/validate-rot-request.ts')
    expect(s).toContain('if (!isCustomerSettled(inv.status))')
    expect(s).toContain('inte betald')
    expect(s, 'Skatteverket: begärt <= betalt').toContain('paid + 1 < share')
  })

  test('eligible + generate filtrerar på CUSTOMER_SETTLED_STATUSES och behåller rot_payment_request_id-null', () => {
    const e = read('app/api/rot-payment/eligible/route.ts')
    expect(e).toContain(".in('status', [...CUSTOMER_SETTLED_STATUSES])")
    expect(e).toContain(".is('rot_payment_request_id', null)")
    expect(e).not.toContain(".eq('status', 'paid')")
    const g = read('app/api/rot-payment/generate/route.ts')
    expect(g).toContain(".in('status', [...CUSTOMER_SETTLED_STATUSES])")
    expect(g).not.toContain(".eq('status', 'paid')")
  })

  test("egen XML-begäran skriver rot_application_status='skv_requested'; beslutsimporten matchar på rot_payment_request_id", () => {
    expect(read('app/api/rot-payment/generate/route.ts')).toContain("rot_application_status: 'skv_requested'")
    const d = read('app/api/rot-payment/import-decision/route.ts')
    expect(d).toContain(".not('rot_payment_request_id', 'is', null)")
    expect(d).not.toContain(".eq('rot_application_status', 'submitted')")
  })
})

test.describe('dunning-spärren — customer_paid jagas aldrig', () => {
  test('check-overdue och send-reminders innehåller inte customer_paid', () => {
    expect(read('app/api/cron/check-overdue/route.ts')).not.toContain('customer_paid')
    expect(read('app/api/cron/send-reminders/route.ts')).not.toContain('customer_paid')
  })

  test('manuell påminnelse och kundens "Jag har betalat" blockerar på isCustomerSettled', () => {
    const r = read('app/api/invoices/[id]/reminder/route.ts')
    expect(r).toContain('isCustomerSettled(invoice.status)')
    expect(r).toContain('Skatteverket')
    expect(read('app/api/portal/[token]/invoices/[id]/claim-paid/route.ts')).toContain('isCustomerSettled(invoice.status)')
  })
})

test.describe('kunden ser fakturan — portal-API:erna', () => {
  test('list + detalj filtrerar på PORTAL_VISIBLE_STATUSES (inkluderar customer_paid)', () => {
    for (const f of ['app/api/portal/[token]/invoices/route.ts', 'app/api/portal/[token]/invoices/[id]/route.ts']) {
      const s = read(f)
      expect(s, f).toContain(".in('status', [...PORTAL_VISIBLE_STATUSES])")
      expect(s, f).not.toContain(".in('status', ['sent', 'paid', 'overdue'])")
    }
    expect(read('lib/invoices/status.ts')).toMatch(/PORTAL_VISIBLE_STATUSES = \['sent', 'customer_paid', 'paid', 'overdue'\]/)
  })
})

test.describe('PATCH /status går genom kärnan; fantomen payment_method är borta ur UI', () => {
  test('status-rutten importerar applyInvoicePayment och har inga egna automationsblock', () => {
    const s = read('app/api/invoices/[id]/status/route.ts')
    expect(s).toContain("import { applyInvoicePayment } from '@/lib/invoices/apply-payment'")
    expect(s).not.toContain('advanceProjectStage')
    expect(s).not.toContain('triggerEventCommunication')
    expect(s, 'Golden Path tack-SMS finns kvar').toContain('/api/sms/send')
    expect(s, 'tack-SMS gate:at på övergången').toContain('if (customerJustSettled)')
  })

  test('UI + debug-rutt skriver paid_via, inte payment_method', () => {
    for (const f of [
      'app/dashboard/invoices/[id]/page.tsx',
      'app/dashboard/invoices/[id]/components/InvoicePaymentModal.tsx',
      'app/dashboard/invoices/[id]/components/InvoiceStatusTimeline.tsx',
      'app/api/debug/e2e-invoice/route.ts',
    ]) {
      expect(read(f), f).not.toContain('payment_method')
    }
  })

  test('statusetiketten finns i båda vyerna', () => {
    expect(read('app/dashboard/invoices/[id]/helpers.ts')).toContain("case 'customer_paid': return 'Kundens del betald'")
    expect(read('app/dashboard/invoices/page.tsx')).toContain("case 'customer_paid': return 'Kundens del betald'")
  })
})
