import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

test('byggdagbokens header staplas på mobil och får inte trycka ut viewporten', () => {
  // Etapp E1 (2026-09-02, c2aa42e0): dagboken bor i components/projects/diary/
  // DiaryTab.tsx — projektsidan renderar bara <DiaryTab /> under tabbmarkören.
  const page = fs.readFileSync(path.join(ROOT, 'app/dashboard/projects/[id]/page.tsx'), 'utf8')
  const marker = page.indexOf('{/* === TAB: Byggdagbok ===')
  expect(marker).toBeGreaterThan(-1)
  expect(page.slice(marker, marker + 1_000)).toContain('<DiaryTab')

  const diary = fs.readFileSync(path.join(ROOT, 'components/projects/diary/DiaryTab.tsx'), 'utf8')
  const header = diary.indexOf('Byggdagbok {projectName')
  const block = diary.slice(Math.max(0, header - 600), header + 1_200)

  expect(header).toBeGreaterThan(-1)
  expect(block).toContain('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')
  expect(block).toContain('min-w-0 text-lg')
  expect(block).toContain('flex flex-wrap items-center gap-2')
})
