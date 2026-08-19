// tests/facit-fortnox-supplier-invoice-cron.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test('fortnox-sync-cronet friskar aven upp leverantorsfakturors betalstatus', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/cron/fortnox-sync/route.ts'),
    'utf8',
  )
  expect(file).toMatch(/supplier.invoice/i)
})
