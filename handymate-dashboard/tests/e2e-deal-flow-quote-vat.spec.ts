import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, '../lib/e2e-deal-flow.ts'), 'utf8')
const quoteGeneration = source.slice(
  source.indexOf('async function executeQuoteGeneration'),
  source.indexOf('async function executeProjectCreation'),
)

test('deal-flow lagrar offertens total inklusive moms i standardschemat', () => {
  expect(quoteGeneration).toContain('const vatAmount = Math.round(subtotal * 0.25 * 100) / 100')
  expect(quoteGeneration).toContain('const total = Math.round((subtotal + vatAmount) * 100) / 100')
  expect(quoteGeneration).toMatch(/subtotal,[\s\S]*vat_rate: 25,[\s\S]*vat_amount: vatAmount,[\s\S]*total,/)
  expect(quoteGeneration).not.toMatch(/\n\s+vat:/)
  expect(quoteGeneration).not.toContain('total_with_vat')
})

test('deal-flow rapporterar samma inklusive-moms-total som den lagrar', () => {
  expect(quoteGeneration).toContain('${Math.round(total)} kr inkl moms')
  expect(quoteGeneration).toContain("data: { quote_id: quote!.quote_id, total }")
})
