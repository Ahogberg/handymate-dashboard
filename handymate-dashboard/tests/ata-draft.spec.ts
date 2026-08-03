/**
 * Våg 2b (tasks/value-chain-plan.md) — facit-tester för
 * lib/ata/suggest-ata-draft.ts.
 *
 * Testar den rena, exporterade gate-logiken (shouldSuggestAtaDraft +
 * getAtaDraftGateReason). INGEN DB, INGET Supabase, INGET AI-anrop —
 * suggestAtaDraft() (som gör I/O: dedup-lookup + insert) testas inte här,
 * bara den rena beslutslogiken den bygger på. Samma upplägg som
 * tests/suggest-quote-draft.spec.ts (etapp 2a).
 *
 * Körs: npx playwright test tests/ata-draft.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  shouldSuggestAtaDraft,
  getAtaDraftGateReason,
  ATA_DRAFT_MIN_DESCRIPTION_LENGTH,
  type AtaDraftGateInput,
} from '../lib/ata/suggest-ata-draft'

function makeInput(overrides: Partial<AtaDraftGateInput> = {}): AtaDraftGateInput {
  return {
    projectId: 'proj_123',
    description: 'Kunden vill även ha ett extra eluttag i garaget.',
    hasPendingAtaForProject: false,
    ...overrides,
  }
}

test.describe('shouldSuggestAtaDraft — gate', () => {
  test('projekt utan pending kort + konkret beskrivning → förslag ok', () => {
    expect(shouldSuggestAtaDraft(makeInput())).toBe(true)
  })

  test('redan ett pending create_ata_draft-kort för projektet → nej (dedup vinner)', () => {
    const input = makeInput({ hasPendingAtaForProject: true })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('duplicate')
  })

  test('saknad beskrivning (null) → nej', () => {
    const input = makeInput({ description: null })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('missing_description')
  })

  test('tom beskrivning → nej', () => {
    const input = makeInput({ description: '' })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('missing_description')
  })

  test('beskrivning bara whitespace → nej (trimmas innan längdkoll)', () => {
    const input = makeInput({ description: '        ' })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('missing_description')
  })

  test('beskrivning kortare än minimilängden → nej', () => {
    const input = makeInput({ description: 'x'.repeat(ATA_DRAFT_MIN_DESCRIPTION_LENGTH - 1) })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('missing_description')
  })

  test('beskrivning exakt på minimilängden (trimmad) → förslag', () => {
    const description = 'x'.repeat(ATA_DRAFT_MIN_DESCRIPTION_LENGTH)
    expect(description.trim().length).toBe(ATA_DRAFT_MIN_DESCRIPTION_LENGTH)
    expect(shouldSuggestAtaDraft(makeInput({ description }))).toBe(true)
  })

  test('projekt saknas (null) → nej, även med bra beskrivning', () => {
    const input = makeInput({ projectId: null })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('missing_project')
  })

  test('projekt saknas (undefined) → nej', () => {
    const input = makeInput({ projectId: undefined })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('missing_project')
  })

  test('projekt saknas (tom sträng) → nej', () => {
    const input = makeInput({ projectId: '' })
    expect(shouldSuggestAtaDraft(input)).toBe(false)
    expect(getAtaDraftGateReason(input)).toBe('missing_project')
  })

  test('kontrollordning: saknat projekt vinner även om det ALSO är dedup + tom beskrivning', () => {
    const input = makeInput({ projectId: null, description: '', hasPendingAtaForProject: true })
    expect(getAtaDraftGateReason(input)).toBe('missing_project')
  })

  test('kontrollordning: dedup vinner före beskrivningskoll när projekt finns', () => {
    const input = makeInput({ description: '', hasPendingAtaForProject: true })
    expect(getAtaDraftGateReason(input)).toBe('duplicate')
  })

  test('getAtaDraftGateReason returnerar null när gaten säger ja', () => {
    expect(getAtaDraftGateReason(makeInput())).toBeNull()
  })
})
