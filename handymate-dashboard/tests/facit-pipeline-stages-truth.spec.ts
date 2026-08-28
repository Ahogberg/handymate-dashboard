/**
 * Facit: en seeder för pipeline-steg, och Golden Path läker saknade steg (2026-08-28, avvikelse #35).
 *
 * Bakgrund: lib/seed-defaults.ts skrev pipeline_stage i en gammal form
 * (name/position/color, ingen slug); `position` finns inte i tabellen så
 * insertet föll tyst. Nya konton fick inga steg, Golden Path hittade aldrig
 * 'new_inquiry' → ingen affär för någon lead. 14 av 27 företag i prod stod
 * utan steg.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { DEFAULT_STAGES } from '../lib/pipeline'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test('onboardingens seeder är den kanoniska (ensureDefaultStages) — ingen egen stegform', () => {
  const s = kod('lib/seed-defaults.ts')
  expect(s).toContain("import { ensureDefaultStages } from '@/lib/pipeline'")
  expect(s).toContain('await ensureDefaultStages(businessId)')
  expect(s).not.toMatch(/position: \d/)
  expect(s).not.toContain("from('pipeline_stage').insert(")
})

test('Golden Path seedar stegen när new_inquiry saknas, innan den ger upp', () => {
  const g = kod('lib/leads/golden-path.ts')
  const first = g.indexOf("getStageBySlug(businessId, 'new_inquiry')")
  const heal = g.indexOf('await ensureDefaultStages(businessId)')
  const giveUp = g.indexOf("dealError = 'pipeline_stage \"new_inquiry\" saknas")
  expect(first).toBeGreaterThan(-1)
  expect(heal).toBeGreaterThan(first)
  expect(giveUp).toBeGreaterThan(heal)
})

test('DEFAULT_STAGES bär slug new_inquiry med sort_order — det Golden Path och kanban förväntar sig', () => {
  const ny = DEFAULT_STAGES.find(s => s.slug === 'new_inquiry')
  expect(ny).toBeTruthy()
  expect(ny?.sort_order).toBe(1)
  expect(DEFAULT_STAGES.every(s => typeof s.slug === 'string' && typeof s.sort_order === 'number')).toBe(true)
})
