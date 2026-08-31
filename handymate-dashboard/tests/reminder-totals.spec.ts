/**
 * Facit för påminnelsens total-/customer_pays-beräkning (Prisslingan V2 A4).
 * Låser: momsen överlever påminnelser; det LAGRADE (årstakskappade) avdraget
 * används — aldrig en egen procentformel; avgifter/ränta läggs rakt på.
 */
import { test, expect } from '@playwright/test'
import { beraknaPaminnelseTotaler } from '../lib/invoice-reminder-send'

test.describe('beraknaPaminnelseTotaler', () => {
  test('utan ROT: total = subtotal + moms + avgifter (momsen tappas inte)', () => {
    const r = beraknaPaminnelseTotaler(
      { subtotal: 10000, vat_amount: 2500, rot_rut_type: null, rot_rut_deduction: 0 },
      60,
    )
    expect(r.total).toBe(12560)
    expect(r.customer_pays).toBe(12560)
  })

  test('med ROT: lagrat kappat avdrag används, inte en procentformel', () => {
    // 10 000 arbete exkl moms, 12 500 inkl. Lagrat (kappat) avdrag 3 750.
    const r = beraknaPaminnelseTotaler(
      { subtotal: 10000, vat_amount: 2500, rot_rut_type: 'rot', rot_rut_deduction: 3750 },
      60,
    )
    expect(r.total).toBe(12560)
    expect(r.customer_pays).toBe(12500 - 3750 + 60)
  })

  test('avgift + uppdaterad ränta ackumuleras via feesAndInterest-summan', () => {
    const r = beraknaPaminnelseTotaler(
      { subtotal: 8000, vat_amount: 2000, rot_rut_type: null },
      60 + 145, // avgift + ränta
    )
    expect(r.total).toBe(10205)
  })

  test('null-fält kraschar inte — 0-bas', () => {
    const r = beraknaPaminnelseTotaler({}, 0)
    expect(r.total).toBe(0)
    expect(r.customer_pays).toBe(0)
  })
})
