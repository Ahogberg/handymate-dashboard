import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// FAS 1 (offert-omtaget, 2026-08-31): orkestratorn flyttade från
// app/dashboard/quotes/new/page.tsx (nu en tunn wrapper) till
// app/dashboard/quotes/_shared/QuoteBuilder.tsx. dealIdFromQuery/
// leadIdFromQuery och deal-lookupen lever OFÖRÄNDRADE där. Payload-
// byggandet (deal_id/lead_id in i POST-bodyn) flyttade separat till
// buildQuotePayload.ts — se den andra testfunktionen nedan.
const source = fs.readFileSync(
  path.resolve(__dirname, '../app/dashboard/quotes/_shared/QuoteBuilder.tsx'),
  'utf8',
)
const payloadSource = fs.readFileSync(
  path.resolve(__dirname, '../app/dashboard/quotes/_shared/buildQuotePayload.ts'),
  'utf8',
)

test('ny offert håller lead- och deal-kopplingar åtskilda', () => {
  expect(source).toContain("const dealIdFromQuery = searchParams?.get('deal_id') || null")
  expect(source).toContain("const leadIdFromQuery = searchParams?.get('lead_id') || null")
  expect(source).not.toMatch(/dealIdFromQuery\s*=.*get\('lead_id'\)/)
  // dealIdFromQuery/leadIdFromQuery flödar in i getContext() (camelCase,
  // QuoteBuilder.tsx) och sedan ut i POST-bodyn (snake_case,
  // buildQuotePayload.ts) — aldrig ihopblandade i endera ledet.
  expect(source).toMatch(/dealId:\s*dealIdFromQuery,[\s\S]*leadId:\s*leadIdFromQuery/)
  expect(payloadSource).toMatch(/deal_id:\s*input\.dealId,[\s\S]*lead_id:\s*input\.leadId/)
})

test('lead-id skickas aldrig till deal-API:t', () => {
  expect(source).toContain("const dealId = searchParams?.get('deal_id')")
  expect(source).not.toMatch(/const dealId\s*=.*get\('lead_id'\)/)
  expect(source).toContain('fetchDealAndPrefill(dealId, !!customerId)')
})
