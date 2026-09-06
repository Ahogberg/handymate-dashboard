import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test('F15: ingen bekräftad reservation utan tilldelat nummer', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/onboarding/components/Step4PhoneNumber.tsx'), 'utf8')
  const start = source.indexOf("phase === 'pending' ? (")
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf("animation: 'ob-pop-in", start)
  expect(end).toBeGreaterThan(start)
  const pending = source.slice(start, end)
  expect(pending).toContain('Inget nummer har kunnat tilldelas ännu')
  expect(pending).toContain('fungerar först när ett nummer har tilldelats')
  expect(pending).toContain('Försök tilldela nummer igen')
  expect(pending).not.toContain('Ditt nummer är reserverat')
  expect(pending).not.toContain('aktiveras i bakgrunden')
})
