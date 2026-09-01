import { test, expect } from '@playwright/test'
import {
  adjustmentSourceKey,
  reconcileCommissionBase,
  type ExistingCommissionEntry,
} from '../lib/partners/commission-reconciliation'

const original = (over: Partial<ExistingCommissionEntry> = {}): ExistingCommissionEntry => ({
  id: 'ledger_original',
  entryKind: 'accrual',
  baseAmountSek: 5_995,
  rate: 0.2,
  ...over,
})

test.describe('Append-only provisionskorrigering', () => {
  test('full refund skapar negativ rad som pekar på originalet', () => {
    expect(reconcileCommissionBase(0, [original()])).toEqual({
      entryKind: 'adjustment',
      adjustsLedgerId: 'ledger_original',
      baseAmountSek: -5_995,
      rate: 0.2,
      amountSek: -1_199,
    })
  })

  test('partiell refund korrigerar bara verifierad differens', () => {
    expect(reconcileCommissionBase(4_496.25, [original()])?.amountSek).toBe(-299.75)
  })

  test('tidigare korrigering räknas med; samma sanning ger ingen ny rad', () => {
    const rows: ExistingCommissionEntry[] = [
      original(),
      { id: 'adj_1', entryKind: 'adjustment', baseAmountSek: -1_498.75, rate: 0.2 },
    ]
    expect(reconcileCommissionBase(4_496.25, rows)).toBeNull()
  })

  test('ny andra refund ger bara den nya differensen', () => {
    const rows: ExistingCommissionEntry[] = [
      original(),
      { id: 'adj_1', entryKind: 'adjustment', baseAmountSek: -1_498.75, rate: 0.2 },
    ]
    expect(reconcileCommissionBase(2_997.5, rows)?.amountSek).toBe(-299.75)
  })

  test('utan original skapas ingen lös justering', () => {
    expect(reconcileCommissionBase(100, [])).toBeNull()
  })

  test('idempotensnyckeln är oberoende av eventordning och dubbletter', () => {
    const base = { partnerId: 'p1', businessId: 'b1', period: '2026-09' }
    expect(adjustmentSourceKey({ ...base, billingEventIds: ['ev_b', 'ev_a', 'ev_a'] }))
      .toBe(adjustmentSourceKey({ ...base, billingEventIds: ['ev_a', 'ev_b'] }))
  })
})

