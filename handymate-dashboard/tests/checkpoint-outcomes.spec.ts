/**
 * Facit för lib/playbook/checkpoint-outcomes.ts (Decision Twin,
 * Lars-narrow-slice, tasks/todo.md 2026-08-17).
 *
 * Läsfunktion, ingen skrivning: kedjar godkända playbook_kickoff_suggestion-
 * kort → project_checklist → project → (om stängt) project_outcome, och
 * klassificerar varje rad till en av fyra outcome-vokabulär. Låst här:
 *
 *   - fail-safe: kastar aldrig, degraderar till tom lista vid schemafel
 *     eller annat DB-fel (samma konvention som kickoff-candidates.ts).
 *   - de fyra outcome-klassificeringarna var för sig (unavailable,
 *     inconclusive, verified_clean, verified_flagged).
 *   - summarizeByPattern: ren aggregeringsfunktion, inga mocks.
 *   - källkodsskanning: INGEN kausalitetssträng ("orsakade", "gav bättre",
 *     "berodde på", "ledde till" eller motsvarande) förekommer i filen.
 *
 * Körs: npx playwright test tests/checkpoint-outcomes.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  getCheckpointOutcomes,
  summarizeByPattern,
  type CheckpointOutcomeRow,
} from '../lib/playbook/checkpoint-outcomes'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// Fake Supabase — samma mönster som tests/playbook-kickoff.spec.ts: en kö
// av svar per .from()-anrop, i den ORDNING koden faktiskt frågar. Thenable
// så .eq()/.in()/.select() m.fl. kedjor fungerar utan explicit terminal.
// ─────────────────────────────────────────────────────────────────
type FakeResponse = { data: unknown; error: { message: string; code?: string } | null }

function fakeChain(response: FakeResponse) {
  const promise = Promise.resolve(response) as any
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'order', 'limit', 'in', 'contains', 'is', 'insert']
  for (const m of methods) promise[m] = () => promise
  return promise
}

function fakeSupabase(responses: FakeResponse[]) {
  let calls = 0
  const tables: string[] = []
  const supabase = {
    from(table: string) {
      tables.push(table)
      const response = responses[calls] ?? { data: [], error: null }
      calls++
      return fakeChain(response)
    },
  }
  return { supabase, tables, callCount: () => calls }
}

const ok = (data: unknown): FakeResponse => ({ data, error: null })

/** Bygger en godkänd kickoff-kort-rad med hela artefaktkedjan intakt. */
function kickoffRow(over: Partial<{
  pattern_id: string
  job_type: string
  pattern_text: string
  checklist_id: string
  project_id: string
  resolved_at: string
}> = {}) {
  const v = {
    pattern_id: 'bk_1',
    job_type: 'badrum',
    pattern_text: 'Räkna med en extra dag för rivning',
    checklist_id: 'cl_1',
    project_id: 'proj_1',
    resolved_at: '2026-08-10T09:00:00.000Z',
    ...over,
  }
  return {
    payload: {
      pattern_id: v.pattern_id,
      job_type: v.job_type,
      pattern_text: v.pattern_text,
      execution_result: {
        outcome: 'success',
        artifacts: { checklist_id: v.checklist_id, project_id: v.project_id },
      },
    },
    resolved_at: v.resolved_at,
  }
}

// ─────────────────────────────────────────────────────────────────
// Fail-safe
// ─────────────────────────────────────────────────────────────────

