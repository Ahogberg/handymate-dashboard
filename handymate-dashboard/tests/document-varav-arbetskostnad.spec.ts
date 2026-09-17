import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { buildInvoiceTemplateData } from '../lib/invoice-templates'

test('fakturadatan använder lagrad rot_work_cost som arbetskostnad', () => {
  const data = buildInvoiceTemplateData({ subtotal: 1000, vat_rate: 25, vat_amount: 250, total: 1250,
    rot_rut_type: 'rot', rot_work_cost: 600, rot_rut_deduction: 225, items: [] }, {}, null)
  expect(data.invoice.laborCost).toBe(600)
  expect(data.invoice.rotDeduction).toBe(225)
})

test('offert- och fakturadokumentet visar varav arbetskostnad och korrekt ROT-text', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/quotes/document/QuoteDocument.tsx'), 'utf8')
  expect(source.match(/varav arbetskostnad/g)?.length).toBeGreaterThanOrEqual(2)
  expect(source.match(/ROT-avdrag \(30 % av arbetskostnaden inkl\. moms\)/g)?.length).toBeGreaterThanOrEqual(2)
  for (const relative of [
    '../lib/quote-templates/friendly.ts', '../lib/quote-templates/premium.ts',
    '../lib/invoice-templates/friendly.ts', '../lib/invoice-templates/premium.ts',
  ]) {
    const template = fs.readFileSync(path.join(__dirname, relative), 'utf8')
    expect(template).toContain('varav arbetskostnad')
    expect(template).toContain('ROT-avdrag (30 % av arbetskostnaden inkl. moms)')
  }
})

test('kundutfällningen styrs av show_components_to_customer', () => {
  const builder = fs.readFileSync(path.join(__dirname, '../lib/quote-templates/data-builder.ts'), 'utf8')
  expect(builder).toContain('show_components_to_customer')
  expect(builder).toContain('component_snapshot')
})
