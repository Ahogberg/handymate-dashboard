import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(
  path.resolve(__dirname, '../app/dashboard/quotes/[id]/edit/page.tsx'),
  'utf8',
)

test('offerteditorn skapar aldrig en ny offert vid navigation', () => {
  expect(source).not.toContain('sendBeacon')
  expect(source).not.toContain('beforeunload')
  expect(source).toContain("method: 'PUT'")
  expect(source).toContain('performAutoSave()')
})
