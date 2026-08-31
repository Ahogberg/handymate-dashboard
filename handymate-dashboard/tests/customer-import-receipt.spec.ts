import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CustomerImportReceipt from '../components/customers/CustomerImportReceipt'
import { customerImportTitle, readCustomerImportResult, type CustomerImportResult } from '../lib/customers/import-result'

const partial: CustomerImportResult = {
  total: 5, success: 3, created: 1, updated: 1, unchanged: 1, skipped: 1, failed: 1,
  errors: ['Rad 5: Uppdateringen kunde inte bekräftas.'], importedIds: ['cust_a', 'cust_b'],
}

test('receipt preserves row accounting and distinct customers', () => {
  expect(readCustomerImportResult(partial)).toEqual(partial)
  expect(partial.importedIds.length).toBeLessThan(partial.success)
})

for (const [label, value] of Object.entries({
  legacy: { success: 4, failed: 0, errors: [], importedIds: [] },
  missing: null,
  wrongSuccess: { ...partial, success: 4 },
  wrongTotal: { ...partial, total: 6 },
  negative: { ...partial, failed: -1 },
  fractional: { ...partial, created: 0.5 },
  duplicateIds: { ...partial, importedIds: ['cust_a', 'cust_a'] },
  wrongErrors: { ...partial, errors: [null] },
})) {
  test(`unconfirmed ${label} response is never shown as success`, () => {
    expect(() => readCustomerImportResult(value)).toThrow('Kontrollera kundlistan')
  })
}

test('partial result renders all counts and retry warning, never a blanket success', () => {
  const html = renderToStaticMarkup(createElement(CustomerImportReceipt, { result: partial }))
  for (const label of ['Importen är delvis klar', 'Skapade', 'Uppdaterade', 'Oförändrade', 'Överhoppade', 'Misslyckade', 'Rad 5', 'Rader som redan sparats finns kvar']) {
    expect(html).toContain(label)
  }
  expect(html).not.toContain('Import klar!')
  expect(html).toContain('Det bekräftar inte synk till Fortnox eller aktivering av kundinflödet')
  expect(html).toContain('Inga kundmeddelanden skickas av importen')
})

test('all-failed, unchanged and successful receipts have different headings', () => {
  expect(customerImportTitle({ ...partial, success: 0, created: 0, updated: 0 })).toBe('Importen kunde inte slutföras')
  expect(customerImportTitle({ ...partial, failed: 0, created: 0, updated: 0 })).toBe('Inga kunduppgifter ändrades')
  expect(customerImportTitle({ ...partial, failed: 0 })).toBe('Kundlistan är inläst')
})

test('both CSV surfaces use server result and the same receipt, no local writes', () => {
  for (const file of ['app/dashboard/customers/import/page.tsx', 'app/onboarding/components/StepImportData.tsx']) {
    const source = readFileSync(file, 'utf8')
    expect(source).toContain("fetch('/api/customers/import'")
    expect(source).toContain('readCustomerImportResult(')
    expect(source).toContain('<CustomerImportReceipt result=')
    expect(source).not.toMatch(/\.(?:insert|update)\s*\(/)
    expect(source).toContain('vissa rader kan redan ha sparats')
  }
  const dashboard = readFileSync('app/dashboard/customers/import/page.tsx', 'utf8')
  expect(dashboard).toContain('skip_existing: skipDuplicates')
  expect(dashboard).toContain('importResult.importedIds.length')
  expect(dashboard).not.toContain('Skicka reaktiverings-SMS')
})
