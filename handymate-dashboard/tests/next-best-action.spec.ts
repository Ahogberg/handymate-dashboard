/**
 * Facit för Next Best Action Engine — orkestrering + svar-validering
 * (lib/jarvis/next-best-action.ts, lib/jarvis/next-best-action-prompt.ts,
 * 2026-08-13). Rena funktioner, ingen DB, inget nätverk:
 *
 *   npx playwright test tests/next-best-action.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { byggNextBestAction, nextBestActionId } from '../lib/jarvis/next-best-action'
import { validateModelOutput } from '../lib/jarvis/next-best-action-prompt'
import type { NormalizedCandidate } from '../lib/jarvis/next-best-action-normalize'

test.describe('nextBestActionId — deterministisk primärnyckel', () => {
  test('formatet är nba_{businessId}_{ÅÅÅÅ-MM-DD}', () => {
    expect(nextBestActionId('biz_1', '2026-08-13')).toBe('nba_biz_1_2026-08-13')
  })

  test('samma företag + samma dag ger samma id (dedupe-grunden)', () => {
    expect(nextBestActionId('biz_1', '2026-08-13')).toBe(nextBestActionId('biz_1', '2026-08-13'))
  })

  test('olika dag ger olika id', () => {
    expect(nextBestActionId('biz_1', '2026-08-13')).not.toBe(nextBestActionId('biz_1', '2026-08-14'))
  })
})

const CAND_A: NormalizedCandidate = {
  approval_id: 'appr_a',
  approval_type: 'invoice_reminder',
  title: 'Påminnelse — Andersson',
  age_days: 1,
  financial_impact_kr: 4800,
  financial_impact_kind: 'KÄNT',
  urgency_note: '3 dagar försenad',
  project_or_customer: 'Andersson',
}
const CAND_B: NormalizedCandidate = {
  approval_id: 'appr_b',
  approval_type: 'quote_nudge',
  title: 'Nudge — Svensson',
  age_days: 2,
  financial_impact_kr: 280000,
  financial_impact_kind: 'KÄNT',
  urgency_note: null,
  project_or_customer: 'Svensson',
}

test.describe('validateModelOutput', () => {
  const ids = ['appr_a', 'appr_b']
  const giltigt = {
    top_pick_approval_id: 'appr_b',
    reasoning: 'Offerten är värd mest och riskerar att kallna.',
    principles_applied: ['En obesvarad offert över 100 000 kr väger tyngst.'],
    ranked: [
      { approval_id: 'appr_b', rationale: 'Störst värde, riskerar att kallna.' },
      { approval_id: 'appr_a', rationale: 'Mindre belopp, kan vänta en dag.' },
    ],
  }

  test('ett korrekt format godkänns', () => {
    expect(validateModelOutput(giltigt, ids)).not.toBeNull()
  })

  test('top_pick_approval_id utanför kandidatmängden avvisas', () => {
    expect(validateModelOutput({ ...giltigt, top_pick_approval_id: 'appr_okänd' }, ids)).toBeNull()
  })

  test('ranked som saknar en kandidat avvisas', () => {
    const trasigt = { ...giltigt, ranked: [giltigt.ranked[0]] }
    expect(validateModelOutput(trasigt, ids)).toBeNull()
  })

  test('ranked med en kandidat dubbelt (och en saknad) avvisas', () => {
    const trasigt = { ...giltigt, ranked: [giltigt.ranked[0], giltigt.ranked[0]] }
    expect(validateModelOutput(trasigt, ids)).toBeNull()
  })

  test('topplatsen i ranked måste matcha top_pick_approval_id', () => {
    const trasigt = { ...giltigt, ranked: [giltigt.ranked[1], giltigt.ranked[0]] }
    expect(validateModelOutput(trasigt, ids)).toBeNull()
  })

  test('tomt reasoning avvisas', () => {
    expect(validateModelOutput({ ...giltigt, reasoning: '  ' }, ids)).toBeNull()
  })

  test('tom principles_applied är ett giltigt svar (ingen princip avgjorde)', () => {
    const utanPrincip = { ...giltigt, principles_applied: [] }
    expect(validateModelOutput(utanPrincip, ids)).not.toBeNull()
  })

  test('saknat ranked-fält avvisas hellre än att tvingas till en tom lista', () => {
    const { ranked, ...utanRanked } = giltigt
    expect(validateModelOutput(utanRanked, ids)).toBeNull()
  })

  test('helt fel form (t.ex. en array istället för objekt) avvisas', () => {
    expect(validateModelOutput([giltigt], ids)).toBeNull()
  })
})

test.describe('byggNextBestAction', () => {
  test('slår ihop normaliserade kandidater med modellsvaret till en sparbar rad', () => {
    const nba = byggNextBestAction({
      businessId: 'biz_1',
      computedDate: '2026-08-13',
      candidates: [CAND_A, CAND_B],
      modelOutput: {
        top_pick_approval_id: 'appr_b',
        reasoning: 'Offerten är värd mest.',
        principles_applied: ['En obesvarad offert över 100 000 kr väger tyngst.'],
        ranked: [
          { approval_id: 'appr_b', rationale: 'Störst värde.' },
          { approval_id: 'appr_a', rationale: 'Kan vänta en dag.' },
        ],
      },
    })

    expect(nba.id).toBe('nba_biz_1_2026-08-13')
    expect(nba.top_approval_id).toBe('appr_b')
    expect(nba.candidate_count).toBe(2)
    expect(nba.ranked_candidates).toHaveLength(2)
    // Ordningen från modellsvaret bevaras, och varje rad bär sin EGEN
    // rationale — inte bara topplatsen — så en fallback till #2 senare
    // återanvänder ett redan skrivet kvitto.
    expect(nba.ranked_candidates[0]).toMatchObject({
      approval_id: 'appr_b',
      approval_type: 'quote_nudge',
      financial_impact_kr: 280000,
      financial_impact_kind: 'KÄNT',
      rationale: 'Störst värde.',
    })
    expect(nba.ranked_candidates[1]).toMatchObject({
      approval_id: 'appr_a',
      rationale: 'Kan vänta en dag.',
    })
  })
})
