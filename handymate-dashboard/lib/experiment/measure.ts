/**
 * OperatingExperiment — mätmotorn, Etapp 1 (Adaptive Business Twin,
 * Lars-piloten, docs/council/ACTIVE_ROADMAP.md "Läge 2026-08-19").
 *
 * LÄS-ONLY. Den här filen skriver INGENTING — den räknar räknade fakta ur
 * tabeller som redan finns (project_outcome, project_change, project,
 * time_entry, invoice) och den läs-funktion Playbook Kickoff Copilot redan
 * äger (lib/playbook/checkpoint-outcomes.ts). Ingen ny relation uppfinns.
 *
 * ═══ HÄRLEDNINGSKÄLLA PER MÅTT (den slutna uppsättningen, se types.ts) ═══
 *
 *   marginal            — project_outcome.realized_margin_pct, ENDAST när
 *                          financial_learning_eligible=true (samma grind
 *                          som Outcome Quality Gate V1 redan håller).
 *   extra_timmar         — project_outcome.hours_diff_pct, ENDAST när
 *                          time_learning_eligible=true.
 *   materialavvikelser   — project_outcome.quoted_material_kr vs
 *                          actual_material_billable_kr (ÅTERANVÄNDA,
 *                          redan frusna fält — ingen egen omräkning mot
 *                          project_material/offert, det vore att duplicera
 *                          freeze-outcome.ts:s klassificeringslogik).
 *                          ENDAST när financial_learning_eligible=true
 *                          (material_source_overlap_free ingår redan i den
 *                          grinden) OCH quoted_material_kr > 0.
 *   faktureringstid       — project_outcome.closed_at → invoice.sent_at
 *                          (sql/v126: sent_at sätts vid faktiskt utskick
 *                          sedan bugfixen, backfillad för äldre rader).
 *                          Flera fakturor per projekt förekommer (delfakt-
 *                          urering) — den TIDIGASTE sent_at används, som
 *                          en ärlig approximation av "första fakturan
 *                          skickad", dokumenterad här snarare än gömd.
 *   forseningar           — project.end_date → project_outcome.closed_at.
 *                          end_date är en PLANERAD, ofta ifylld-i-efterhand
 *                          kolumn (nullable) — projekt utan den blir
 *                          ärligt ej_bedombar, aldrig ett gissat datum.
 *   sena_andringar        — project_change.created_at jämfört med
 *                          projektets byggstart. Byggstart härleds i två
 *                          steg (deriveBuildStart nedan): i första hand
 *                          project.workflow_stage_history-posten för
 *                          stadiet "Jobb påbörjat" (ps-03, sql/v39), annars
 *                          det TIDIGASTE time_entry.work_date för
 *                          projektet. Saknas båda är byggstart okänd och
 *                          projektet är ärligt ej_bedombar för det måttet.
 *
 * ═══ ALDRIG MEDELVÄRDEN ÖVER OLIKA EPISTEMISKA KLASSER ═══
 *
 * Varje mått returnerar RÅA värden per projekt (values) plus en separat
 * lista över projekt som INTE gick att bedöma (ej_bedombar) med sitt skäl
 * — aldrig ett medelvärde, aldrig en sammanvägd dom. deriveExperimentVerdict
 * längst ner kan bara svara "för tidigt" eller "underlag finns", ALDRIG
 * "bättre"/"sämre"/"fungerar" — se dess egen kommentar.
 *
 * ═══ KAUSALITETSBANET ═══
 *
 * Se filhuvudet i lib/experiment/types.ts. Ett handverk med enrolled_
 * project_ids är inte ett kontrollerat experiment i vetenskaplig mening —
 * den här filen räknar bara vad som faktiskt hände, den uttrycker aldrig
 * att ett steg framkallade ett annat. Källskanningen i
 * tests/operating-experiment.spec.ts täcker hela lib/experiment/.
 *
 * ═══ FAIL-SAFE ═══
 *
 * measureExperiment kastar ALDRIG. Ett läsfel för NÅGON av källorna ger en
 * degraderad mätning där alla inskrivna projekt visas ej_bedombar med skäl
 * 'read_failed' (inte "saknar frysning" — de två sakerna får inte se
 * likadana ut, se degradedMeasurement).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import { getCheckpointOutcomes } from '@/lib/playbook/checkpoint-outcomes'
import {
  EXPERIMENT_MEASURE_KEYS,
  type ExperimentMeasureKey,
} from './types'

// ─────────────────────────────────────────────────────────────────
// Ren kärna — indataformer (I/O-lagret fyller dessa, se längre ner).
// ─────────────────────────────────────────────────────────────────

export interface ExperimentOutcomeInput {
  project_id: string
  closed_at: string
  quoted_material_kr: number | null
  actual_material_billable_kr: number
  hours_diff_pct: number | null
  realized_margin_pct: number | null
  financial_learning_eligible: boolean
  time_learning_eligible: boolean
  learning_blockers: string[]
}

export interface ExperimentProjectChangeInput {
  project_id: string
  created_at: string
}

/** Redan härledd av I/O-lagret (deriveBuildStart) — null om varken
    workflow_stage_history eller time_entry gav ett svar. */
