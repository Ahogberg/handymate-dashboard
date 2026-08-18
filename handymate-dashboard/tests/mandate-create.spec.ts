/**
 * FACIT — lib/mandates/create.ts (Mission Mandates V1, Etapp X: ägarens
 * upplevelse, tasks/jaunty-pondering-hummingbird.md).
 *
 * Ren logik, ingen I/O: vilka typer/mål en plan faktiskt KAN mandateras för
 * (deriveMandateCandidates), konservativa default-tak (deriveDefaultCaps),
 * och den fulla server-sidiga valideringen av ägarens formulär
 * (validateMandateCreateInput) — allowlist-delmängd, mål-delmängd (ALDRIG
 * fritext-mål), tak-intervall (speglar sql/v150s CHECK), och
 * expires_at ≤ uppdragets deadline.
 *
 * Körs: npx playwright test tests/mandate-create.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  deriveMandateCandidates,
  deriveDefaultCaps,
  validateMandateCreateInput,
  MANDATE_TARGET_LIST_KEY,
  MANDATE_DEFAULT_DAILY_CAP,
  MANDATE_DEFAULT_TOTAL_CAP,
  type MandateCandidateType,
} from '../lib/mandates/create'
import type { ValidatedMissionStep } from '../lib/mission/plan-validation'

function step(over: Partial<ValidatedMissionStep> = {}): ValidatedMissionStep {
  return {
    item_id: 'pf_1',
    truth_class: 'indrivningsbart',
    title: 'Faktura 123 — Andersson',
    measure: { kind: 'kr', amountKr: 5000 },
    evidence: { table: 'invoice', ref_id: 'inv_1' },
    agent_key: 'karin',
    approval_type: 'invoice_reminder',
    motivation: 'Förfallen sedan 10 dagar',
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────
// deriveMandateCandidates
// ─────────────────────────────────────────────────────────────────

test.describe('deriveMandateCandidates', () => {
  test('tom plan → tom lista', () => {
    expect(deriveMandateCandidates([])).toEqual([])
  })

  test('steg utan approval_type ignoreras', () => {
    const steps = [step({ approval_type: null })]
    expect(deriveMandateCandidates(steps)).toEqual([])
  })

  test('steg med approval_type UTANFÖR allowlisten (t.ex. missad_intakt) ignoreras', () => {
    const steps = [step({ approval_type: 'missad_intakt', truth_class: 'faktureringsklart' })]
    expect(deriveMandateCandidates(steps)).toEqual([])
  })

  test('ett steg av en allowlistad typ → en kandidat med steget som namngivet mål (ref_id + title)', () => {
    const steps = [step()]
    const result = deriveMandateCandidates(steps)
    expect(result).toEqual([
      { type: 'invoice_reminder', targets: [{ ref_id: 'inv_1', title: 'Faktura 123 — Andersson' }] },
    ])
  })

  test('flera steg av samma typ grupperas under EN kandidat med flera mål', () => {
    const steps = [
      step({ item_id: 'a', evidence: { table: 'invoice', ref_id: 'inv_1' }, title: 'Faktura A' }),
      step({ item_id: 'b', evidence: { table: 'invoice', ref_id: 'inv_2' }, title: 'Faktura B' }),
    ]
    const result = deriveMandateCandidates(steps)
    expect(result).toHaveLength(1)
    expect(result[0].targets).toEqual([
      { ref_id: 'inv_1', title: 'Faktura A' },
      { ref_id: 'inv_2', title: 'Faktura B' },
    ])
  })

  test('blandad plan (allowlistad + ej allowlistad) → bara den allowlistade typen blir en kandidat', () => {
    const steps = [
      step({ item_id: 'a', approval_type: 'invoice_reminder' }),
      step({ item_id: 'b', approval_type: 'missad_intakt', truth_class: 'faktureringsklart' }),
    ]
    const result = deriveMandateCandidates(steps)
    expect(result.map(c => c.type)).toEqual(['invoice_reminder'])
  })

  test('ordningen följer MANDATE_ALLOWED_TYPES, inte planens stegordning', () => {
    const steps = [
      step({ item_id: 'a', approval_type: 'review_request', evidence: { table: 'project', ref_id: 'proj_1' } }),
      step({ item_id: 'b', approval_type: 'invoice_reminder', evidence: { table: 'invoice', ref_id: 'inv_1' } }),
    ]
    const result = deriveMandateCandidates(steps)
    expect(result.map(c => c.type)).toEqual(['invoice_reminder', 'review_request'])
  })

  test('MANDATE_TARGET_LIST_KEY mappar alla fyra typer', () => {
    expect(MANDATE_TARGET_LIST_KEY).toEqual({
      invoice_reminder: 'invoice_ids',
      quote_followup_sms: 'quote_ids',
      booking_reminder: 'booking_ids',
      review_request: 'project_ids',
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// deriveDefaultCaps
// ─────────────────────────────────────────────────────────────────

test.describe('deriveDefaultCaps', () => {
  test('en stor plan (fler mål än defaulten) → standarddefaultarna (5/25)', () => {
    const candidates: MandateCandidateType[] = [
      { type: 'invoice_reminder', targets: Array.from({ length: 40 }, (_, i) => ({ ref_id: `inv_${i}`, title: `F${i}` })) },
    ]
    expect(deriveDefaultCaps(candidates)).toEqual({ daily_cap: MANDATE_DEFAULT_DAILY_CAP, total_cap: MANDATE_DEFAULT_TOTAL_CAP })
  })

  test('en liten plan (färre mål än defaulten) → taken sänks till planens storlek', () => {
    const candidates: MandateCandidateType[] = [
      { type: 'invoice_reminder', targets: [{ ref_id: 'inv_1', title: 'F1' }, { ref_id: 'inv_2', title: 'F2' }] },
    ]
    expect(deriveDefaultCaps(candidates)).toEqual({ daily_cap: 2, total_cap: 2 })
  })

  test('exakt ETT mål → 1/1, aldrig noll', () => {
    const candidates: MandateCandidateType[] = [{ type: 'invoice_reminder', targets: [{ ref_id: 'inv_1', title: 'F1' }] }]
    expect(deriveDefaultCaps(candidates)).toEqual({ daily_cap: 1, total_cap: 1 })
  })

  test('inga kandidater alls → standarddefaultarna (formuläret visas ändå inte, men funktionen kraschar inte)', () => {
    expect(deriveDefaultCaps([])).toEqual({ daily_cap: MANDATE_DEFAULT_DAILY_CAP, total_cap: MANDATE_DEFAULT_TOTAL_CAP })
  })
})

// ─────────────────────────────────────────────────────────────────
// validateMandateCreateInput
// ─────────────────────────────────────────────────────────────────

const CANDIDATES: MandateCandidateType[] = [
  { type: 'invoice_reminder', targets: [{ ref_id: 'inv_1', title: 'Faktura 123' }, { ref_id: 'inv_2', title: 'Faktura 456' }] },
]
const DEADLINE = '2026-09-30'

function validInput(over: Record<string, unknown> = {}) {
  return {
    allowed_action_types: ['invoice_reminder'],
    targets: { invoice_ids: ['inv_1', 'inv_2'] },
    daily_cap: 5,
    total_cap: 20,
    amount_cap_kr: null,
    expires_at: '2026-09-15',
    ...over,
  }
}

test.describe('validateMandateCreateInput — lyckad väg', () => {
  test('giltig indata inom planens gränser → ok:true med normaliserad rad', () => {
    const result = validateMandateCreateInput(validInput(), CANDIDATES, DEADLINE)
    expect(result).toEqual({
      ok: true,
      row: {
        allowed_action_types: ['invoice_reminder'],
        targets: { invoice_ids: ['inv_1', 'inv_2'] },
        daily_cap: 5,
        total_cap: 20,
        amount_cap_kr: null,
        expires_at: '2026-09-15',
      },
    })
  })

  test('delmängd av planens mål för en typ (ägaren väljer bort ett mål) → godkänns', () => {
    const result = validateMandateCreateInput(validInput({ targets: { invoice_ids: ['inv_1'] } }), CANDIDATES, DEADLINE)
    expect(result.ok).toBe(true)
    expect(result.ok && result.row.targets).toEqual({ invoice_ids: ['inv_1'] })
  })

  test('explicit beloppstak > 0 → godkänns', () => {
    const result = validateMandateCreateInput(validInput({ amount_cap_kr: 10000 }), CANDIDATES, DEADLINE)
    expect(result.ok).toBe(true)
    expect(result.ok && result.row.amount_cap_kr).toBe(10000)
  })

  test('expires_at === deadline (gränsvärdet) → godkänns', () => {
    const result = validateMandateCreateInput(validInput({ expires_at: DEADLINE }), CANDIDATES, DEADLINE)
    expect(result.ok).toBe(true)
  })

  test('daily_cap/total_cap på CHECK-gränserna (1 och 25/200) → godkänns', () => {
    const min = validateMandateCreateInput(validInput({ daily_cap: 1, total_cap: 1 }), CANDIDATES, DEADLINE)
    const max = validateMandateCreateInput(validInput({ daily_cap: 25, total_cap: 200 }), CANDIDATES, DEADLINE)
    expect(min.ok).toBe(true)
    expect(max.ok).toBe(true)
  })
})

test.describe('validateMandateCreateInput — varje avvikelse', () => {
  test('inga typer valda → no_types', () => {
    const result = validateMandateCreateInput(validInput({ allowed_action_types: [] }), CANDIDATES, DEADLINE)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('no_types')
  })

  test('påhittad femte typ → bad_type (utanför MANDATE_ALLOWED_TYPES helt)', () => {
    const result = validateMandateCreateInput(validInput({ allowed_action_types: ['proactive_care'] }), CANDIDATES, DEADLINE)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('bad_type')
  })

  test('allowlistad typ som INTE finns i just den här planen → type_not_in_plan', () => {
    const result = validateMandateCreateInput(
      validInput({ allowed_action_types: ['review_request'], targets: { project_ids: ['proj_1'] } }),
      CANDIDATES,
      DEADLINE,
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('type_not_in_plan')
  })

  test('mål utanför planens namngivna lista (aldrig fritext-mål) → target_not_in_plan', () => {
    const result = validateMandateCreateInput(validInput({ targets: { invoice_ids: ['inv_1', 'inv_999'] } }), CANDIDATES, DEADLINE)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('target_not_in_plan')
  })

  test('vald typ men noll mål angivna → no_targets', () => {
    const result = validateMandateCreateInput(validInput({ targets: { invoice_ids: [] } }), CANDIDATES, DEADLINE)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('no_targets')
  })

  test('daily_cap under 1 → bad_daily_cap', () => {
    const result = validateMandateCreateInput(validInput({ daily_cap: 0 }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('bad_daily_cap')
  })

  test('daily_cap över 25 → bad_daily_cap', () => {
    const result = validateMandateCreateInput(validInput({ daily_cap: 26 }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('bad_daily_cap')
  })

  test('total_cap över 200 → bad_total_cap', () => {
    const result = validateMandateCreateInput(validInput({ total_cap: 201 }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('bad_total_cap')
  })

  test('icke-heltal cap → bad_daily_cap/bad_total_cap', () => {
    const result = validateMandateCreateInput(validInput({ daily_cap: 2.5 }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('bad_daily_cap')
  })

  test('beloppstak 0 eller negativt → bad_amount_cap', () => {
    const result = validateMandateCreateInput(validInput({ amount_cap_kr: 0 }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('bad_amount_cap')
  })

  test('ogiltigt datumformat på expires_at → bad_expires', () => {
    const result = validateMandateCreateInput(validInput({ expires_at: 'imorgon' }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('bad_expires')
  })

  test('expires_at EFTER uppdragets deadline → expires_after_deadline', () => {
    const result = validateMandateCreateInput(validInput({ expires_at: '2026-10-01' }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('expires_after_deadline')
  })

  test('expires_at i det förflutna → expires_in_past', () => {
    const result = validateMandateCreateInput(validInput({ expires_at: '2020-01-01' }), CANDIDATES, DEADLINE)
    expect(!result.ok && result.reason).toBe('expires_in_past')
  })
})
