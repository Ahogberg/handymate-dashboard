'use client'

import { useMemo } from 'react'
import {
  calculatePaymentPlan,
  calculateQuoteTotals,
  recalculateItems,
  validatePaymentPlan,
} from '@/lib/quote-calculations'
import type { PaymentPlanEntry, QuoteItem } from '@/lib/types/quote'

/**
 * Wraps quote-calculations: rader → totalsummering, betalningsplan,
 * validering. Memoiserar både rader och totals så preview/totals-kort
 * inte räknas om i onödan.
 */
export function useQuoteCalculations(
  items: QuoteItem[],
  discountPercent: number,
  vatRate: number,
  paymentPlan: PaymentPlanEntry[],
) {
  const recalculated = useMemo(() => recalculateItems(items), [items])
  const totals = useMemo(
    () => calculateQuoteTotals(recalculated, discountPercent, vatRate),
    [recalculated, discountPercent, vatRate],
  )
  const calculatedPaymentPlan = useMemo(
    () => calculatePaymentPlan(totals.total, paymentPlan),
    [totals.total, paymentPlan],
  )
  const paymentPlanValid = validatePaymentPlan(paymentPlan)

  return { recalculated, totals, calculatedPaymentPlan, paymentPlanValid }
}
