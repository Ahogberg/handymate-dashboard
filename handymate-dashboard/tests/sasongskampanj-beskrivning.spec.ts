/**
 * Säsongskampanjkortets underrad — facit (App Store-skärmdump 2026-09-07).
 *
 * Kortet visade "1 kunder · construction · september": segmentnyckeln läckte
 * till kunden på engelska, och numerus var fel. Underraden ska bära den
 * svenska branschetiketten (lib/branch branchLabel) och "kund"/"kunder".
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { branchLabel } from '../lib/branch'

const src = fs.readFileSync(path.join(__dirname, '../lib/seasonality/campaign-generator.ts'), 'utf8')

test('beskrivningen använder branchLabel och rätt numerus, aldrig råa branch-nyckeln', () => {
  expect(src).toMatch(/Till \$\{validCustomers\.length\} \$\{validCustomers\.length === 1 \? 'kund' : 'kunder'\} · \$\{branchLabel\(branch\)\} · /)
  expect(src).not.toMatch(/kunder · \$\{branch\} ·/)
})

test('branchLabel översätter segmentnycklarna kortet faktiskt får', () => {
  expect(branchLabel('construction')).toBe('Bygg')
  expect(branchLabel('electrician')).toBe('El')
  expect(branchLabel('snickeri')).not.toMatch(/^snickeri$/)
})
