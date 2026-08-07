import { calculateCappedDeduction } from '@/lib/rot-rut-limits'

/**
 * Begränsa en offerts ROT/RUT-avdrag mot kundens redan använda årsutrymme.
 * Grundmotorn räknar offertens statiska avdrag; denna gemensamma hjälpare
 * används både när hantverkaren sparar och när kunden signerar.
 */
export async function applyAnnualCap(
  businessId: string,
  customerId: string | null | undefined,
  vatRate: number,
  totals: { rotWorkCost: number; rutWorkCost: number; subtotal: number; afterDiscount: number; total: number },
  current: { rotDeduction: number; rotCustomerPays: number; rutDeduction: number; rutCustomerPays: number },
): Promise<{ rotDeduction: number; rotCustomerPays: number; rutDeduction: number; rutCustomerPays: number; capped: boolean; warning?: string }> {
  if (!customerId) return { ...current, capped: false }

  const discountFactor = totals.subtotal > 0 ? totals.afterDiscount / totals.subtotal : 1
  let { rotDeduction, rotCustomerPays, rutDeduction, rutCustomerPays } = current
  let capped = false
  let warning: string | undefined

  if (totals.rotWorkCost > 0) {
    const cap = await calculateCappedDeduction(customerId, businessId, 'rot', totals.rotWorkCost, { vatRate, discountFactor })
    if (cap.capped) {
      capped = true
      warning = cap.warning
      rotDeduction = cap.deduction
      rotCustomerPays = totals.total - rotDeduction
    }
  }
  if (totals.rutWorkCost > 0) {
    const cap = await calculateCappedDeduction(customerId, businessId, 'rut', totals.rutWorkCost, { vatRate, discountFactor })
    if (cap.capped) {
      capped = true
      warning = warning ? `${warning} ${cap.warning}` : cap.warning
      rutDeduction = cap.deduction
      rutCustomerPays = totals.total - rutDeduction
    }
  }

  return { rotDeduction, rotCustomerPays, rutDeduction, rutCustomerPays, capped, warning }
}