export interface ExperimentBuildStartInput {
  project_id: string
  build_start: string | null
}

/** Tidigaste sent_at bland projektets fakturor, eller null om ingen
    faktura har ett sent_at ännu. */
export interface ExperimentInvoiceInput {
  project_id: string
  sent_at: string | null
}

export interface ExperimentProjectDateInput {
  project_id: string
  end_date: string | null
}

export interface MeasuredValue {
  project_id: string
  value: number
}

/** reasons speglar ALLTID något verkligt: antingen project_outcome.
    learning_blockers rakt av, eller ett strukturellt skäl (t.ex.
    'end_date_missing') som är lika verifierbart. Aldrig en gissning. */
export interface UnassessableProject {
  project_id: string
  reasons: string[]
}

export interface MeasureResult {
  measure: ExperimentMeasureKey
  values: MeasuredValue[]
  ej_bedombar: UnassessableProject[]
}

/** Ett projekt vars kontrollpunkt kunde slås upp via checkpoint-outcomes
    (bara relevant för planned_change.type==='kickoff_checkpoint'-försök).
    Rent beskrivande — påverkar varken values, ej_bedombar eller verdict. */
export interface ExperimentCheckpointContext {
  project_id: string
  checkpoint_checked: boolean
}

/**
 * ENDA två möjliga svar. 'for_tidigt' säger bara att antalet projekt med
 * ett faktiskt uppmätt värde ännu inte når min_comparable_projects —
 * 'underlag_finns' säger bara att det gör det. Ingen av dem säger något om
 * RIKTNINGEN på det underlaget.
 */
export type ExperimentVerdict = 'for_tidigt' | 'underlag_finns'

export function deriveExperimentVerdict(
  projectsWithSufficientData: number,
  minComparableProjects: number,
): ExperimentVerdict {
  return projectsWithSufficientData >= minComparableProjects ? 'underlag_finns' : 'for_tidigt'
}

export interface ExperimentMeasurement {
  experiment_id: string
  /** enrolled_project_ids.length — oavsett om de gått att mäta. */
  projects_enrolled: number
  /** Antal inskrivna projekt med en fryst project_outcome-rad
      (oavsett eligibility-flaggor). */
  projects_completed: number
  /** Antal inskrivna projekt som fick ett faktiskt uppmätt värde för
      MINST ETT av de begärda måtten. Det är DENNA siffra
      deriveExperimentVerdict jämför mot min_comparable_projects. */
  projects_with_sufficient_data: number
  measures: MeasureResult[]
  verdict: ExperimentVerdict
  /** Bara satt när I/O-lagret kunde slå upp kontrollpunktsdata
      (kickoff_checkpoint-försök). */
  checkpoint_context?: ExperimentCheckpointContext[]
}

/** project_workflow_stages-raden för "Jobb påbörjat" (sql/v39) — den
    strukturella markören för att bygget faktiskt startat, inte bara att
    projektet skapades. */
const BUILD_START_STAGE_ID = 'ps-03'

/**
 * Ren funktion: byggstart ur project.workflow_stage_history i första hand,
 * annars det tidigaste kända arbetsdatumet (I/O-lagret har redan räknat
 * fram det senare ur time_entry). Ingen I/O här.
 */
