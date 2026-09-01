import { roundSek } from './commission-engine'

export interface ExistingCommissionEntry {
  id: string
  entryKind: 'accrual' | 'adjustment'
  baseAmountSek: number
  rate: number
}

export interface CommissionAdjustmentDraft {
  entryKind: 'adjustment'
  adjustsLedgerId: string
  baseAmountSek: number
  rate: number
  amountSek: number
}

/**
 * Jämför önskad nettobas från klassade Stripe-händelser med summan av alla
 * redan skrivna liggarrader. Skillnaden blir en NY justeringsrad. Originalet
 * ändras aldrig, oavsett om det redan ligger i en utbetalningsbatch.
 */
export function reconcileCommissionBase(
  desiredBaseSek: number,
  existing: ExistingCommissionEntry[],
): CommissionAdjustmentDraft | null {
  const accrual = existing.find(row => row.entryKind === 'accrual')
  if (!accrual) return null

  const currentBaseSek = roundSek(existing.reduce((sum, row) => sum + Number(row.baseAmountSek || 0), 0))
  const deltaBaseSek = roundSek(desiredBaseSek - currentBaseSek)
  if (Math.abs(deltaBaseSek) < 0.005) return null

  return {
    entryKind: 'adjustment',
    adjustsLedgerId: accrual.id,
    baseAmountSek: deltaBaseSek,
    rate: accrual.rate,
    amountSek: roundSek(deltaBaseSek * accrual.rate),
  }
}

/** Stabil idempotensnyckel för ett visst verifierat händelseläge. */
export function adjustmentSourceKey(input: {
  partnerId: string
  businessId: string
  period: string
  billingEventIds: string[]
}): string {
  const ids = Array.from(new Set(input.billingEventIds)).sort().join(',')
  return `adjustment:${input.partnerId}:${input.businessId}:${input.period}:${ids}`
}