test.describe('getCheckpointOutcomes — fail-safe', () => {
  test('schema saknas (42P01) på första frågan → tom lista, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([
      { data: null, error: { message: 'relation does not exist', code: '42P01' } },
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toEqual([])
  })

  test('okänt DB-fel (inget schema-fel) → tom lista, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([
      { data: null, error: { message: 'connection reset' } },
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toEqual([])
  })

  test('inga godkända kickoff-kort → tom lista, inga fler frågor körs', async () => {
    const { supabase, callCount } = fakeSupabase([ok([])])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toEqual([])
    expect(callCount()).toBe(1)
  })

  test('kort utan execution_result.artifacts hoppas tyst över (aldrig exekverat än)', async () => {
    const rowUtanArtefakter = {
      payload: { pattern_id: 'bk_1', job_type: 'badrum', pattern_text: 'Regel' },
      resolved_at: '2026-08-10T09:00:00.000Z',
    }
    const { supabase, callCount } = fakeSupabase([ok([rowUtanArtefakter])])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toEqual([])
    // Ingen efterföljande query — inget checklist_id/project_id att slå upp.
    expect(callCount()).toBe(1)
  })

  test('funktionen har try/catch runt hela kroppen och använder arSchemaSaknas', () => {
    const kalla = read('lib/playbook/checkpoint-outcomes.ts')
    expect(kalla).toContain('arSchemaSaknas')
    expect(kalla).toContain('try {')
    expect(kalla).toContain('catch (err')
  })

  test('projektfrågan filtrerar på business_id och project_id-listan, samma tenant-disciplin som kickoff-candidates.ts', () => {
    const kalla = read('lib/playbook/checkpoint-outcomes.ts')
    expect(kalla).toContain(".from('project')")
    expect(kalla).toContain(".eq('business_id', businessId)")
  })
})

// ─────────────────────────────────────────────────────────────────
// De fyra outcome-klassificeringarna
// ─────────────────────────────────────────────────────────────────