export function deriveBuildStart(
  workflowStageHistory: unknown,
  earliestTimeEntryWorkDate: string | null,
): string | null {
  if (Array.isArray(workflowStageHistory)) {
    let earliest: string | null = null
    for (const entry of workflowStageHistory as Array<Record<string, unknown>>) {
      if (!entry || entry.stage_id !== BUILD_START_STAGE_ID) continue
      const enteredAt = entry.entered_at
      if (typeof enteredAt !== 'string' || !Number.isFinite(Date.parse(enteredAt))) continue
      if (earliest === null || Date.parse(enteredAt) < Date.parse(earliest)) earliest = enteredAt
    }
    if (earliest !== null) return earliest
  }
  return earliestTimeEntryWorkDate
}

/** Heltal dagar mellan två ISO-datum/tidsstämplar (to - from). Null om
    någon av dem inte går att tolka — vi gissar aldrig ett datum. */
function daysBetween(fromIso: string, toIso: string): number | null {
  const fromMs = Date.parse(fromIso)
  const toMs = Date.parse(toIso)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null
  return Math.round((toMs - fromMs) / (24 * 3600_000))
}

function pctRound1(fraction: number): number {
  return Math.round(fraction * 1000) / 10
}

interface ProjectMeasureContext {
  outcome: ExperimentOutcomeInput
  buildStart: string | null
  lateChangeCount: number | null
  invoiceSentAt: string | null
  endDate: string | null
}

/** Ren klassificering: ETT mått för ETT projekt, antingen ett värde eller
    ett skäl till att det inte går att bedöma. Ingen I/O. */
function measureForProject(
  measure: ExperimentMeasureKey,
  ctx: ProjectMeasureContext,
): { value: number } | { reasons: string[] } {
  const blockersOrFallback = (fallback: string): string[] =>
    ctx.outcome.learning_blockers.length > 0 ? ctx.outcome.learning_blockers : [fallback]

  switch (measure) {
    case 'marginal': {
      if (!ctx.outcome.financial_learning_eligible || ctx.outcome.realized_margin_pct == null) {
        return { reasons: blockersOrFallback('financial_learning_ineligible') }
      }
      return { value: ctx.outcome.realized_margin_pct }
    }
    case 'extra_timmar': {
      if (!ctx.outcome.time_learning_eligible || ctx.outcome.hours_diff_pct == null) {
        return { reasons: blockersOrFallback('time_learning_ineligible') }
      }
      return { value: ctx.outcome.hours_diff_pct }
    }
    case 'materialavvikelser': {
      if (!ctx.outcome.financial_learning_eligible) {
        return { reasons: blockersOrFallback('financial_learning_ineligible') }
      }
      const quoted = ctx.outcome.quoted_material_kr
      if (quoted == null || quoted <= 0) return { reasons: ['quoted_material_missing'] }
      return { value: pctRound1((ctx.outcome.actual_material_billable_kr - quoted) / quoted) }
    }
    case 'faktureringstid': {
      if (!ctx.invoiceSentAt) return { reasons: ['invoice_sent_at_missing'] }
      const days = daysBetween(ctx.outcome.closed_at, ctx.invoiceSentAt)
      if (days === null) return { reasons: ['invoice_sent_at_missing'] }
      return { value: days }
    }
    case 'forseningar': {
      if (!ctx.endDate) return { reasons: ['end_date_missing'] }
      const days = daysBetween(ctx.endDate, ctx.outcome.closed_at)
      if (days === null) return { reasons: ['end_date_missing'] }
      return { value: days }
    }
    case 'sena_andringar': {
      if (ctx.buildStart === null || ctx.lateChangeCount === null) {
        return { reasons: ['build_start_unknown'] }
      }
      return { value: ctx.lateChangeCount }
    }
  }
}

/**
 * Ren kärna: bygger en ExperimentMeasurement ur redan inlästa rader. Ingen
 * I/O. Facit-testerna (tests/operating-experiment.spec.ts) träffar den här
 * funktionen direkt.
 */
