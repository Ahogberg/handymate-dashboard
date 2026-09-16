import { expect, test } from '@playwright/test'
import { invoiceRotWorkCosts } from '../lib/invoices/create-invoice'
import { validateInvoiceForSkv } from '../lib/skv/validate-rot-request'
import { rotRutLaborBasis, splitTimeEntryLine } from '../lib/rot-rut-basis'
import { toCreditItem } from '../lib/invoices/credit-items'
import fs from 'node:fs'
import path from 'node:path'

test('create-invoice härleder ROT/RUT-arbetskostnad ur samma radbas', () => {
  const costs = invoiceRotWorkCosts([
    { item_type: 'item', total: 1000, labor_amount: 600, material_amount: 300, travel_amount: 100, is_rot_eligible: true },
    { item_type: 'item', total: 500, labor_amount: 200, material_amount: 300, travel_amount: 0, is_rut_eligible: true },
  ])
  expect(costs).toEqual({ rot_work_cost: 600, rut_work_cost: 200 })
})

test('varje fakturaväg kör samma numeriska arbetsbas', () => {
  const paths = [
    'app/api/invoices/from-quote/route.ts',
    'app/api/invoices/from-project/route.ts',
    'app/api/invoices/from-time-entries/route.ts',
    'app/api/invoices/route.ts',
    'lib/agreements/invoice-visit.ts',
    'app/api/agent/trigger/tool-router.ts',
    'app/api/projects/[id]/create-final-invoice/route.ts',
    'app/api/invoices/credit/route.ts',
    'lib/fortnox/import-invoices.ts',
    'app/api/debug/e2e-invoice/route.ts',
  ]
  const mixed = [{ item_type: 'item', quantity: 2, unit_price: 500, total: 1000,
    labor_amount: 600, material_amount: 300, travel_amount: 100, rot_rut_type: 'rot', is_rot_eligible: true }]
  for (const file of paths) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    expect(source, file).toMatch(/rotRutLaborBasis|createInvoice\(/)
    expect(rotRutLaborBasis(mixed, 'rot'), file).toBe(600)
  }
  const travel = [{ item_type: 'item', total: 800, rot_rut_type: null,
    ...splitTimeEntryLine(800, 'travel') }]
  expect(rotRutLaborBasis(travel, 'rot')).toBe(0)
})

test('kreditrad negerar total och alla tre delbelopp', () => {
  const credit = toCreditItem({ quantity: 1, unit_price: 1000, total: 1000,
    labor_amount: 600, material_amount: 300, travel_amount: 100, is_rot_eligible: true }, 'credit')
  expect(credit).toMatchObject({ total: -1000, unit_price: -1000,
    labor_amount: -600, material_amount: -300, travel_amount: -100 })
  expect(rotRutLaborBasis([credit], 'rot')).toBe(-600)
})

test('Skatteverket-valideringen använder lagrad arbetskostnad ex moms', () => {
  const result = validateInvoiceForSkv({
    invoice: {
      invoice_id: 'i', status: 'customer_paid', paid_at: '2026-06-01', total: 1000,
      rot_rut_type: 'rot', rot_work_cost: 600, rot_deduction: 225, vat_rate: 25,
      rot_hours: 1, rot_work_category: 'Bygg', rot_property_type: 'småhus',
      rot_property_designation: 'BÅLSTA 1:1',
    },
    customerPersonalNumber: '199001010009', businessOrgNumber: '5566778899', taxYear: 2026,
  })
  expect(result.errors).toEqual([])
  expect(result.normalized?.prisForArbete).toBe(750)
})
