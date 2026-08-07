import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, '../app/dashboard/quotes/new/page.tsx'), 'utf8')

test('ny offert håller lead- och deal-kopplingar åtskilda', () => {
  expect(source).toContain("const dealIdFromQuery = searchParams?.get('deal_id') || null")
  expect(source).toContain("const leadIdFromQuery = searchParams?.get('lead_id') || null")
  expect(source).not.toMatch(/dealIdFromQuery\s*=.*get\('lead_id'\)/)
  expect(source).toMatch(/deal_id:\s*dealIdFromQuery,[\s\S]*lead_id:\s*leadIdFromQuery/)
})

test('lead-id skickas aldrig till deal-API:t', () => {
  expect(source).toContain("const dealId = searchParams?.get('deal_id')")
  expect(source).not.toMatch(/const dealId\s*=.*get\('lead_id'\)/)
  expect(source).toContain('fetchDealAndPrefill(dealId, !!customerId)')
})
