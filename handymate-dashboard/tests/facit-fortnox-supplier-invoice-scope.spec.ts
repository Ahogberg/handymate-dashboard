// tests/facit-fortnox-supplier-invoice-scope.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test('Fortnox-scopet inkluderar supplierinvoice', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/integrations/fortnox/connect/route.ts'),
    'utf8',
  )
  const scopeLine = file.match(/const FORTNOX_SCOPES = '([^']+)'/)
  expect(scopeLine).not.toBeNull()
  expect(scopeLine![1].split(' ')).toContain('supplierinvoice')
})