export function buildExperimentMeasurement(input: {
  experiment: {
    id: string
    enrolled_project_ids: string[]
    measures: ExperimentMeasureKey[]
    min_comparable_projects: number
  }
  outcomes: ExperimentOutcomeInput[]
  projectChanges: ExperimentProjectChangeInput[]
  buildStarts: ExperimentBuildStartInput[]
  invoices: ExperimentInvoiceInput[]
  projectDates: ExperimentProjectDateInput[]
  checkpointChecked?: Record<string, boolean>
}): ExperimentMeasurement {
  const outcomeByProject = new Map(input.outcomes.map(o => [o.project_id, o]))
  const buildStartByProject = new Map(input.buildStarts.map(b => [b.project_id, b.build_start]))
  const invoiceByProject = new Map(input.invoices.map(i => [i.project_id, i.sent_at]))
  const endDateByProject = new Map(input.projectDates.map(d => [d.project_id, d.end_date]))

  // Sena ändringar räknas EN gång per projekt, oberoende av hur många
  // mått som begärs — samma tal återanvänds av measureForProject nedan.
  const lateChangeCountByProject = new Map<string, number>()
  for (const projectId of input.experiment.enrolled_project_ids) {
    const buildStart = buildStartByProject.get(projectId) ?? null
    if (buildStart === null) continue
    const startMs = Date.parse(buildStart)
    if (!Number.isFinite(startMs)) continue
    const count = input.projectChanges.filter(c => {
      if (c.project_id !== projectId) return false
      const changedMs = Date.parse(c.created_at)
      return Number.isFinite(changedMs) && changedMs > startMs
    }).length
    lateChangeCountByProject.set(projectId, count)
  }

  const measureResults = new Map<ExperimentMeasureKey, MeasureResult>()
  for (const measure of input.experiment.measures) {
    measureResults.set(measure, { measure, values: [], ej_bedombar: [] })
  }

  let projectsCompleted = 0
  const sufficientProjectIds = new Set<string>()

  for (const projectId of input.experiment.enrolled_project_ids) {
    const outcome = outcomeByProject.get(projectId)
    if (!outcome) {
      for (const measure of input.experiment.measures) {
        measureResults.get(measure)!.ej_bedombar.push({
          project_id: projectId,
          reasons: ['project_outcome_not_frozen'],
        })
      }
      continue
    }
    projectsCompleted += 1

    const buildStart = buildStartByProject.get(projectId) ?? null
    const ctx: ProjectMeasureContext = {
      outcome,
      buildStart,
      lateChangeCount: lateChangeCountByProject.has(projectId)
        ? lateChangeCountByProject.get(projectId)!
        : null,
      invoiceSentAt: invoiceByProject.get(projectId) ?? null,
      endDate: endDateByProject.get(projectId) ?? null,
    }

    for (const measure of input.experiment.measures) {
      const result = measureForProject(measure, ctx)
      const bucket = measureResults.get(measure)!
      if ('value' in result) {
        bucket.values.push({ project_id: projectId, value: result.value })
        sufficientProjectIds.add(projectId)
      } else {
        bucket.ej_bedombar.push({ project_id: projectId, reasons: result.reasons })
      }
    }
  }

  // Lokal const (inte input.checkpointChecked direkt) så TypeScript kan
  // behålla null-narrowingen inuti callbacken nedan.
  const checkpointChecked = input.checkpointChecked
  const checkpointContext: ExperimentCheckpointContext[] | undefined = checkpointChecked
    ? input.experiment.enrolled_project_ids
        .filter(id => Object.prototype.hasOwnProperty.call(checkpointChecked, id))
        .map(id => ({ project_id: id, checkpoint_checked: checkpointChecked[id] }))
    : undefined

  return {
    experiment_id: input.experiment.id,
    projects_enrolled: input.experiment.enrolled_project_ids.length,
    projects_completed: projectsCompleted,
    projects_with_sufficient_data: sufficientProjectIds.size,
    measures: Array.from(measureResults.values()),
    verdict: deriveExperimentVerdict(sufficientProjectIds.size, input.experiment.min_comparable_projects),
    ...(checkpointContext ? { checkpoint_context: checkpointContext } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────
// I/O-lagret — läser exakt de källorna filhuvudet räknar upp, fail-safe
// genomgående (kastar aldrig, degraderar).
// ─────────────────────────────────────────────────────────────────

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

/** En degraderad mätning där varje begärt mått visar samtliga inskrivna
    projekt som ej_bedombar med ETT gemensamt strukturellt skäl — används
    både för "inga projekt inskrivna" och för "läsning misslyckades". De
    två fallen får olika reason-strängar (ingenting förväxlas). */
function degradedMeasurement(
  experimentId: string,
  enrolledProjectIds: string[],
  measures: ExperimentMeasureKey[],
  minComparableProjects: number,
  reason: string,
): ExperimentMeasurement {
  return {
    experiment_id: experimentId,
    projects_enrolled: enrolledProjectIds.length,
    projects_completed: 0,
    projects_with_sufficient_data: 0,
    measures: measures.map(measure => ({
      measure,
      values: [],
      ej_bedombar: enrolledProjectIds.map(project_id => ({ project_id, reasons: [reason] })),
    })),
    verdict: deriveExperimentVerdict(0, minComparableProjects),
  }
}

export interface MeasurableExperiment {
  id: string
  business_id: string
  enrolled_project_ids: string[]
  measures: ExperimentMeasureKey[]
  min_comparable_projects: number
  /** Bara 'kickoff_checkpoint' i V1 (types.ts) — andra typer läses aldrig
      för checkpoint-berikning, men mätningen av de sex måtten fungerar
      oförändrat. */
  planned_change_type?: string
  source_pattern_id?: string | null
}

/**
 * Fail-safe I/O: läser project_outcome/project_change/project/time_entry/
 * invoice för experimentets inskrivna projekt, härleder byggstart, och kör
 * den rena kärnan. Berikar med checkpoint_context när försöket är av typen
 * kickoff_checkpoint (getCheckpointOutcomes är redan fail-safe i sig).
 *
 * Kastar ALDRIG — se filhuvudets FAIL-SAFE-avsnitt.
 */
export async function measureExperiment(
  supabase: SupabaseClient,
  experiment: MeasurableExperiment,
): Promise<ExperimentMeasurement> {
  const { business_id: businessId, enrolled_project_ids: projectIds } = experiment

  if (projectIds.length === 0) {
    return degradedMeasurement(
      experiment.id,
      [],
      experiment.measures,
      experiment.min_comparable_projects,
      'not_enrolled',
    )
  }

  try {
    const [outcomeRes, changeRes, projectRes, timeEntryRes, invoiceRes] = await Promise.all([
      supabase
        .from('project_outcome')
        .select('project_id, closed_at, quoted_material_kr, actual_material_billable_kr, hours_diff_pct, realized_margin_pct, financial_learning_eligible, time_learning_eligible, learning_blockers')
        .eq('business_id', businessId)
        .in('project_id', projectIds),
      supabase
        .from('project_change')
        .select('project_id, created_at')
        .eq('business_id', businessId)
        .in('project_id', projectIds),
      supabase
        .from('project')
        .select('project_id, workflow_stage_history, end_date')
        .eq('business_id', businessId)
        .in('project_id', projectIds),
      supabase
        .from('time_entry')
        .select('project_id, work_date')
        .eq('business_id', businessId)
        .in('project_id', projectIds),
      supabase
        .from('invoice')
        .select('project_id, sent_at')
        .eq('business_id', businessId)
        .in('project_id', projectIds),
    ])

    // Kastar det RÅA felobjektet (behåller .code) — catch-blocket nedan
    // avgör med arSchemaSaknas om det var en väntad (migration ej körd
    // än) eller en riktig driftstörning, samma tvådelning som
    // freeze-outcome.ts.
    for (const res of [outcomeRes, changeRes, projectRes, timeEntryRes, invoiceRes]) {
      if (res.error) throw res.error
    }

    const outcomes: ExperimentOutcomeInput[] = asRows<Record<string, unknown>>(outcomeRes.data).map(row => ({
      project_id: row.project_id as string,
      closed_at: row.closed_at as string,
      // NUMERIC-kolumner kan komma tillbaka som strängar från PostgREST —
      // Number(...) genomgående (samma försiktighet som mission-progress.ts
      // redan använder för invoice.total), aldrig ett antaget number-format.
      quoted_material_kr: row.quoted_material_kr == null ? null : Number(row.quoted_material_kr),
      actual_material_billable_kr: Number(row.actual_material_billable_kr) || 0,
      hours_diff_pct: row.hours_diff_pct == null ? null : Number(row.hours_diff_pct),
      realized_margin_pct: row.realized_margin_pct == null ? null : Number(row.realized_margin_pct),
      financial_learning_eligible: row.financial_learning_eligible === true,
      time_learning_eligible: row.time_learning_eligible === true,
      learning_blockers: Array.isArray(row.learning_blockers) ? (row.learning_blockers as string[]) : [],
    }))

    const projectChanges: ExperimentProjectChangeInput[] = asRows<Record<string, unknown>>(changeRes.data).map(row => ({
      project_id: row.project_id as string,
      created_at: row.created_at as string,
    }))

    const invoices: ExperimentInvoiceInput[] = (() => {
      const earliestByProject = new Map<string, string>()
      for (const row of asRows<Record<string, unknown>>(invoiceRes.data)) {
        const projectId = row.project_id as string | null
        const sentAt = row.sent_at as string | null
        if (!projectId || !sentAt || !Number.isFinite(Date.parse(sentAt))) continue
        const current = earliestByProject.get(projectId)
        if (!current || Date.parse(sentAt) < Date.parse(current)) earliestByProject.set(projectId, sentAt)
      }
      return projectIds.map(project_id => ({ project_id, sent_at: earliestByProject.get(project_id) ?? null }))
    })()

    const earliestWorkDateByProject = (() => {
      const map = new Map<string, string>()
      for (const row of asRows<Record<string, unknown>>(timeEntryRes.data)) {
        const projectId = row.project_id as string | null
        const workDate = row.work_date as string | null
        if (!projectId || !workDate || !Number.isFinite(Date.parse(workDate))) continue
        const current = map.get(projectId)
        if (!current || Date.parse(workDate) < Date.parse(current)) map.set(projectId, workDate)
      }
      return map
    })()

    const projectRows = asRows<Record<string, unknown>>(projectRes.data)
    const projectDates: ExperimentProjectDateInput[] = projectRows.map(row => ({
      project_id: row.project_id as string,
      end_date: (row.end_date as string | null) ?? null,
    }))

    const buildStarts: ExperimentBuildStartInput[] = projectRows.map(row => {
      const projectId = row.project_id as string
      return {
        project_id: projectId,
        build_start: deriveBuildStart(row.workflow_stage_history, earliestWorkDateByProject.get(projectId) ?? null),
      }
    })

    let checkpointChecked: Record<string, boolean> | undefined
    if (experiment.planned_change_type === 'kickoff_checkpoint') {
      try {
        const checkpointRows = await getCheckpointOutcomes(supabase, businessId)
        const map: Record<string, boolean> = {}
        for (const row of checkpointRows) {
          if (!projectIds.includes(row.project_id)) continue
          if (experiment.source_pattern_id && row.pattern_id !== experiment.source_pattern_id) continue
          map[row.project_id] = row.checkpoint_checked
        }
        checkpointChecked = map
      } catch {
        // Berikning är valfri — mätningens sex mått påverkas inte.
        checkpointChecked = undefined
      }
    }

    return buildExperimentMeasurement({
      experiment: {
        id: experiment.id,
        enrolled_project_ids: projectIds,
        measures: experiment.measures,
        min_comparable_projects: experiment.min_comparable_projects,
      },
      outcomes,
      projectChanges,
      buildStarts,
      invoices,
      projectDates,
      checkpointChecked,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[experiment/measure] mätning misslyckades (degraderad, read_failed):', msg)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(supabase, businessId, 'experiment/measure:unexpected', msg, { experimentId: experiment.id })
    }
    return degradedMeasurement(
      experiment.id,
      projectIds,
      experiment.measures,
      experiment.min_comparable_projects,
      'read_failed',
    )
  }
}

// Re-export för bekvämlighet — måttlistan hör hemma i types.ts, men
// anropande kod som redan importerar measure.ts slipper ett andra import.
export { EXPERIMENT_MEASURE_KEYS }
export type { ExperimentMeasureKey }
