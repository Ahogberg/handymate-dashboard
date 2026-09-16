import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { invalidSharePair } from '../lib/products/share-validation'

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
  expect(api).toContain('if (body.share_source !== undefined) updates.share_source = body.share_source')
  expect(api).toContain('if (body.share_confirmed_at !== undefined) updates.share_confirmed_at = body.share_confirmed_at')
  expect(api).toContain('share_confirmed_at: body.share_confirmed_at ?? null')
})

test('andelsvalideringen körs med tal, null, gränsvärden och ogiltiga värden', () => {
  expect(invalidSharePair(0.6, 0.4)).toBe(false)
  expect(invalidSharePair(null, 1)).toBe(false)
  expect(invalidSharePair(0.6001, 0.4)).toBe(true)
  expect(invalidSharePair(Number.NaN, 0)).toBe(true)
  expect(invalidSharePair('0.5', 0)).toBe(true)
})
