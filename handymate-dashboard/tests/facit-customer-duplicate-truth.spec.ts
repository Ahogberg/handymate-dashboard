/**
 * Facit: "Skapa ändå" lovar bara det den kan hålla (2026-08-27).
 *
 * Hittat av Golden Path Station 3: med en befintlig kund på samma telefon-
 * nummer gav force_create ett 500 (unique_phone_per_business) och dialogen
 * stod kvar utan förklaring. Nu: backend svarar 409 phone_taken med klar-
 * språk, sidan visar det, och dialogen visar inte "Skapa ändå" alls när
 * matchen är på telefon.
 *
 *   npx playwright test tests/facit-customer-duplicate-truth.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test('create_customer: unik-constraint på telefon blir ett ärligt 409 phone_taken, inte ett 500', () => {
  const s = kod('app/api/actions/route.ts')
  const skapa = s.slice(s.indexOf("case 'create_customer':"), s.indexOf("case 'update_customer':"))
  expect(skapa).toContain("error.message.includes('unique_phone_per_business')")
  expect(skapa).toContain("error: 'phone_taken'")
  expect(skapa).toContain('{ status: 409 }')
  // Andra fel kastas fortfarande — inget sväljs
  expect(skapa).toContain('throw error')
})

test('kundsidan visar phone_taken-beskedet och lämnar dialogen öppen', () => {
  const s = kod('app/dashboard/customers/page.tsx')
  expect(s).toContain("if (errBody?.error === 'phone_taken') {")
  const gren = s.slice(s.indexOf("if (errBody?.error === 'phone_taken') {"), s.indexOf("if (!response.ok) throw new Error('Något gick fel')"))
  expect(gren).toContain("showToast(errBody.message")
  expect(gren).not.toContain('setDuplicateConflict(null)')
})

test('dialogen visar inte "Skapa ändå" när matchen är på telefon', () => {
  const s = kod('app/dashboard/customers/components/DuplicateConflictModal.tsx')
  expect(s).toContain("const phoneBlocked = duplicates.some(d => d.match_type === 'phone')")
  expect(s).toContain('{!phoneBlocked && (')
  expect(s).toContain('Samma telefonnummer kan inte finnas på två kunder')
})
