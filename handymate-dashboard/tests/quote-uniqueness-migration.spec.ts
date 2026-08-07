import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const migration = fs.readFileSync(path.resolve(__dirname, '../sql/v98_quote_number_uniqueness.sql'), 'utf8')

test('offertnummer är unika per tenant och kalenderår', () => {
  expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS quotes_business_year_number_unique/)
  expect(migration).toMatch(/business_id,[\s\S]*EXTRACT\(YEAR FROM created_at AT TIME ZONE 'UTC'\)[\s\S]*quote_number/)
  expect(migration).toContain('HAVING COUNT(*) > 1')
})

test('versionsnummer är unika inom offertfamiljen', () => {
  expect(migration).toMatch(/ADD CONSTRAINT quotes_parent_version_unique[\s\S]*UNIQUE \(parent_quote_id, version_number\)/)
})
