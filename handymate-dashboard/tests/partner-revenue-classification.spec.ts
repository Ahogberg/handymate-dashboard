import { test, expect } from '@playwright/test'
import {
  allocateAcrossCalendarMonths,
  classifyPaidInvoice,
  commissionCalendarMonth,
  extractPartnerRevenueForPeriod,
  reverseRevenueSnapshot,
} from '../lib/partners/revenue-classification'

const corePrices = new Set(['price_professional', 'price_professional_yearly'])

function stripeLine(over: Record<string, unknown> = {}) {
  return {
    id: 'il_core',
    amount: 599_500,
    amount_excluding_tax: 599_500,
    price: { id: 'price_professional' },
    period: { start: Date.parse('2026-09-01T00:00:00Z') / 1000, end: Date.parse('2026-10-01T00:00:00Z') / 1000 },
    ...over,
  }
}

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 'in_123',
    currency: 'sek',
    amount_paid: 599_500,
    total_excluding_tax: 599_500,
    subscription_details: { metadata: { business_id: 'biz_1', plan_id: 'professional', billing_interval: 'monthly' } },
    lines: { data: [stripeLine()] },
    ...over,
  }
}

test.describe('Partnerintäkt klassas fail-closed', () => {
  test('känd billing_plan-price blir grundabonnemang', () => {
    const result = classifyPaidInvoice(invoice(), { corePriceIds: corePrices })
    expect(result.classification).toBe('core_subscription')
    expect(result.commissionableExVatOre).toBe(599_500)
    expect(result.lines[0].reason).toBe('known_core_price')
    expect(result.lines[0].allocations).toEqual([{ period: '2026-09', amountExVatOre: 599_500 }])
  })

  test('okänt price-id ger exakt noll provisionsgrundande kronor', () => {
    const result = classifyPaidInvoice(invoice({
      lines: { data: [stripeLine({ price: { id: 'price_unknown_addon' } })] },
    }), { corePriceIds: corePrices })
    expect(result.lines[0].classification).toBe('unknown')
    expect(result.lines[0].reason).toBe('unknown_price')
    expect(result.commissionableExVatOre).toBe(0)
    expect(result.lines[0].allocations).toEqual([])
  })

  test('leads-addon exkluderas även om dess pris av misstag ligger i allowlistan', () => {
    const result = classifyPaidInvoice(invoice({
      subscription_details: { metadata: { business_id: 'biz_1', addon: 'leads', tier: 'pro' } },
    }), { corePriceIds: corePrices })
    expect(result.lines[0].classification).toBe('excluded_addon')
    expect(result.lines[0].reason).toBe('addon_metadata')
    expect(result.commissionableExVatOre).toBe(0)
  })

  test('saknad tjänsteperiod på en känd prisrad ger unknown, aldrig direkt provision', () => {
    const result = classifyPaidInvoice(invoice({
      lines: { data: [stripeLine({ period: null })] },
    }), { corePriceIds: corePrices })
    expect(result.lines[0].classification).toBe('unknown')
    expect(result.lines[0].reason).toBe('missing_service_period')
    expect(result.commissionableExVatOre).toBe(0)
  })

  test('icke-SEK exkluderas fail-closed', () => {
    const result = classifyPaidInvoice(invoice({ currency: 'eur' }), { corePriceIds: corePrices })
    expect(result.lines[0].reason).toBe('non_sek')
    expect(result.commissionableExVatOre).toBe(0)
  })

  test('blandfaktura räknar endast känd core-rad', () => {
    const result = classifyPaidInvoice(invoice({
      amount_paid: 649_400,
      total_excluding_tax: 649_400,
      lines: { data: [
        stripeLine(),
        stripeLine({ id: 'il_addon', amount: 49_900, amount_excluding_tax: 49_900, price: { id: 'price_leads' } }),
      ] },
    }), { corePriceIds: corePrices, excludedPriceIds: new Set(['price_leads']) })
    expect(result.classification).toBe('mixed')
    expect(result.lines.map(line => line.classification)).toEqual(['core_subscription', 'excluded_addon'])
    expect(result.commissionableExVatOre).toBe(599_500)
  })
})

