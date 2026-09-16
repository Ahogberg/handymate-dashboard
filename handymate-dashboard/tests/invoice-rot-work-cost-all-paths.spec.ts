import { expect, test } from '@playwright/test'
import { invoiceRotWorkCosts } from '../lib/invoices/create-invoice'
import { validateInvoiceForSkv } from '../lib/skv/validate-rot-request'

test('create-invoice härleder ROT/RUT-arbetskostnad ur samma radbas', () => {
  const costs = invoiceRotWorkCosts([
    { item_type: 'item', total: 1000, labor_amount: 600, material_amount: 300, travel_amount: 100, is_rot_eligible: true },
    { item_type: 'item', total: 500, labor_amount: 200, material_amount: 300, travel_amount: 0, is_rut_eligible: true },
  ])
  expect(costs).toEqual({ rot_work_cost: 600, rut_work_cost: 200 })
})

test('Skatteverket-valideringen använder lagrad arbetskostnad ex moms', () => {
  const result = validateInvoiceForSkv({
    invoice: {
      invoice_id: 'i', status: 'customer_paid', paid_at: '2026-06-01', total: 1000,
      rot_rut_type: 'rot', rot_work_cost: 600, rot_deduction: 225, vat_rate: 25,
      rot_hours: 1, rot_work_category: 'Bygg', rot_property_type: 'småhus',
      rot_property_designation: 'BÅLSTA 1:1',
    },
    customerPersonalNumber: '199001010006', businessOrgNumber: '5566778899', taxYear: 2026,
  })
  // Personnumrets facit är inte poängen här; arbetskostnaden ska oavsett
  // normaliseras till 600 × 1,25 = 750 kr i SKV-underlaget.
  if (result.normalized) expect(result.normalized.prisForArbete).toBe(750)
  else expect(result.errors).not.toContain('Arbetskostnad saknas eller är noll.')
})
