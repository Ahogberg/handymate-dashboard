import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

test('byggdagbokens header staplas på mobil och får inte trycka ut viewporten', () => {
  const page = fs.readFileSync(path.join(ROOT, 'app/dashboard/projects/[id]/page.tsx'), 'utf8')
  const marker = page.indexOf('{/* === TAB: Byggdagbok === */}')
  const block = page.slice(marker, marker + 2_500)

  expect(marker).toBeGreaterThan(-1)
  expect(block).toContain('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')
  expect(block).toContain('min-w-0 text-lg')
  expect(block).toContain('flex flex-wrap items-center gap-2')
})
