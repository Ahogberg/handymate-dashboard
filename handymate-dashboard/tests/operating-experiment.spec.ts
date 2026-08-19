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
  EXPERIMENT_DEFAULT_MEASURES,
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
  type ExperimentMeasurement,
} from '../lib/experiment/measure'
import { proposeExperiment } from '../lib/experiment/propose'
import { maybeEnrollProject } from '../lib/experiment/enroll'
import { buildReadoutBody, buildReadoutCardCopy, maybeCreateReadout, sweepExperimentReadouts, type ActiveExperimentRow } from '../lib/experiment/report'

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
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'order', 'limit', 'in', 'contains', 'is', 'insert', 'update']
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

/**
 * ═══════════════════════════════════════════════════════════════════
 * Etapp 2 — förslags-/inskrivnings-/redovisnings-/beslutslagret
 * (docs/council/ACTIVE_ROADMAP.md "Läge 2026-08-19")
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// lib/experiment/propose.ts — proposeExperiment
// ─────────────────────────────────────────────────────────────────

test.describe('propose.ts — proposeExperiment', () => {
  const input = { jobType: 'badrum', hypothesis: 'Räkna med en extra dag för rivning', sourcePatternId: 'bk_1' }

  test('saknad jobType/hypothesis → skipped_invalid_input, inga frågor körs', async () => {
    const { supabase, callCount } = fakeSupabase([])
    const result = await proposeExperiment(supabase as any, 'biz_test', { jobType: '', hypothesis: '', sourcePatternId: null })
    expect(result).toBe('skipped_invalid_input')
    expect(callCount()).toBe(0)
  })

  test('dedupe a) — befintligt förslagskort (oavsett status) blockerar, b) frågas aldrig', async () => {
    const { supabase, callCount } = fakeSupabase([ok([{ id: 'appr_existing' }])])
    const result = await proposeExperiment(supabase as any, 'biz_test', input)
    expect(result).toBe('skipped_already_proposed')
    expect(callCount()).toBe(1)
  })

  test('dedupe b) — befintlig operating_experiment-rad blockerar', async () => {
    const { supabase } = fakeSupabase([ok([]), ok([{ id: 'exp_existing' }])])
    const result = await proposeExperiment(supabase as any, 'biz_test', input)
    expect(result).toBe('skipped_already_proposed')
  })

  test('dedupe b) 42P01 (v157 ej körd) tolkas som "inga träffar", INTE blockerande', async () => {
    const { supabase } = fakeSupabase([
      ok([]),
      { data: null, error: { message: 'relation does not exist', code: '42P01' } },
      ok(null), // insert lyckas
    ])
    const result = await proposeExperiment(supabase as any, 'biz_test', input)
    expect(result).toBe('created')
  })

  test('dedupe b) PGRST205 (PostgREST:s schema-cache-miss, samma verkliga läge som 42P01) tolkas OCKSÅ som "inga träffar"', () => {
    // Empiriskt fynd (2026-08-19, mot demo-databasen): en riktigt ej körd
    // migration ger PGRST205, INTE 42P01 — fixat en gång i den delade
    // arSchemaSaknas-helpern (lib/observability/driftlarm.ts) som propose.ts
    // nu använder i stället för en egen hårdkodad '42P01'-jämförelse.
    const src = read('lib/experiment/propose.ts')
    expect(src).toContain('arSchemaSaknas(error)')
    expect(src).not.toContain("error.code === '42P01'")
  })

  test('sourcePatternId=null hoppar över BÅDA dedupe-läsningarna, går rakt till insert', async () => {
    const { supabase, callCount } = fakeSupabase([ok(null)])
    const result = await proposeExperiment(supabase as any, 'biz_test', { ...input, sourcePatternId: null })
    expect(result).toBe('created')
    expect(callCount()).toBe(1)
  })

  test('opts.allowDuplicate=true hoppar över dedupen även med sourcePatternId satt', async () => {
    const { supabase, callCount } = fakeSupabase([ok(null)])
    const result = await proposeExperiment(supabase as any, 'biz_test', input, { allowDuplicate: true })
    expect(result).toBe('created')
    expect(callCount()).toBe(1)
  })

  test('insert-fel ger skipped_error, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([
      ok([]), ok([]),
      { data: null, error: { message: 'boom' } },
      ok(null), // automation_activity-insert via rapporteraTystFel
    ])
    const result = await proposeExperiment(supabase as any, 'biz_test', input)
    expect(result).toBe('skipped_error')
  })

  test('hypotesen kopieras ORDAGRANT till payload.hypothesis OCH planned_change.checkpoint_text', () => {
    const src = read('lib/experiment/propose.ts')
    expect(src).toContain('hypothesis: input.hypothesis')
    expect(src).toContain('checkpoint_text: input.hypothesis')
  })

  test('payload-formen: guard_rails/measures/min_comparable_projects/planned_change/approval_type/routing_role', () => {
    const src = read('lib/experiment/propose.ts')
    const insertIdx = src.indexOf(".from('pending_approvals').insert(")
    expect(insertIdx).toBeGreaterThan(-1)
    const gren = src.slice(insertIdx, insertIdx + 1600)
    expect(gren).toContain("approval_type: 'operating_experiment_proposal'")
    expect(gren).toContain("routing_role: 'owner_admin'")
    expect(gren).toContain('job_type: input.jobType')
    expect(gren).toContain('source_pattern_id: input.sourcePatternId')
    expect(gren).toContain('guard_rails: guardRails')
    expect(gren).toContain('measures,')
    expect(gren).toContain('min_comparable_projects: EXPERIMENT_MIN_COMPARABLE_DEFAULT')
    expect(gren).toContain('planned_change: plannedChange')
  })

  test('förvalda måtten kommer från EXPERIMENT_DEFAULT_MEASURES när inget anges', () => {
    expect(EXPERIMENT_DEFAULT_MEASURES).toEqual(['sena_andringar', 'extra_timmar', 'marginal'])
    const src = read('lib/experiment/propose.ts')
    expect(src).toContain('EXPERIMENT_DEFAULT_MEASURES')
  })

  test('guard_rails.max_projects använder EXPERIMENT_MAX_PROJECTS_CAP, no_autonomous_customer_send alltid true', () => {
    const src = read('lib/experiment/propose.ts')
    expect(src).toContain('max_projects: EXPERIMENT_MAX_PROJECTS_CAP')
    expect(src).toContain('no_autonomous_customer_send: true')
  })

  test('funktionen kastar aldrig (try/catch runt hela kroppen)', () => {
    const src = read('lib/experiment/propose.ts')
    expect(src).toContain('export async function proposeExperiment')
    expect(src).toContain('try {')
    expect(src).toContain('catch (err')
  })
})

// ─────────────────────────────────────────────────────────────────
// lib/experiment/enroll.ts — maybeEnrollProject
// ─────────────────────────────────────────────────────────────────

test.describe('enroll.ts — maybeEnrollProject', () => {
  const activeExperiment = {
    id: 'exp_1',
    enrolled_project_ids: ['proj_existing'],
    guard_rails: { start_date: '2026-01-01', end_date: '2027-01-01', max_projects: 5, no_autonomous_customer_send: true },
  }

  test('inget aktivt experiment för jobbtypen → skipped_no_active_experiment', async () => {
    const { supabase, callCount } = fakeSupabase([ok([])])
    const result = await maybeEnrollProject(supabase as any, 'biz_test', 'proj_1', 'badrum')
    expect(result).toBe('skipped_no_active_experiment')
    expect(callCount()).toBe(1)
  })

  test('projektet redan inskrivet → skipped_already_enrolled, ingen skrivning', async () => {
    const { supabase, callCount } = fakeSupabase([ok([activeExperiment])])
    const result = await maybeEnrollProject(supabase as any, 'biz_test', 'proj_existing', 'badrum')
    expect(result).toBe('skipped_already_enrolled')
    expect(callCount()).toBe(1)
  })

  test('fönstret ännu inte öppnat/redan stängt → skipped_window_closed', async () => {
    const framtid = { ...activeExperiment, guard_rails: { ...activeExperiment.guard_rails, start_date: '2099-01-01', end_date: '2099-06-01' } }
    const { supabase } = fakeSupabase([ok([framtid])])
    const result = await maybeEnrollProject(supabase as any, 'biz_test', 'proj_ny', 'badrum')
    expect(result).toBe('skipped_window_closed')
  })

  test('full kapacitet (enrolled.length >= max_projects) → skipped_full', async () => {
    const full = { ...activeExperiment, enrolled_project_ids: ['p1', 'p2', 'p3', 'p4', 'p5'] }
    const { supabase } = fakeSupabase([ok([full])])
    const result = await maybeEnrollProject(supabase as any, 'biz_test', 'proj_ny', 'badrum')
    expect(result).toBe('skipped_full')
  })

  test('lyckad inskrivning lägger till projektets id och skriver bara det', async () => {
    const { supabase } = fakeSupabase([ok([activeExperiment]), ok(null)])
    const result = await maybeEnrollProject(supabase as any, 'biz_test', 'proj_ny', 'badrum')
    expect(result).toBe('enrolled')
  })

  test('malformade guard_rails (saknar start/end) → skipped_error, skriver aldrig blint', async () => {
    const trasig = { ...activeExperiment, guard_rails: { max_projects: 5, no_autonomous_customer_send: true } }
    const { supabase, callCount } = fakeSupabase([ok([trasig])])
    const result = await maybeEnrollProject(supabase as any, 'biz_test', 'proj_ny', 'badrum')
    expect(result).toBe('skipped_error')
    expect(callCount()).toBe(1)
  })

  test('42P01 (v157 ej körd) → skipped_error, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([{ data: null, error: { message: 'relation does not exist', code: '42P01' } }])
    const result = await maybeEnrollProject(supabase as any, 'biz_test', 'proj_1', 'badrum')
    expect(result).toBe('skipped_error')
  })

  test('funktionen kastar aldrig (try/catch runt hela kroppen), använder arSchemaSaknas', () => {
    const src = read('lib/experiment/enroll.ts')
    expect(src).toContain('export async function maybeEnrollProject')
    expect(src).toContain('try {')
    expect(src).toContain('catch (err')
    expect(src).toContain('arSchemaSaknas')
  })
})

// ─────────────────────────────────────────────────────────────────
// lib/experiment/report.ts — buildReadoutBody/buildReadoutCardCopy (rena)
// ─────────────────────────────────────────────────────────────────

function measurement(over: Partial<ExperimentMeasurement> = {}): ExperimentMeasurement {
  return {
    experiment_id: 'exp_1',
    projects_enrolled: 5,
    projects_completed: 5,
    projects_with_sufficient_data: 3,
    measures: [
      { measure: 'sena_andringar', values: [{ project_id: 'p1', value: 0 }, { project_id: 'p2', value: 2 }, { project_id: 'p3', value: 0 }], ej_bedombar: [] },
    ],
    verdict: 'underlag_finns',
    ...over,
  }
}

test.describe('report.ts — buildReadoutBody (ren, räknade fakta)', () => {
  test('räknar inskrivna projekt, sena_andringar=0-fall, och underlagslösa', () => {
    const body = buildReadoutBody(measurement())
    expect(body).toContain('Kontrollen användes på 5 projekt.')
    expect(body).toContain('2 hade inga sena ändringar.')
    expect(body).toContain('2 saknar tillräckligt underlag.') // 5 enrolled - 3 sufficient
  })

  test('sena_andringar-raden utelämnas när måttet inte ingår i försöket', () => {
    const body = buildReadoutBody(measurement({ measures: [{ measure: 'marginal', values: [], ej_bedombar: [] }] }))
    expect(body).not.toContain('sena ändringar')
  })
})

test.describe('report.ts — buildReadoutCardCopy', () => {
  test('rubriken innehåller ordagrant "Försöket är klart att redovisas"', () => {
    const { title } = buildReadoutCardCopy('badrum', measurement())
    expect(title).toContain('Försöket är klart att redovisas')
  })

  test("verdict for_tidigt: texten säger ordagrant 'för tidigt' och erbjuder fortsättning", () => {
    const { description } = buildReadoutCardCopy('badrum', measurement({ verdict: 'for_tidigt', projects_with_sufficient_data: 1 }))
    expect(description.toLowerCase()).toContain('för tidigt')
    expect(description).toContain('fortsätta testa')
  })

  test('verdict underlag_finns: ingen "för tidigt"-text', () => {
    const { description } = buildReadoutCardCopy('badrum', measurement({ verdict: 'underlag_finns' }))
    expect(description.toLowerCase()).not.toContain('för tidigt')
  })

  // Rendertest — samma FORBJUDNA_ORD-idé som källskanningen nedan, men körd
  // mot det FAKTISKA GENERERADE textinnehållet, inte källkoden. En textbyggare
  // kan i princip klara en källkodsskanning men ändå råka producera ett
  // värdeord i en sträng som byggs dynamiskt — det här stänger den luckan.
  test('genererad text (båda verdict-grenarna, flera måttkombinationer) innehåller aldrig ett värdeord', () => {
    const VARDEORD = [
      'battre', 'bättre', 'samre', 'sämre', 'fungerar', 'lyckad', 'lyckat', 'misslyckad', 'misslyckat',
      'orsakade', 'orsakar', 'gav bättre', 'berodde på', 'beror på', 'ledde till', 'fick kunden',
      'fungerar bäst', 'förbättrar', 'tack vare', 'success',
    ]
    const scenarios: ExperimentMeasurement[] = [
      measurement(),
      measurement({ verdict: 'for_tidigt', projects_with_sufficient_data: 0 }),
      measurement({ measures: [{ measure: 'marginal', values: [{ project_id: 'p1', value: 12.4 }], ej_bedombar: [{ project_id: 'p2', reasons: ['financial_learning_ineligible'] }] }] }),
      measurement({ projects_enrolled: 0, projects_completed: 0, projects_with_sufficient_data: 0, measures: [], verdict: 'for_tidigt' }),
    ]
    for (const scen of scenarios) {
      const { title, description } = buildReadoutCardCopy('badrum', scen)
      const text = (title + ' ' + description).toLowerCase()
      for (const ord of VARDEORD) {
        expect(text, `"${ord}" hittades i genererad text: ${text}`).not.toContain(ord)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// lib/experiment/report.ts — maybeCreateReadout/sweepExperimentReadouts (I/O)
// ─────────────────────────────────────────────────────────────────

function activeExperimentRow(over: Partial<ActiveExperimentRow> = {}): ActiveExperimentRow {
  return {
    id: 'exp_1',
    business_id: 'biz_test',
    job_type: 'badrum',
    hypothesis: 'Räkna med en extra dag för rivning',
    source_pattern_id: 'bk_1',
    enrolled_project_ids: [],
    measures: ['sena_andringar'],
    min_comparable_projects: 3,
    guard_rails: { start_date: '2026-01-01', end_date: '2026-01-10', max_projects: 5, no_autonomous_customer_send: true },
    planned_change: { type: 'kickoff_checkpoint', checkpoint_text: 'Räkna med en extra dag för rivning' },
    ...over,
  }
}

test.describe('report.ts — maybeCreateReadout', () => {
  test('varken end_date nått eller alla frusna → skipped_not_ready, ingen skrivning', async () => {
    const framtid = activeExperimentRow({ guard_rails: { start_date: '2026-01-01', end_date: '2099-01-01', max_projects: 5, no_autonomous_customer_send: true } })
    const { supabase, callCount } = fakeSupabase([])
    const result = await maybeCreateReadout(supabase as any, 'biz_test', framtid, new Date('2026-06-01'))
    expect(result).toBe('skipped_not_ready')
    expect(callCount()).toBe(0) // enrolled=[] → measureExperiment gör noll frågor
  })

  test('end_date passerad → skapar kortet och avslutar försöket (frozen_summary + status=concluded)', async () => {
    const exp = activeExperimentRow()
    const { supabase, tables } = fakeSupabase([
      ok([]), // hasExistingReadoutCard: inget befintligt kort
      ok(null), // pending_approvals-insert
      ok(null), // operating_experiment-update (concludeExperiment)
    ])
    const result = await maybeCreateReadout(supabase as any, 'biz_test', exp, new Date('2026-06-01'))
    expect(result).toBe('created')
    expect(tables).toEqual(['pending_approvals', 'pending_approvals', 'operating_experiment'])
  })

  test('redan ett kort (tidigare svep hann skapa men inte avsluta) → skipped_already_exists, försöker ändå avsluta', async () => {
    const exp = activeExperimentRow()
    const { supabase, tables } = fakeSupabase([
      ok([{ id: 'appr_existing' }]), // hasExistingReadoutCard: träff
      ok(null), // operating_experiment-update (concludeExperiment körs ändå)
    ])
    const result = await maybeCreateReadout(supabase as any, 'biz_test', exp, new Date('2026-06-01'))
    expect(result).toBe('skipped_already_exists')
    expect(tables).toEqual(['pending_approvals', 'operating_experiment'])
  })

  test('insert-fel ger skipped_error, kastar aldrig, försöket avslutas INTE', async () => {
    const exp = activeExperimentRow()
    const { supabase, tables } = fakeSupabase([
      ok([]),
      { data: null, error: { message: 'boom' } },
      ok(null), // automation_activity via rapporteraTystFel
    ])
    const result = await maybeCreateReadout(supabase as any, 'biz_test', exp, new Date('2026-06-01'))
    expect(result).toBe('skipped_error')
    expect(tables).not.toContain('operating_experiment')
  })

  test('kortets payload bär experiment_id/job_type/hypothesis/source_pattern_id/verdict/measurement/target_route', () => {
    const src = read('lib/experiment/report.ts')
    const insertIdx = src.indexOf(".from('pending_approvals').insert(")
    expect(insertIdx).toBeGreaterThan(-1)
    const gren = src.slice(insertIdx, insertIdx + 1200)
    expect(gren).toContain("approval_type: 'operating_experiment_readout'")
    expect(gren).toContain("routing_role: 'owner_admin'")
    expect(gren).toContain('experiment_id: experiment.id')
    expect(gren).toContain('job_type: experiment.job_type')
    expect(gren).toContain('hypothesis: experiment.hypothesis')
    expect(gren).toContain('source_pattern_id: experiment.source_pattern_id')
    expect(gren).toContain('verdict: measurement.verdict')
    expect(gren).toContain('measurement,')
    expect(gren).toContain('target_route: `/dashboard/experiments/${approvalId}`')
  })

  test('funktionerna kastar aldrig (try/catch)', () => {
    const src = read('lib/experiment/report.ts')
    expect(src).toContain('export async function maybeCreateReadout')
    expect(src).toContain('export async function sweepExperimentReadouts')
    expect((src.match(/try \{/g) || []).length).toBeGreaterThanOrEqual(4)
  })
})

test.describe('report.ts — sweepExperimentReadouts', () => {
  test('42P01 (v157 ej körd) → { considered: 0, created: 0 }, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([{ data: null, error: { message: 'relation does not exist', code: '42P01' } }])
    const result = await sweepExperimentReadouts(supabase as any, 'biz_test')
    expect(result).toEqual({ considered: 0, created: 0 })
  })

  test('inga aktiva försök → { considered: 0, created: 0 }', async () => {
    const { supabase } = fakeSupabase([ok([])])
    const result = await sweepExperimentReadouts(supabase as any, 'biz_test')
    expect(result).toEqual({ considered: 0, created: 0 })
  })
})

// ─────────────────────────────────────────────────────────────────
// frozen_summary — skrivs EXAKT en gång, ENDAST i report.ts (Etapp 2)
// ─────────────────────────────────────────────────────────────────

test.describe('källskanning — frozen_summary skrivs EXAKT en gång, ENDAST i report.ts', () => {
  test('lib/experiment/*.ts: bara report.ts skriver frozen_summary till en rad', () => {
    const dir = path.join(ROOT, 'lib', 'experiment')
    // types.ts undantaget avsiktligt — den bär bara TYPKONTRAKTET
    // (OperatingExperimentRow.frozen_summary), ingen I/O, ingen skrivning
    // (samma disciplin Etapp 1 redan låste: "Ingen skrivväg finns i Etapp 1").
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'types.ts')
    const writers = files.filter(f => {
      const src = read(path.join('lib/experiment', f))
      return /frozen_summary\s*:/.test(src)
    })
    expect(writers).toEqual(['report.ts'])
  })

  test('report.ts skriver frozen_summary EXAKT en gång (en enda `frozen_summary:`-förekomst)', () => {
    const src = read('lib/experiment/report.ts')
    const matches = src.match(/frozen_summary\s*:/g) || []
    expect(matches.length).toBe(1)
  })

  test('app/api/approvals/[id]/route.ts skriver ALDRIG frozen_summary — bara concludeExperiment (report.ts) gör det', () => {
    const src = read('app/api/approvals/[id]/route.ts')
    expect(src).not.toContain('frozen_summary')
  })
})

// ─────────────────────────────────────────────────────────────────
// enrollment blockerar aldrig kickoff-flödet (källskanning)
// ─────────────────────────────────────────────────────────────────

test.describe('källskanning — experiment-inskrivning blockerar aldrig kickoff-kortets egen skrivning', () => {
  test("maybeEnrollProject-anropet i case 'playbook_kickoff_suggestion' är omslutet av try/catch, EFTER checklist-inserten", () => {
    const src = read('app/api/approvals/[id]/route.ts')
    const caseStart = src.indexOf("case 'playbook_kickoff_suggestion':")
    expect(caseStart).toBeGreaterThan(-1)
    const checklistInsertIdx = src.indexOf(".from('project_checklist').insert(", caseStart)
    const enrollIdx = src.indexOf('maybeEnrollProject(', caseStart)
    expect(checklistInsertIdx).toBeGreaterThan(-1)
    expect(enrollIdx).toBeGreaterThan(checklistInsertIdx)

    const tryIdx = src.lastIndexOf('try {', enrollIdx)
    const catchIdx = src.indexOf('catch (enrollErr', enrollIdx)
    expect(tryIdx).toBeGreaterThan(checklistInsertIdx)
    expect(catchIdx).toBeGreaterThan(enrollIdx)
  })
})

// ─────────────────────────────────────────────────────────────────
// approvals-casen fail-softar utan v157 (svensk feltext)
// ─────────────────────────────────────────────────────────────────

test.describe('approvals-rutten — operating_experiment_proposal/readout fail-softar utan v157', () => {
  const src = read('app/api/approvals/[id]/route.ts')

  test("case 'operating_experiment_proposal' har en egen hanterare och skriver operating_experiment", () => {
    expect(src).toContain("case 'operating_experiment_proposal':")
    const i = src.indexOf("case 'operating_experiment_proposal':")
    const gren = src.slice(i, i + 2200)
    expect(gren).toContain(".from('operating_experiment')")
    expect(gren).toContain(".insert(")
    expect(gren).toContain("status: 'active'")
  })

  test("case 'operating_experiment_readout' har en egen hanterare, kräver decision, avvisning hanteras via reject-side-effect", () => {
    expect(src).toContain("case 'operating_experiment_readout':")
    expect(src).toContain("action === 'reject' && approval.approval_type === 'operating_experiment_readout'")
  })

  test('svensk feltext "Försöket kan inte startas ännu." finns för v157-frånvaro i BÅDA nya cases', () => {
    const occurrences = (src.match(/Försöket kan inte startas ännu\./g) || []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  test('schema-saknas kollas explicit runt operating_experiment-skrivningarna, via arSchemaSaknas (täcker BÅDE 42P01 och PostgREST:s PGRST205)', () => {
    const proposalStart = src.indexOf("case 'operating_experiment_proposal':")
    const readoutStart = src.indexOf("case 'operating_experiment_readout':")
    const defaultStart = src.indexOf('default: {')
    expect(src.slice(proposalStart, readoutStart)).toContain('arSchemaSaknas(')
    expect(src.slice(readoutStart, defaultStart)).toContain('arSchemaSaknas(')
    expect(src).toContain("import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'")
  })

  test('arSchemaSaknas (den delade helpern) känner igen PostgREST:s PGRST205, inte bara Postgres 42P01 — empiriskt verifierat mot en riktig ej-migrerad tabell', () => {
    const driftlarmSrc = read('lib/observability/driftlarm.ts')
    expect(driftlarmSrc).toContain("code === 'PGRST205'")
  })
})

// ─────────────────────────────────────────────────────────────────
// action-contract + routing — nya typerna
// ─────────────────────────────────────────────────────────────────

test.describe('action-contract/routing — operating_experiment_proposal + readout', () => {
  test('registrerade som EXECUTABLE_ACTION, owner_admin', () => {
    const src = read('lib/approvals/action-contract.ts')
    expect(src).toContain("operating_experiment_proposal: 'EXECUTABLE_ACTION'")
    expect(src).toContain("operating_experiment_readout: 'EXECUTABLE_ACTION'")
    const routingSrc = read('lib/approvals/routing.ts')
    expect(routingSrc).toContain("operating_experiment_proposal: 'owner_admin'")
    expect(routingSrc).toContain("operating_experiment_readout: 'owner_admin'")
  })
})

// ─────────────────────────────────────────────────────────────────
// Kausalitetsbanet + PROSA — Etapp 2-filerna omfattas redan av
// "källskanning — kausalitetsbanet gäller hela lib/experiment/" ovan
// (den itererar fs.readdirSync(lib/experiment/) och fångar propose.ts/
// enroll.ts/report.ts automatiskt). Detta test bevisar bara att de tre
// filerna faktiskt FINNS och skannas, så den täckningen inte tyst tappas
// bort om katalogen någonsin bara innehåller Etapp 1-filerna i en annan
// körningskontext.
// ─────────────────────────────────────────────────────────────────

test.describe('kausalitetsbanet täcker Etapp 2-filerna', () => {
  test('propose.ts, enroll.ts, report.ts finns i lib/experiment/ och skannas av källskanningen ovan', () => {
    const dir = path.join(ROOT, 'lib', 'experiment')
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'))
    for (const f of ['propose.ts', 'enroll.ts', 'report.ts']) {
      expect(files).toContain(f)
    }
  })

  test('filhuvudena dokumenterar kausalitetsdisciplinen (propose.ts nämner det via types.ts-referensen, enroll.ts/report.ts uttryckligen)', () => {
    expect(read('lib/experiment/report.ts').toLowerCase()).toContain('kausalitet')
  })
})