test.describe('getCheckpointOutcomes — outcome-klassificering', () => {
  test('projekt inte stängt → unavailable', async () => {
    const { supabase } = fakeSupabase([
      ok([kickoffRow()]),
      ok([{ id: 'cl_1', items: [{ id: 'ci_1', text: 'Regel', checked: false }] }]),
      ok([{ project_id: 'proj_1', name: 'Badrum Andersson', status: 'active' }]),
      // Inget project_outcome-anrop görs — inga stängda projekt i chargen.
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].outcome).toBe('unavailable')
    expect(result[0].project_status).toBe('active')
    expect(result[0].checkpoint_checked).toBe(false)
  })

  test('stängt projekt utan fryst project_outcome-rad → inconclusive', async () => {
    const { supabase } = fakeSupabase([
      ok([kickoffRow()]),
      ok([{ id: 'cl_1', items: [{ id: 'ci_1', text: 'Regel', checked: true }] }]),
      ok([{ project_id: 'proj_1', name: 'Badrum Andersson', status: 'completed' }]),
      ok([]), // project_outcome: ingen rad
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].outcome).toBe('inconclusive')
    expect(result[0].checkpoint_checked).toBe(true)
  })

  test('stängt projekt, fryst utfall, inga learning_blockers → verified_clean', async () => {
    const { supabase } = fakeSupabase([
      ok([kickoffRow()]),
      ok([{ id: 'cl_1', items: [{ id: 'ci_1', text: 'Regel', checked: true }] }]),
      ok([{ project_id: 'proj_1', name: 'Badrum Andersson', status: 'completed' }]),
      ok([{ project_id: 'proj_1', learning_blockers: [] }]),
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].outcome).toBe('verified_clean')
  })

  test('stängt projekt, fryst utfall, minst en learning_blocker → verified_flagged', async () => {
    const { supabase } = fakeSupabase([
      ok([kickoffRow()]),
      ok([{ id: 'cl_1', items: [{ id: 'ci_1', text: 'Regel', checked: false }] }]),
      ok([{ project_id: 'proj_1', name: 'Badrum Andersson', status: 'completed' }]),
      ok([{ project_id: 'proj_1', learning_blockers: ['invoice_missing'] }]),
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].outcome).toBe('verified_flagged')
    expect(result[0].checkpoint_checked).toBe(false)
  })

  test('projekt går inte att slå upp (borttaget) → raden utelämnas, kastar inte', async () => {
    const { supabase } = fakeSupabase([
      ok([kickoffRow()]),
      ok([{ id: 'cl_1', items: [{ id: 'ci_1', text: 'Regel', checked: true }] }]),
      ok([]), // project: ingen träff
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toEqual([])
  })

  test('flera kort för samma jobbtyp/mönster kopplas var för sig till sina egna projekt', async () => {
    const { supabase } = fakeSupabase([
      ok([
        kickoffRow({ project_id: 'proj_1', checklist_id: 'cl_1' }),
        kickoffRow({ project_id: 'proj_2', checklist_id: 'cl_2' }),
      ]),
      ok([
        { id: 'cl_1', items: [{ checked: true }] },
        { id: 'cl_2', items: [{ checked: false }] },
      ]),
      ok([
        { project_id: 'proj_1', name: 'Badrum A', status: 'completed' },
        { project_id: 'proj_2', name: 'Badrum B', status: 'completed' },
      ]),
      ok([
        { project_id: 'proj_1', learning_blockers: [] },
        { project_id: 'proj_2', learning_blockers: ['cost_rows_missing'] },
      ]),
    ])
    const result = await getCheckpointOutcomes(supabase as any, 'biz_test')
    expect(result).toHaveLength(2)
    const byProject = Object.fromEntries(result.map(r => [r.project_id, r]))
    expect(byProject.proj_1.outcome).toBe('verified_clean')
    expect(byProject.proj_1.checkpoint_checked).toBe(true)
    expect(byProject.proj_2.outcome).toBe('verified_flagged')
    expect(byProject.proj_2.checkpoint_checked).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// summarizeByPattern — ren funktion, inga mocks
// ─────────────────────────────────────────────────────────────────

test.describe('summarizeByPattern — ren aggregering', () => {
  const row = (over: Partial<CheckpointOutcomeRow> = {}): CheckpointOutcomeRow => ({
    pattern_id: 'bk_1',
    job_type: 'badrum',
    pattern_text: 'Regel',
    project_id: 'proj_1',
    project_name: 'Badrum A',
    approved_at: '2026-08-10T09:00:00.000Z',
    checkpoint_checked: false,
    project_status: 'active',
    outcome: 'unavailable',
    ...over,
  })

  test('tom lista ger tom summering', () => {
    expect(summarizeByPattern([])).toEqual([])
  })

  test('räknar suggested/checked/verified_clean/verified_flagged korrekt för ett mönster', () => {
    const rows = [
      row({ project_id: 'p1', checkpoint_checked: true, outcome: 'verified_clean' }),
      row({ project_id: 'p2', checkpoint_checked: true, outcome: 'verified_flagged' }),
      row({ project_id: 'p3', checkpoint_checked: false, outcome: 'unavailable' }),
      row({ project_id: 'p4', checkpoint_checked: false, outcome: 'inconclusive' }),
    ]
    const summary = summarizeByPattern(rows)
    expect(summary).toEqual([{
      pattern_id: 'bk_1',
      job_type: 'badrum',
      suggested: 4,
      checked: 2,
      verified_clean: 1,
      verified_flagged: 1,
    }])
  })

  test('grupperar per pattern_id — flera mönster ger flera summeringsrader', () => {
    const rows = [
      row({ pattern_id: 'bk_1', job_type: 'badrum', project_id: 'p1', outcome: 'verified_clean', checkpoint_checked: true }),
      row({ pattern_id: 'bk_2', job_type: 'kök', project_id: 'p2', outcome: 'verified_flagged', checkpoint_checked: true }),
    ]
    const summary = summarizeByPattern(rows)
    expect(summary).toHaveLength(2)
    const byId = Object.fromEntries(summary.map(s => [s.pattern_id, s]))
    expect(byId.bk_1).toEqual({ pattern_id: 'bk_1', job_type: 'badrum', suggested: 1, checked: 1, verified_clean: 1, verified_flagged: 0 })
    expect(byId.bk_2).toEqual({ pattern_id: 'bk_2', job_type: 'kök', suggested: 1, checked: 1, verified_clean: 0, verified_flagged: 1 })
  })
})

// ─────────────────────────────────────────────────────────────────
// Källkodsskanning — ingen kausalitet
// ─────────────────────────────────────────────────────────────────

test.describe('checkpoint-outcomes.ts — inget kausalitetspåstående i filen', () => {
  const kalla = read('lib/playbook/checkpoint-outcomes.ts').toLowerCase()

  const forbjudnaOrd = ['orsakade', 'gav bättre', 'berodde på', 'ledde till']

  for (const ord of forbjudnaOrd) {
    test(`förbjudet ord "${ord}" förekommer inte`, () => {
      expect(kalla).not.toContain(ord)
    })
  }

  test('filhuvudet dokumenterar regeln uttryckligen', () => {
    expect(kalla).toContain('kausalitet')
  })
})
