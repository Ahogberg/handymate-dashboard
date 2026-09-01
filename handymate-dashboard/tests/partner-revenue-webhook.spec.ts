import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..')
const webhook = fs.readFileSync(path.join(root, 'app/api/billing/webhook/route.ts'), 'utf8')
const commission = fs.readFileSync(path.join(root, 'lib/partners/commission.ts'), 'utf8')

test.describe('Stripe → partnerintäkt-kontrakt', () => {
  test('betalningen fryser radklassningen i billing_event', () => {
    expect(webhook).toContain('classifyStripeInvoiceForPartner')
    expect(webhook).toMatch(/partner_revenue:\s*partnerRevenue/)
    expect(webhook).toMatch(/if \(eventError\) throw new Error/)
  })

  test('refund och chargeback har uttryckliga webhookgrenar', () => {
    expect(webhook).toContain("case 'refund.created'")
    expect(webhook).toContain("case 'charge.dispute.created'")
    expect(webhook).toContain("'payment_refunded'")
    expect(webhook).toContain("'payment_chargeback'")
    expect(webhook).toContain('reverseRevenueSnapshot')
  })

  test('provisionsmotorn läser bara snapshot-allocationer, aldrig rå amount_paid', () => {
    expect(commission).toContain('extractPartnerRevenueForPeriod')
    expect(commission).not.toContain('deriveExMomsSek(ev.data)')
    expect(commission).toContain('0 kr provisionsgrundat')
  })

  test('avtalsmånad kommer från kalendern, inte antal tidigare liggarrader', () => {
    expect(commission).toContain('commissionCalendarMonth(ref.converted_at, period)')
    expect(commission).not.toContain('priorMonths')
  })
})

