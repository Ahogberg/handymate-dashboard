/**
 * Våg 2a (tasks/value-chain-plan.md) — facit-tester för
 * lib/quotes/suggest-quote-draft.ts.
 *
 * Testar den rena, exporterade gate-funktionen shouldSuggestQuoteDraft.
 * INGEN DB, INGET Supabase, INGET AI-anrop — suggestQuoteDraftForLead
 * (som gör I/O) testas inte här, bara den rena beslutslogiken den bygger
 * på. Samma upplägg som tests/egenkontroll-checklist.spec.ts.
 *
 * Körs: npx playwright test tests/suggest-quote-draft.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  shouldSuggestQuoteDraft,
  QUOTE_DRAFT_SCORE_THRESHOLD,
  QUOTE_DRAFT_MIN_NOTES_LENGTH,
  type LeadForQuoteDraftGate,
} from '../lib/quotes/suggest-quote-draft'

function makeLead(overrides: Partial<LeadForQuoteDraftGate> = {}): LeadForQuoteDraftGate {
  return {
    status: 'qualified',
    score: 70,
    notes: 'Kunden vill byta ut hela badrumsgolvet och sätta nya kakel på väggarna, akut läcka.',
    hasExistingQuote: false,
    hasPendingDraftApproval: false,
    ...overrides,
  }
}

test.describe('shouldSuggestQuoteDraft — gate', () => {
  test('kvalificerad lead med högt score och konkret text → förslag', () => {
    const lead = makeLead({ status: 'qualified', score: 85 })
    expect(shouldSuggestQuoteDraft(lead)).toBe(true)
  })

  test('score exakt på tröskeln → förslag (inklusivt)', () => {
    const lead = makeLead({ score: QUOTE_DRAFT_SCORE_THRESHOLD })
    expect(shouldSuggestQuoteDraft(lead)).toBe(true)
  })

  test('score under tröskeln → nej', () => {
    const lead = makeLead({ score: QUOTE_DRAFT_SCORE_THRESHOLD - 1 })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('score 0 → nej', () => {
    const lead = makeLead({ score: 0 })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('status inte "qualified" (t.ex. "new") → nej trots högt score', () => {
    const lead = makeLead({ status: 'new', score: 95 })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('status "contacted" → nej', () => {
    const lead = makeLead({ status: 'contacted' })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('status "quote_sent" (redan förbi offertsteget) → nej', () => {
    const lead = makeLead({ status: 'quote_sent' })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('status "won"/"lost" → nej', () => {
    expect(shouldSuggestQuoteDraft(makeLead({ status: 'won' }))).toBe(false)
    expect(shouldSuggestQuoteDraft(makeLead({ status: 'lost' }))).toBe(false)
  })

  test('redan en offert kopplad till leaden → nej (dedup vinner även vid högt score)', () => {
    const lead = makeLead({ hasExistingQuote: true })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('redan ett pending create_quote_draft-kort → nej (dedup vinner även vid högt score)', () => {
    const lead = makeLead({ hasPendingDraftApproval: true })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('notes saknas helt (null) → nej, ärlighetsregeln', () => {
    const lead = makeLead({ notes: null })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('notes tom sträng → nej', () => {
    const lead = makeLead({ notes: '' })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('notes bara whitespace → nej (trimmas innan längdkoll)', () => {
    const lead = makeLead({ notes: '        ' })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('notes kortare än minimilängden → nej', () => {
    const lead = makeLead({ notes: 'Badrum'.padEnd(QUOTE_DRAFT_MIN_NOTES_LENGTH - 1, ' x').slice(0, QUOTE_DRAFT_MIN_NOTES_LENGTH - 1) })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('notes exakt på minimilängden (trimmad) → förslag', () => {
    const notes = 'x'.repeat(QUOTE_DRAFT_MIN_NOTES_LENGTH)
    expect(notes.trim().length).toBe(QUOTE_DRAFT_MIN_NOTES_LENGTH)
    const lead = makeLead({ notes })
    expect(shouldSuggestQuoteDraft(lead)).toBe(true)
  })

  test('score null (ogiltig/saknad) → nej, fail-safe', () => {
    const lead = makeLead({ score: null })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('score NaN → nej, fail-safe', () => {
    const lead = makeLead({ score: NaN })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })

  test('null/undefined lead-input → nej, kraschar aldrig', () => {
    expect(shouldSuggestQuoteDraft(null)).toBe(false)
    expect(shouldSuggestQuoteDraft(undefined)).toBe(false)
  })

  test('flera nej-villkor samtidigt → fortfarande bara nej (ingen krasch av kombinationen)', () => {
    const lead = makeLead({
      status: 'new',
      score: 0,
      notes: '',
      hasExistingQuote: true,
      hasPendingDraftApproval: true,
    })
    expect(shouldSuggestQuoteDraft(lead)).toBe(false)
  })
})
