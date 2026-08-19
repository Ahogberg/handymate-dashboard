/**
 * Facit för OperatingExperiment Etapp 1 (Adaptive Business Twin,
 * Lars-piloten, docs/council/ACTIVE_ROADMAP.md "Läge 2026-08-19").
 *
 * Låst här:
 *   - de fyra sanningsnivåerna, exakt fyra.
 *   - den slutna måttuppsättningen — ett nytt/okänt mått är ett
 *     kompileringsfel (never-check), inte en körtidsavvikelse.
 *   - deriveExperimentVerdict/deriveBuildStart/buildExperimentMeasurement
 *     — ren kärna, inga mocks.
 *   - measureExperiment — fail-safe I/O, fakeSupabase (samma mönster som
 *     tests/checkpoint-outcomes.spec.ts).
 *   - källskanningar: läs-only (inga .insert/.update/.upsert i
 *     measure.ts), verdict-unionen fri från värdeord, eligibility-
 *     respekten (marginal/extra_timmar/materialavvikelser kräver rätt
 *     eligibility-flagga i koden), frozen_summary har ingen skrivväg än,
 *     kausalitetsbanet gäller hela lib/experiment/, v157 har rätt
 *     CHECK-constraints/RLS/inga dynamiska tabellnamn.
 *
 * Körs: npx playwright test tests/operating-experiment.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  EXPERIMENT_TRUTH_LEVELS,
  isExperimentTruthLevel,
  EXPERIMENT_MEASURE_KEYS,
  isExperimentMeasureKey,
  EXPERIMENT_MIN_COMPARABLE_DEFAULT,
  EXPERIMENT_MAX_PROJECTS_CAP,
  type ExperimentTruthLevel,
  type ExperimentMeasureKey,
} from '../lib/experiment/types'
import {
  buildExperimentMeasurement,
  deriveExperimentVerdict,
  deriveBuildStart,
  measureExperiment,
  type ExperimentOutcomeInput,
  type MeasurableExperiment,
  type ExperimentVerdict,
} from '../lib/experiment/measure'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// Fake Supabase — samma köbaserade mönster som tests/checkpoint-
// outcomes.spec.ts: en kö av svar per .from()-anrop, i ordningen koden
// faktiskt frågar.
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

function baseExperiment(over: Partial<MeasurableExperiment> = {}): MeasurableExperiment {
  return {
    id: 'exp_test',
    business_id: 'biz_test',
    enrolled_project_ids: ['proj_1'],
    measures: ['marginal'],
    min_comparable_projects: 3,
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────
// De fyra sanningsnivåerna
// ─────────────────────────────────────────────────────────────────

test.describe('sanningsnivåerna', () => {
  test('exakt fyra nivåer, i den beslutade ordningen', () => {
    expect(EXPERIMENT_TRUTH_LEVELS).toEqual(['observation', 'hypotes', 'avgransat_forsok', 'bekraftad_regel'])
    expect(EXPERIMENT_TRUTH_LEVELS.length).toBe(4)
  })

  test('isExperimentTruthLevel accepterar bara de fyra', () => {
    for (const level of EXPERIMENT_TRUTH_LEVELS) expect(isExperimentTruthLevel(level)).toBe(true)
    expect(isExperimentTruthLevel('bekraftad')).toBe(false)
    expect(isExperimentTruthLevel('fakta')).toBe(false)
    expect(isExperimentTruthLevel(null)).toBe(false)
  })

  test('kompilatorbevis — en femte nivå är ett typfel', () => {
    function assertNever(x: never): never { throw new Error('unreachable: ' + String(x)) }
    function exhaustive(level: ExperimentTruthLevel): string {
      switch (level) {
        case 'observation': return 'a'
        case 'hypotes': return 'b'
        case 'avgransat_forsok': return 'c'
        case 'bekraftad_regel': return 'd'
        default: return assertNever(level)
      }
    }
    expect(typeof exhaustive).toBe('function')
  })
})

// ─────────────────────────────────────────────────────────────────
// Den slutna måttuppsättningen
// ─────────────────────────────────────────────────────────────────

test.describe('måttuppsättningen — sluten', () => {
  test('exakt sex mått', () => {
    expect(EXPERIMENT_MEASURE_KEYS).toEqual([
      'sena_andringar', 'marginal', 'extra_timmar', 'faktureringstid', 'forseningar', 'materialavvikelser',
    ])
  })

  test('isExperimentMeasureKey accepterar bara de sex', () => {
    for (const m of EXPERIMENT_MEASURE_KEYS) expect(isExperimentMeasureKey(m)).toBe(true)
    expect(isExperimentMeasureKey('kundnojdhet')).toBe(false)
    expect(isExperimentMeasureKey(undefined)).toBe(false)
  })

  test('kompilatorbevis — ett okänt mått är ett typfel (never-check)', () => {
    function assertNever(x: never): never { throw new Error('unreachable: ' + String(x)) }
    function exhaustive(measure: ExperimentMeasureKey): string {
      switch (measure) {
        case 'sena_andringar': return 'a'
        case 'marginal': return 'b'
        case 'extra_timmar': return 'c'
        case 'faktureringstid': return 'd'
        case 'forseningar': return 'e'
        case 'materialavvikelser': return 'f'
        default: return assertNever(measure)
      }
    }
    expect(typeof exhaustive).toBe('function')
  })

  test('namngivna konstanter — förhandsgissningar, dokumenterat beslutsdatum', () => {
    expect(EXPERIMENT_MIN_COMPARABLE_DEFAULT).toBe(3)
    expect(EXPERIMENT_MAX_PROJECTS_CAP).toBe(5)
    const src = read('lib/experiment/types.ts')
    expect(src).toContain('förhandsgissning 2026-08-19')
  })
})

// ─────────────────────────────────────────────────────────────────
// deriveExperimentVerdict — aldrig ett värdeord
// ─────────────────────────────────────────────────────────────────

test.describe('deriveExperimentVerdict', () => {
  test('under min_comparable_projects → for_tidigt', () => {
    expect(deriveExperimentVerdict(0, 3)).toBe('for_tidigt')
    expect(deriveExperimentVerdict(2, 3)).toBe('for_tidigt')
  })

  test('vid eller över min_comparable_projects → underlag_finns', () => {
    expect(deriveExperimentVerdict(3, 3)).toBe('underlag_finns')
    expect(deriveExperimentVerdict(9, 3)).toBe('underlag_finns')
  })

  test('källskanning — ExperimentVerdict-unionen innehåller aldrig ett värdeord', () => {
    const src = read('lib/experiment/measure.ts')
    const verdictTypeMatch = src.match(/export type ExperimentVerdict =[^\n]+/)
    expect(verdictTypeMatch).not.toBeNull()
    const verdictLine = verdictTypeMatch![0]
    for (const varde of ['battre', 'bättre', 'samre', 'sämre', 'fungerar', 'success', 'lyckad', 'misslyckad']) {
      expect(verdictLine.toLowerCase()).not.toContain(varde)
    }
    // Kompilatorbevis: unionen har exakt de två tillåtna medlemmarna.
    const v1: ExperimentVerdict = 'for_tidigt'
    const v2: ExperimentVerdict = 'underlag_finns'
    expect([v1, v2]).toEqual(['for_tidigt', 'underlag_finns'])
  })
})

// ─────────────────────────────────────────────────────────────────
// deriveBuildStart — ren funktion
// ─────────────────────────────────────────────────────────────────

test.describe('deriveBuildStart', () => {
  test('tar ps-03-postens entered_at när den finns', () => {
    const history = [
      { stage_id: 'ps-01', entered_at: '2026-06-01T08:00:00.000Z' },
      { stage_id: 'ps-03', entered_at: '2026-06-05T08:00:00.000Z' },
    ]
    expect(deriveBuildStart(history, null)).toBe('2026-06-05T08:00:00.000Z')
  })

  test('tar den TIDIGASTE ps-03-posten om flera finns (t.ex. en omstart)', () => {
    const history = [
      { stage_id: 'ps-03', entered_at: '2026-06-10T08:00:00.000Z' },
      { stage_id: 'ps-03', entered_at: '2026-06-05T08:00:00.000Z' },
    ]
    expect(deriveBuildStart(history, null)).toBe('2026-06-05T08:00:00.000Z')
  })

  test('faller tillbaka på tidigaste time_entry när ps-03 saknas', () => {
    expect(deriveBuildStart([], '2026-06-02')).toBe('2026-06-02')
    expect(deriveBuildStart(null, '2026-06-02')).toBe('2026-06-02')
  })

  test('null när varken workflow_stage_history eller time_entry ger svar', () => {
    expect(deriveBuildStart([], null)).toBeNull()
    expect(deriveBuildStart(undefined, null)).toBeNull()
  })

  test('ogiltiga poster (fel stage, saknat/trasigt datum) ignoreras utan att kasta', () => {
    const history = [
      { stage_id: 'ps-02', entered_at: '2026-06-01T08:00:00.000Z' },
      { stage_id: 'ps-03', entered_at: 'inte-ett-datum' },
      { stage_id: 'ps-03' },
      null,
    ]
    expect(deriveBuildStart(history, '2026-06-09')).toBe('2026-06-09')
  })
})

// ─────────────────────────────────────────────────────────────────
// buildExperimentMeasurement — ren kärna
// ─────────────────────────────────────────────────────────────────

function outcome(over: Partial<ExperimentOutcomeInput> = {}): ExperimentOutcomeInput {
  return {
    project_id: 'proj_1',
    closed_at: '2026-07-01T12:00:00.000Z',
    quoted_material_kr: 10000,
    actual_material_billable_kr: 11000,
    hours_diff_pct: 12.5,
    realized_margin_pct: 28.3,
    financial_learning_eligible: true,
    time_learning_eligible: true,
    learning_blockers: [],
    ...over,
  }
}

test.describe('buildExperimentMeasurement — projekt utan fryst utfall', () => {
  test('varje begärt mått visar projektet som ej_bedombar (project_outcome_not_frozen), räknas inte som completed', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['marginal', 'sena_andringar'], min_comparable_projects: 3 },
      outcomes: [],
      projectChanges: [],
      buildStarts: [],
      invoices: [],
      projectDates: [],
    })
    expect(result.projects_enrolled).toBe(1)
    expect(result.projects_completed).toBe(0)
    expect(result.projects_with_sufficient_data).toBe(0)
    for (const m of result.measures) {
      expect(m.values).toEqual([])
      expect(m.ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['project_outcome_not_frozen'] }])
    }
    expect(result.verdict).toBe('for_tidigt')
  })
})

test.describe('buildExperimentMeasurement — marginal', () => {
  test('financial_learning_eligible=true → realized_margin_pct är värdet', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['marginal'], min_comparable_projects: 1 },
      outcomes: [outcome({ realized_margin_pct: 31.2 })],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.measures[0].values).toEqual([{ project_id: 'proj_1', value: 31.2 }])
    expect(result.measures[0].ej_bedombar).toEqual([])
    expect(result.projects_with_sufficient_data).toBe(1)
    expect(result.verdict).toBe('underlag_finns')
  })

  test('financial_learning_eligible=false → ej_bedombar med learning_blockers', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['marginal'], min_comparable_projects: 1 },
      outcomes: [outcome({ financial_learning_eligible: false, learning_blockers: ['labor_cost_incomplete'] })],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.measures[0].values).toEqual([])
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['labor_cost_incomplete'] }])
    expect(result.verdict).toBe('for_tidigt')
  })
})

test.describe('buildExperimentMeasurement — extra_timmar', () => {
  test('time_learning_eligible=true → hours_diff_pct är värdet', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['extra_timmar'], min_comparable_projects: 1 },
      outcomes: [outcome({ hours_diff_pct: -8.1 })],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.measures[0].values).toEqual([{ project_id: 'proj_1', value: -8.1 }])
  })

  test('time_learning_eligible=false → ej_bedombar', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['extra_timmar'], min_comparable_projects: 1 },
      outcomes: [outcome({ time_learning_eligible: false, learning_blockers: ['time_entries_missing'] })],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['time_entries_missing'] }])
  })
})

test.describe('buildExperimentMeasurement — materialavvikelser', () => {
  test('avvikelsen räknas som procent mot offererat material', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['materialavvikelser'], min_comparable_projects: 1 },
      outcomes: [outcome({ quoted_material_kr: 10000, actual_material_billable_kr: 12000 })],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.measures[0].values).toEqual([{ project_id: 'proj_1', value: 20 }])
  })

  test('quoted_material_kr null/0 → ej_bedombar (quoted_material_missing), även när eligible', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['materialavvikelser'], min_comparable_projects: 1 },
      outcomes: [outcome({ quoted_material_kr: null })],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['quoted_material_missing'] }])
  })

  test('financial_learning_eligible=false → ej_bedombar med learning_blockers, oavsett quoted_material_kr', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['materialavvikelser'], min_comparable_projects: 1 },
      outcomes: [outcome({ financial_learning_eligible: false, learning_blockers: ['invoice_missing'] })],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['invoice_missing'] }])
  })
})

test.describe('buildExperimentMeasurement — faktureringstid', () => {
  test('dagar mellan closed_at och tidigaste invoice.sent_at', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['faktureringstid'], min_comparable_projects: 1 },
      outcomes: [outcome({ closed_at: '2026-07-01T00:00:00.000Z' })],
      projectChanges: [], buildStarts: [],
      invoices: [{ project_id: 'proj_1', sent_at: '2026-07-04T00:00:00.000Z' }],
      projectDates: [],
    })
    expect(result.measures[0].values).toEqual([{ project_id: 'proj_1', value: 3 }])
  })

  test('ingen faktura skickad → ej_bedombar (invoice_sent_at_missing)', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['faktureringstid'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [], buildStarts: [],
      invoices: [{ project_id: 'proj_1', sent_at: null }],
      projectDates: [],
    })
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['invoice_sent_at_missing'] }])
  })
})

test.describe('buildExperimentMeasurement — forseningar', () => {
  test('dagar mellan end_date och closed_at (positivt = sent)', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['forseningar'], min_comparable_projects: 1 },
      outcomes: [outcome({ closed_at: '2026-07-10T00:00:00.000Z' })],
      projectChanges: [], buildStarts: [], invoices: [],
      projectDates: [{ project_id: 'proj_1', end_date: '2026-07-05' }],
    })
    expect(result.measures[0].values).toEqual([{ project_id: 'proj_1', value: 5 }])
  })

  test('end_date saknas → ej_bedombar (end_date_missing), aldrig ett gissat datum', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['forseningar'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [], buildStarts: [], invoices: [],
      projectDates: [{ project_id: 'proj_1', end_date: null }],
    })
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['end_date_missing'] }])
  })
})

test.describe('buildExperimentMeasurement — sena_andringar', () => {
  test('räknar bara project_change EFTER byggstart, inte före/vid', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['sena_andringar'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [
        { project_id: 'proj_1', created_at: '2026-06-01T00:00:00.000Z' }, // före
        { project_id: 'proj_1', created_at: '2026-06-05T00:00:00.000Z' }, // = byggstart, räknas inte
        { project_id: 'proj_1', created_at: '2026-06-10T00:00:00.000Z' }, // efter
        { project_id: 'proj_1', created_at: '2026-06-20T00:00:00.000Z' }, // efter
      ],
      buildStarts: [{ project_id: 'proj_1', build_start: '2026-06-05T00:00:00.000Z' }],
      invoices: [], projectDates: [],
    })
    expect(result.measures[0].values).toEqual([{ project_id: 'proj_1', value: 2 }])
  })

  test('byggstart okänd → ej_bedombar (build_start_unknown)', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['sena_andringar'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [],
      buildStarts: [{ project_id: 'proj_1', build_start: null }],
      invoices: [], projectDates: [],
    })
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['build_start_unknown'] }])
  })

  test('noll sena ändringar är ett GILTIGT värde, inte ej_bedombar', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['sena_andringar'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [],
      buildStarts: [{ project_id: 'proj_1', build_start: '2026-06-05T00:00:00.000Z' }],
      invoices: [], projectDates: [],
    })
    expect(result.measures[0].values).toEqual([{ project_id: 'proj_1', value: 0 }])
  })
})

test.describe('buildExperimentMeasurement — projects_with_sufficient_data och verdict', () => {
  test('ett projekt räknas EN gång även om det får värde på flera mått', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['marginal', 'extra_timmar'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.projects_with_sufficient_data).toBe(1)
  })

  test('ett projekt räknas om det får värde på MINST ETT mått, även om ett annat mått är ej_bedombar', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['marginal', 'forseningar'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [], buildStarts: [], invoices: [],
      projectDates: [{ project_id: 'proj_1', end_date: null }],
    })
    expect(result.projects_with_sufficient_data).toBe(1)
    expect(result.verdict).toBe('underlag_finns')
  })

  test('två projekt utan data alls → for_tidigt trots att båda är completed', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1', 'proj_2'], measures: ['marginal'], min_comparable_projects: 2 },
      outcomes: [
        outcome({ project_id: 'proj_1', financial_learning_eligible: false, learning_blockers: ['invoice_missing'] }),
        outcome({ project_id: 'proj_2', financial_learning_eligible: false, learning_blockers: ['invoice_missing'] }),
      ],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.projects_completed).toBe(2)
    expect(result.projects_with_sufficient_data).toBe(0)
    expect(result.verdict).toBe('for_tidigt')
  })
})

test.describe('buildExperimentMeasurement — checkpoint_context', () => {
  test('inte satt när checkpointChecked utelämnas', () => {
    const result = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['marginal'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
    })
    expect(result.checkpoint_context).toBeUndefined()
    expect('checkpoint_context' in result).toBe(false)
  })

  test('rent beskrivande — påverkar inte values/ej_bedombar/verdict', () => {
    const withCtx = buildExperimentMeasurement({
      experiment: { id: 'exp_1', enrolled_project_ids: ['proj_1'], measures: ['marginal'], min_comparable_projects: 1 },
      outcomes: [outcome()],
      projectChanges: [], buildStarts: [], invoices: [], projectDates: [],
      checkpointChecked: { proj_1: false },
    })
    expect(withCtx.checkpoint_context).toEqual([{ project_id: 'proj_1', checkpoint_checked: false }])
    expect(withCtx.measures).toEqual([{ measure: 'marginal', values: [{ project_id: 'proj_1', value: 28.3 }], ej_bedombar: [] }])
    expect(withCtx.verdict).toBe('underlag_finns')
  })
})

// ─────────────────────────────────────────────────────────────────
// measureExperiment — fail-safe I/O
// ─────────────────────────────────────────────────────────────────

test.describe('measureExperiment — fail-safe', () => {
  test('inga inskrivna projekt → degraderad "not_enrolled", inga frågor körs', async () => {
    const { supabase, callCount } = fakeSupabase([])
    const result = await measureExperiment(supabase as any, baseExperiment({ enrolled_project_ids: [] }))
    expect(callCount()).toBe(0)
    expect(result.projects_enrolled).toBe(0)
    expect(result.measures[0].ej_bedombar).toEqual([])
    expect(result.verdict).toBe('for_tidigt')
  })

  test('schema saknas (42P01) → degraderad "read_failed", kastar aldrig', async () => {
    const { supabase } = fakeSupabase([
      { data: null, error: { message: 'relation does not exist', code: '42P01' } },
    ])
    const result = await measureExperiment(supabase as any, baseExperiment())
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['read_failed'] }])
    expect(result.verdict).toBe('for_tidigt')
  })

  test('okänt DB-fel → degraderad "read_failed" och driftlarm rapporteras', async () => {
    const { supabase, tables } = fakeSupabase([
      { data: null, error: { message: 'connection reset' } },
      ok(null), // automation_activity-insert via rapporteraTystFel
    ])
    const result = await measureExperiment(supabase as any, baseExperiment())
    expect(result.measures[0].ej_bedombar).toEqual([{ project_id: 'proj_1', reasons: ['read_failed'] }])
    expect(tables).toContain('automation_activity')
  })

  test('lyckad läsning — mätning stämmer med de fem källorna', async () => {
    const { supabase } = fakeSupabase([
      ok([{ // project_outcome
        project_id: 'proj_1', closed_at: '2026-07-01T00:00:00.000Z',
        quoted_material_kr: 10000, actual_material_billable_kr: 11000,
        hours_diff_pct: 5, realized_margin_pct: 30,
        financial_learning_eligible: true, time_learning_eligible: true, learning_blockers: [],
      }]),
      ok([]), // project_change
      ok([{ project_id: 'proj_1', workflow_stage_history: [{ stage_id: 'ps-03', entered_at: '2026-06-01T00:00:00.000Z' }], end_date: '2026-06-28' }]), // project
      ok([]), // time_entry
      ok([{ project_id: 'proj_1', sent_at: '2026-07-02T00:00:00.000Z' }]), // invoice
    ])
    const result = await measureExperiment(supabase as any, baseExperiment({ measures: ['marginal', 'faktureringstid', 'forseningar'] }))
    expect(result.projects_completed).toBe(1)
    const byMeasure = Object.fromEntries(result.measures.map(m => [m.measure, m.values]))
    expect(byMeasure.marginal).toEqual([{ project_id: 'proj_1', value: 30 }])
    expect(byMeasure.faktureringstid).toEqual([{ project_id: 'proj_1', value: 1 }])
    expect(byMeasure.forseningar).toEqual([{ project_id: 'proj_1', value: 3 }])
  })

  test('kickoff_checkpoint-berikning: inga extra frågor när planned_change_type inte är kickoff_checkpoint', async () => {
    const { supabase, callCount } = fakeSupabase([
      ok([]), ok([]), ok([]), ok([]), ok([]),
    ])
    await measureExperiment(supabase as any, baseExperiment())
    expect(callCount()).toBe(5)
  })

  test('kickoff_checkpoint-berikning: checkpoint-outcomes anropas och tomt svar kraschar inte', async () => {
    const { supabase, callCount } = fakeSupabase([
      ok([]), ok([]), ok([]), ok([]), ok([]),
      ok([]), // pending_approvals (getCheckpointOutcomes) — tom lista, inga fler frågor
    ])
    const result = await measureExperiment(supabase as any, baseExperiment({ planned_change_type: 'kickoff_checkpoint' }))
    expect(callCount()).toBe(6)
    expect(result.checkpoint_context).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanningar
// ─────────────────────────────────────────────────────────────────

test.describe('källskanning — measure.ts är läs-only', () => {
  const src = read('lib/experiment/measure.ts')

  test('ingen .insert(', () => expect(src).not.toContain('.insert('))
  test('ingen .update(', () => expect(src).not.toContain('.update('))
  test('ingen .upsert(', () => expect(src).not.toContain('.upsert('))

  test('rapporteraTystFel är den enda I/O-skrivningen (via driftlarm-helpern, inte ett eget insert)', () => {
    expect(src).toContain('rapporteraTystFel')
  })
})

test.describe('källskanning — eligibility-respekten', () => {
  const src = read('lib/experiment/measure.ts')

  function branch(caseLabel: string): string {
    const start = src.indexOf(`case '${caseLabel}':`)
    expect(start, `case '${caseLabel}' saknas`).toBeGreaterThan(-1)
    const nextCase = src.indexOf("case '", start + 1)
    return src.slice(start, nextCase === -1 ? undefined : nextCase)
  }

  test('marginal kräver financial_learning_eligible', () => {
    expect(branch('marginal')).toContain('financial_learning_eligible')
  })
  test('extra_timmar kräver time_learning_eligible', () => {
    expect(branch('extra_timmar')).toContain('time_learning_eligible')
  })
  test('materialavvikelser kräver financial_learning_eligible', () => {
    expect(branch('materialavvikelser')).toContain('financial_learning_eligible')
  })
})

test.describe('källskanning — frozen_summary har ingen skrivväg i Etapp 1', () => {
  test('operating_experiment skrivs aldrig till i lib/experiment/', () => {
    for (const file of ['types.ts', 'measure.ts']) {
      const src = read(path.join('lib/experiment', file))
      expect(src).not.toContain(".from('operating_experiment')")
    }
  })

  test('frozen_summary nämns bara i typkontraktet (types.ts), aldrig skrivet i measure.ts', () => {
    expect(read('lib/experiment/measure.ts')).not.toContain('frozen_summary')
  })
})

test.describe('källskanning — kausalitetsbanet gäller hela lib/experiment/', () => {
  const dir = path.join(ROOT, 'lib', 'experiment')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'))

  // Superset av de listor huset redan använder (checkpoint-outcomes.spec.ts,
  // mission-learning.spec.ts, mandate-facit.spec.ts, type-maturity.spec.ts)
  // plus uppdragets egna verb — medvetet skriven bara HÄR, aldrig i
  // implementationsfilerna (annars fastnar beskrivningen i sin egen fälla).
  const FORBJUDNA_ORD = [
    'orsakade', 'orsakar', 'gav bättre', 'berodde på', 'beror på',
    'ledde till', 'fick kunden', 'fungerar bäst', 'förbättrar', 'tack vare',
  ]

  expect(files.length).toBeGreaterThan(0)

  for (const file of files) {
    test.describe(`${file}`, () => {
      const src = read(path.join('lib/experiment', file)).toLowerCase()
      for (const ord of FORBJUDNA_ORD) {
        test(`förbjudet ord "${ord}" förekommer inte`, () => {
          expect(src).not.toContain(ord)
        })
      }
    })
  }

  test('filhuvudena dokumenterar kausalitetsdisciplinen uttryckligen', () => {
    const measureSrc = read('lib/experiment/measure.ts').toLowerCase()
    const typesSrc = read('lib/experiment/types.ts').toLowerCase()
    expect(measureSrc).toContain('kausalitet')
    expect(typesSrc).toContain('kausalitet')
  })
})

// ─────────────────────────────────────────────────────────────────
// v157-källskanning
// ─────────────────────────────────────────────────────────────────

test.describe('källskanning — sql/v157_operating_experiment.sql', () => {
  const sql = read('sql/v157_operating_experiment.sql')

  test('CHECK-constraints: no_autonomous_customer_send, sluten måttmängd, statuslivscykel', () => {
    expect(sql).toContain('experiment_guard_rails_no_auto_send')
    expect(sql).toContain("(guard_rails->>'no_autonomous_customer_send')::boolean IS TRUE")
    expect(sql).toContain('experiment_measures_closed_set')
    expect(sql).toContain('experiment_state_check')
    expect(sql).toContain('experiment_owner_decision_check')
    expect(sql).toContain('experiment_frozen_summary_only_when_concluded')
  })

  test('måttlistan i CHECK:en matchar EXPERIMENT_MEASURE_KEYS exakt', () => {
    for (const measure of EXPERIMENT_MEASURE_KEYS) {
      expect(sql).toContain(`"${measure}"`)
    }
  })

  test('RLS: service-role-only, inget till anon/authenticated', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE public.operating_experiment FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT ALL ON TABLE public.operating_experiment TO service_role')
  })

  test('inga dynamiska tabellnamn (ingen EXECUTE/format-konstruktion)', () => {
    expect(sql).not.toContain('EXECUTE')
    expect(sql).not.toContain('format(')
  })

  test('resultat lagras aldrig — inget "results"-fält, bara frozen_summary skrivet en gång', () => {
    expect(sql).not.toMatch(/\bresults\b/)
    expect(sql).toContain('frozen_summary')
  })
})
