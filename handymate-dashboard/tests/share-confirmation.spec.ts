import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('seedad ROT-andel kräver synlig bekräftelse och sparas som owner', () => {
  const editor = fs.readFileSync(path.join(__dirname, '../components/quotes/document/RowEditSheet.tsx'), 'utf8')
  expect(editor).toContain("share_source === 'seed'")
  expect(editor).toContain('Bekräfta fördelningen')
  expect(editor).toContain("share_source: 'owner'")
  expect(editor).toContain('share_confirmed_at: confirmedAt')
  expect(editor).toContain('Arbete {shareLaborPct} % av')
})

test('artikel-API:t tidsstämplar ändrad andel och validerar summan', () => {
  const api = fs.readFileSync(path.join(__dirname, '../app/api/products/route.ts'), 'utf8')
  expect(api).toContain('invalidSharePair')
  expect(api).toContain("updates.share_source = body.share_source ?? 'owner'")
  expect(api).toContain('updates.share_confirmed_at')
})
