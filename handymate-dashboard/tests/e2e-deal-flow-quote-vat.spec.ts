import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, '../lib/e2e-deal-flow.ts'), 'utf8')
const quoteGeneration = source.slice(
  source.indexOf('async function executeQuoteGeneration'),
  source.indexOf('async function executeProjectCreation'),
)

/**
 * Uppdaterad 2026-08-09: offertskapandet går numera genom den kanoniska
 * byggaren (lib/quotes/create-quote.ts). Kontraktet är detsamma — totalen
 * lagras och rapporteras INKLUSIVE moms — men momsbeloppet skickas via extra,
 * medan byggaren äger nummer/token/rader.
 */
test('deal-flow lagrar offertens total inklusive moms i standardschemat', () => {
  expect(quoteGeneration).toContain('const vatAmount = Math.round(subtotal * 0.25 * 100) / 100')
  expect(quoteGeneration).toContain('const total = Math.round((subtotal + vatAmount) * 100) / 100')
  expect(quoteGeneration).toContain('vat_amount: vatAmount')
  expect(quoteGeneration).not.toMatch(/\n\s+vat:/)
  expect(quoteGeneration).not.toContain('total_with_vat')
})

test('deal-flow skapar via den kanoniska byggaren, med rader', () => {
  // Utan byggaren fick deal-offerten varken nummer, sign_token eller rader
  // i quote_items — PDF:en blev tom.
  expect(quoteGeneration).toContain('createCanonicalQuote(')
  expect(quoteGeneration).toMatch(/items: items\.map/)
})

test('deal-flow rapporterar samma inklusive-moms-total som den lagrar', () => {
  expect(quoteGeneration).toContain('${Math.round(total)} kr inkl moms')
  expect(quoteGeneration).toContain('data: { quote_id: skapad.quoteId, total }')
})
