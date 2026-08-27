/**
 * "Vad vill du att teamet hjälper dig med först?" — ren modul (Lager 3 / B6).
 *
 *   npx playwright test tests/first-focus.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { FIRST_FOCUS_OPTIONS, firstFocusOption, firstFocusContextLine, isFirstFocusId } from '../lib/onboarding/first-focus'
import { buildFirstMissionPrompt } from '../lib/onboarding/first-mission-handoff'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test('fem alternativ med unika id:n, etikett, agent och promptrad', () => {
  expect(FIRST_FOCUS_OPTIONS).toHaveLength(5)
  expect(new Set(FIRST_FOCUS_OPTIONS.map(o => o.id)).size).toBe(5)
  expect(FIRST_FOCUS_OPTIONS.map(o => o.label)).toEqual([
    'Få betalt snabbare', 'Få in fler jobb', 'Skydda marginalen', 'Minska administrationen', 'Få bättre kontroll på projekten',
  ])
  for (const o of FIRST_FOCUS_OPTIONS) expect(o.promptLine).toMatch(/^Det viktigaste för mig just nu är /)
})

test('okända värden ger null — aldrig ett påhittat fokus', () => {
  expect(isFirstFocusId('betalt_snabbare')).toBe(true)
  expect(isFirstFocusId('x')).toBe(false)
  expect(firstFocusOption(undefined)).toBeNull()
  expect(firstFocusContextLine(42)).toBeNull()
  expect(firstFocusContextLine('fler_jobb')).toBe('Ägarens uttalade fokus: få in fler jobb.')
})

test('första Matte-frågan: fokuset vinner över årsmålet, annars som förut', () => {
  expect(buildFirstMissionPrompt(1_200_000, 'skydda_marginalen'))
    .toBe('Det viktigaste för mig just nu är att skydda marginalen på jobben. Vad är det viktigaste vi kan göra den här veckan?')
  expect(buildFirstMissionPrompt(undefined, 'okänt')).toBe('Vad är det viktigaste vi kan göra den här veckan?')
  expect(buildFirstMissionPrompt(1_200_000, undefined)).toContain('Vi siktar på')
})

test('LiveTouren skickar fokuset; NBA-målkontexten läser det som bakgrundsrad', () => {
  expect(kod('app/onboarding/components/Step6LiveTour.tsx')).toContain('buildFirstMissionPrompt(undefined, data.firstFocus)')
  const nba = kod('lib/jarvis/next-best-action-goals.ts')
  expect(nba).toContain("select('revenue_target_annual_sek, onboarding_data')")
  expect(nba).toContain('firstFocusContextLine(od?.firstFocus ?? od?.first_focus)')
  // Fokuset är bakgrund — aldrig en av spärrarna
  expect(kod('lib/jarvis/next-best-action.ts')).not.toContain('first_focus')
})
