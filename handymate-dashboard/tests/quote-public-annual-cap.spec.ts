import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const quotesRoute = fs.readFileSync(path.resolve(__dirname, '../app/api/quotes/route.ts'), 'utf8')
const publicRoute = fs.readFileSync(path.resolve(__dirname, '../app/api/quotes/public/[token]/route.ts'), 'utf8')

test('offertsparande och publik signering använder samma årstakshjälpare', () => {
  const sharedImport = "@/lib/quotes/apply-annual-cap"
  expect(quotesRoute).toContain(sharedImport)
  expect(publicRoute).toContain(sharedImport)
  expect(publicRoute).toMatch(/const uncapped = calculateQuoteTotals[\s\S]*await applyAnnualCap\([\s\S]*recomputed = \{[\s\S]*rotDeduction: cap\.rotDeduction/)
})
