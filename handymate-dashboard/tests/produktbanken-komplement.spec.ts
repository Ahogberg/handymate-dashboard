/**
 * Facit för backfillens komplement-läge (v93-efterspelet, 2026-08-09).
 *
 * Ett konto med andrabransch har redan artiklar — och de kan bära intjänade
 * priser som aldrig får tömmas eller skrivas över. Komplementet lägger
 * ENBART till SKU:er som saknas.
 *
 *   npx playwright test tests/produktbanken-komplement.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const RUTT = 'app/api/admin/backfill-products/route.ts'

test('komplement kräver explicit businessId — aldrig "överallt"', () => {
  const s = kod(RUTT)
  expect(s).toContain('complement && !onlyBusinessId')
  expect(s).toContain('{ status: 400 }')
})

test('bara saknade SKU:er läggs till — befintliga rader rörs aldrig', () => {
  const s = kod(RUTT)
  expect(s).toContain('!harRedan.has(p.sku)')
  // Ingen update/upsert på products — komplementet är insert-only.
  expect(s).not.toMatch(/from\('products'\)[\s\S]{0,120}?\.(update|upsert)\(/)
})

test('komplett sortiment är ett lugnt besked, inte en skrivning', () => {
  const s = kod(RUTT)
  expect(s).toContain('inget saknas — sortimentet är komplett')
})

test('komplementets id-serie kolliderar inte med grundseeden', () => {
  const s = kod(RUTT)
  expect(s).toContain('_c_')
})

test('utan komplement gäller spärren "har redan artiklar" precis som förut', () => {
  const s = kod(RUTT)
  expect(s).toContain("!complement && existing && existing.length > 0")
})