test.describe('Linjär periodisering', () => {
  test('årsplan fördelas över tolv kalenderperioder och behåller exakt öressumma', () => {
    const result = classifyPaidInvoice(invoice({
      amount_paid: 5_995_000,
      total_excluding_tax: 5_995_000,
      subscription_details: { metadata: { billing_interval: 'yearly', plan_id: 'professional' } },
      lines: { data: [stripeLine({
        amount: 5_995_000,
        amount_excluding_tax: 5_995_000,
        price: { id: 'price_professional_yearly' },
        period: {
          start: Date.parse('2026-09-01T00:00:00Z') / 1000,
          end: Date.parse('2027-09-01T00:00:00Z') / 1000,
        },
      })] },
    }), { corePriceIds: corePrices })

    const allocations = result.lines[0].allocations
    expect(allocations).toHaveLength(12)
    expect(allocations[0].period).toBe('2026-09')
    expect(allocations[11].period).toBe('2027-08')
    expect(allocations.reduce((sum, row) => sum + row.amountExVatOre, 0)).toBe(5_995_000)
  })

  test('delperiod fördelas proportionellt över berörda kalendermånader', () => {
    const allocations = allocateAcrossCalendarMonths(
      3_100,
      '2026-01-16T00:00:00.000Z',
      '2026-02-16T00:00:00.000Z',
    )
    expect(allocations.map(row => row.period)).toEqual(['2026-01', '2026-02'])
    expect(allocations.reduce((sum, row) => sum + row.amountExVatOre, 0)).toBe(3_100)
  })
})

test.describe('Append-only återföring', () => {
  test('50 % refund skapar negativa periodiserade rader utan att ändra originalet', () => {
    const original = classifyPaidInvoice(invoice(), { corePriceIds: corePrices })
    const reversal = reverseRevenueSnapshot(original, 'refund', 0.5)
    expect(original.commissionableExVatOre).toBe(599_500)
    expect(reversal.eventKind).toBe('refund')
    expect(reversal.classification).toBe('refund')
    expect(reversal.commissionableExVatOre).toBe(-299_750)
    expect(reversal.lines[0].allocations).toEqual([{ period: '2026-09', amountExVatOre: -299_750 }])
  })

  test('ratio clampas och ogiltig ratio ger noll, aldrig positiv korrigering', () => {
    const original = classifyPaidInvoice(invoice(), { corePriceIds: corePrices })
    expect(reverseRevenueSnapshot(original, 'chargeback', 2).commissionableExVatOre).toBe(-599_500)
    expect(reverseRevenueSnapshot(original, 'refund', Number.NaN).commissionableExVatOre).toBe(0)
  })
})

test.describe('Periodläsning ur fryst snapshot', () => {
  test('summerar betalning och negativ refund för samma period', () => {
    const original = classifyPaidInvoice(invoice(), { corePriceIds: corePrices })
    const refund = reverseRevenueSnapshot(original, 'refund', 0.25)
    const paid = extractPartnerRevenueForPeriod({ partner_revenue: original }, '2026-09')
    const reversed = extractPartnerRevenueForPeriod({ partner_revenue: refund }, '2026-09')
    expect(paid).toEqual({ hasSnapshot: true, amountExVatOre: 599_500 })
    expect(reversed).toEqual({ hasSnapshot: true, amountExVatOre: -149_875 })
    expect(paid.amountExVatOre + reversed.amountExVatOre).toBe(449_625)
  })

  test('rå Stripe-total är aldrig fallback när snapshot saknas', () => {
    expect(extractPartnerRevenueForPeriod({ amount_paid: 9_999_999 }, '2026-09'))
      .toEqual({ hasSnapshot: false, amountExVatOre: 0 })
  })
})

test.describe('Kalenderbaserad provisionsrätt', () => {
  test('första betalningsmånaden är 1; månad 36 är med; månad 37 är svans', () => {
    const start = '2026-09-15T12:00:00.000Z'
    expect(commissionCalendarMonth(start, '2026-09')).toBe(1)
    expect(commissionCalendarMonth(start, '2029-08')).toBe(36)
    expect(commissionCalendarMonth(start, '2029-09')).toBe(37)
  })

  test('obetalda månader och churn kan inte pausa klockan', () => {
    expect(commissionCalendarMonth('2026-01-01T00:00:00Z', '2026-07')).toBe(7)
    expect(commissionCalendarMonth('2026-01-01T00:00:00Z', '2027-01')).toBe(13)
  })

  test('period före start och ogiltig input ger 0', () => {
    expect(commissionCalendarMonth('2026-09-01T00:00:00Z', '2026-08')).toBe(0)
    expect(commissionCalendarMonth('invalid', '2026-09')).toBe(0)
    expect(commissionCalendarMonth('2026-09-01T00:00:00Z', 'bad')).toBe(0)
  })
})
