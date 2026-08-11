/**
 * Facit för buildExpectedMarginSnapshot (2026-08-12).
 *
 * Snapshoten fryser calculateQuoteMargin() (redan facit-testad i
 * tests/quote-margin.spec.ts) på quotes.expected_margin_snapshot vid accept
 * — den här specen testar bara sömmen: att fälten mappas rätt, att ett
 * saknat inköpspris fortsätter ge null (aldrig en påhittad 100 %), och att
 * basis följer med oförändrad.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/margin-snapshot.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { buildExpectedMarginSnapshot } from '../lib/quotes/margin-snapshot'
import type { QuoteItem } from '../lib/types/quote'

function row(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'qi_1',
    item_type: 'item',
    description: 'Rad',
    quantity: 1,
    unit: 'st',
    unit_price: 1000,
    total: 1000,
    is_rot_eligible: false,
    is_rut_eligible: false,
    sort_order: 0,
    ...overrides,
  }
}

test.describe('buildExpectedMarginSnapshot mappar calculateQuoteMargin korrekt', () => {
  test('komplett underlag ger alla fält ifyllda', () => {
    const snapshot = buildExpectedMarginSnapshot(
      [row({ total: 10000, quantity: 1, cost_price: 6000 })],
      'manual_accept',
    )
    expect(snapshot.margin_kr).toBe(4000)
    expect(snapshot.margin_pct).toBe(40)
    expect(snapshot.known_revenue).toBe(10000)
    expect(snapshot.known_cost).toBe(6000)
    expect(snapshot.is_partial).toBe(false)
    expect(snapshot.rows_with_cost).toBe(1)
    expect(snapshot.rows_without_cost).toBe(0)
    expect(snapshot.basis).toBe('manual_accept')
    expect(typeof snapshot.computed_at).toBe('string')
    expect(Number.isNaN(Date.parse(snapshot.computed_at))).toBe(false)
  })

  test('saknat inköpspris ger margin_pct null — ALDRIG en påhittad 100 %', () => {
    const snapshot = buildExpectedMarginSnapshot(
      [row({ cost_price: undefined })],
      'portal_accept',
    )
    expect(snapshot.margin_pct).toBeNull()
    expect(snapshot.is_partial).toBe(true)
    expect(snapshot.rows_without_cost).toBe(1)
    expect(snapshot.known_revenue).toBe(0)
  })

  test('tom offert ger ett tomt men giltigt snapshot, ingen krasch', () => {
    const snapshot = buildExpectedMarginSnapshot([], 'signed')
    expect(snapshot.margin_pct).toBeNull()
    expect(snapshot.margin_kr).toBe(0)
    expect(snapshot.is_partial).toBe(false)
    expect(snapshot.basis).toBe('signed')
  })

  test('basis följer med oförändrad för alla tre accept-vägarna', () => {
    const items = [row({ total: 1000, cost_price: 500 })]
    expect(buildExpectedMarginSnapshot(items, 'manual_accept').basis).toBe('manual_accept')
    expect(buildExpectedMarginSnapshot(items, 'portal_accept').basis).toBe('portal_accept')
    expect(buildExpectedMarginSnapshot(items, 'signed').basis).toBe('signed')
  })

  test('blandat underlag: känd marginal + partiell-flagga, samma som QuoteMarginCard visar', () => {
    const snapshot = buildExpectedMarginSnapshot(
      [
        row({ id: 'a', total: 10000, quantity: 1, cost_price: 6000 }),
        row({ id: 'b', total: 5000, quantity: 1, cost_price: undefined }),
      ],
      'manual_accept',
    )
    expect(snapshot.known_revenue).toBe(10000)
    expect(snapshot.known_cost).toBe(6000)
    expect(snapshot.margin_kr).toBe(4000)
    expect(snapshot.margin_pct).toBe(40)
    expect(snapshot.is_partial).toBe(true)
    expect(snapshot.rows_with_cost).toBe(1)
    expect(snapshot.rows_without_cost).toBe(1)
  })
})
