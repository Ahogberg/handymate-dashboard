/**
 * Motor 1: Lärande prissättning — Steg 1 (v73-spec, 2026-07-16).
 *
 * freezeProjectOutcome() fryser utfall-vs-offert för ett stängt projekt i
 * `project_outcome`. Detta är kärnartefakten för Motor 1 — varje stängt
 * jobb blir en datapunkt som nästa offert kan lära av (se steg 2:
 * app/api/quotes/efterkalkyl-insikt/route.ts).
 *
 * ÅTERANVÄNDNING (kritiskt): all ekonomi-beräkning kommer från de kanoniska
 * helperna — computeProjectEconomics (lib/projects/compute-economics.ts)
 * och getQuoteBudgetDerivation (lib/quotes/get-quote-budget-derivation.ts).
 * Denna fil duplicerar ALDRIG deras logik, bara omformar deras output till
 * en frusen rad.
 *
 * FAIL-SAFE (kritiskt): freezeProjectOutcome kastar ALDRIG. Den får inte
 * fälla projektstängningen eller autofaktureringen som redan körts i
 * anropskedjan. Om project_outcome-tabellen inte finns än (v73-migrationen
 * inte körd) loggas ett console.error EN gång och funktionen returnerar
 * tyst — stängningsflödet fortsätter opåverkat.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeProjectEconomics,
  ProjectEconomicsSourceError,
  type ProjectEconomics,
} from '@/lib/projects/compute-economics'
import {
  getQuoteBudgetDerivation,
  type QuoteBudgetDerivation,
  type QuoteBudgetSource,
} from '@/lib/quotes/get-quote-budget-derivation'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

export const OUTCOME_CALCULATION_VERSION = 2

export interface OutcomeSourceCounts {
  ata: number
  invoice: number
  realized_invoice: number
  time_entry: number
  supplier_invoice: number
  project_material: number
  project_cost: number
}

export interface OutcomeCompletenessFlags {
  project_completed: boolean
  quote_linked: boolean
  quote_budget_present: boolean
  quote_hours_present: boolean
  time_entries_present: boolean
  cost_rows_present: boolean
  material_source_overlap_free: boolean
  labor_cost_complete: boolean
  invoice_present: boolean
  invoice_net_amount_complete: boolean
  realized_revenue_present: boolean
  source_reads_complete: true
}

// ─────────────────────────────────────────────────────────────────
// Ren kärna — testbar utan Supabase (facit-tester i tests/efterkalkyl.spec.ts)
// ─────────────────────────────────────────────────────────────────

export interface OutcomeDiffInput {
  quotedHours: number | null
  actualHours: number
  quotedAmount: number | null
  /** Faktisk total kostnad (arbete+material+extra). Null om
      arbetskostnad ej konfigurerad — då blir amount_diff_pct också null
      (ärlighetsprincipen: vi gissar aldrig en kr-diff mot okänd kostnad). */
  actualTotalKr: number | null
}

export interface OutcomeDiffResult {
  /** (actual-quoted)/quoted i procent, avrundat till 1 decimal. Null om
      quotedHours saknas eller är 0 (division med noll/meningslös offert). */
  hours_diff_pct: number | null
  /** (actualTotalKr-quotedAmount)/quotedAmount i procent, avrundat till 1
      decimal. Null om quotedAmount saknas/0 eller actualTotalKr är null. */
  amount_diff_pct: number | null
}

/** Avrundar en andel (t.ex. 0.123) till procent med 1 decimal (12.3). */
function pctRound1(fraction: number): number {
  return Math.round(fraction * 1000) / 10
}

export function computeOutcomeDiffs(input: OutcomeDiffInput): OutcomeDiffResult {
  const hours_diff_pct =
    input.quotedHours != null && input.quotedHours > 0
      ? pctRound1((input.actualHours - input.quotedHours) / input.quotedHours)
      : null

  const amount_diff_pct =
    input.quotedAmount != null && input.quotedAmount > 0 && input.actualTotalKr != null
      ? pctRound1((input.actualTotalKr - input.quotedAmount) / input.quotedAmount)
      : null

  return { hours_diff_pct, amount_diff_pct }
}

export interface ProjectOutcomeRow {
  id: string
  business_id: string
  project_id: string
  quote_id: string | null
  job_type: string | null
  template_id: string | null

  quoted_amount: number | null
  quoted_hours: number | null
  quoted_labor_kr: number | null
  quoted_material_kr: number | null

  actual_hours: number
  actual_labor_kr: number | null
  actual_material_purchase_kr: number
  actual_material_billable_kr: number
  ata_signed_kr: number
  invoiced_kr: number
  margin_kr: number | null
  margin_pct: number | null
  expected_revenue_kr: number
  realized_revenue_kr: number | null
  realized_margin_kr: number | null
  realized_margin_pct: number | null
  labor_cost_configured: boolean

  hours_diff_pct: number | null
  amount_diff_pct: number | null

  calculation_version: number
  quote_source_type: QuoteBudgetSource | 'none'
  source_counts: OutcomeSourceCounts
  completeness_flags: OutcomeCompletenessFlags
  time_learning_eligible: boolean
  financial_learning_eligible: boolean
  learning_blockers: string[]
  computed_at: string
  frozen_at: string
  reconciled_at: string | null

  closed_at: string
}

export interface BuildOutcomeRowInput {
  projectId: string
  businessId: string
  quoteId: string | null
  jobType: string | null
  templateId: string | null
  closedAt: string
  frozenAt: string
  reconciledAt: string | null
  projectCompleted: boolean
  /** Endast de delar av ProjectEconomics vi faktiskt använder — pure
      function, ingen DB-läsning. */
  economics: Pick<ProjectEconomics, 'kostnader' | 'marginal' | 'intakter' | 'meta'>
  /** Null om projektet saknar quote_id (ingen offert kopplad — ingen
      jämförelse möjlig, se ärlighetsprincipen). */
  budget: Pick<QuoteBudgetDerivation, 'source' | 'budget_hours' | 'budget_amount' | 'labor_items'> | null
}

/**
 * Ren funktion: bygger en project_outcome-rad från redan beräknad
 * ekonomi/budget-data. Ingen I/O. Detta är kärnberäkningen facit-testerna
 * träffar direkt (indata → outcome-objekt).
 */
export function buildProjectOutcomeRow(input: BuildOutcomeRowInput): ProjectOutcomeRow {
  const quotedHours = input.budget?.budget_hours ?? null
  const quotedAmount = input.budget?.budget_amount ?? null

  // quoted_labor_kr härleds från labor_items (redan klassificerade av
  // getQuoteBudgetDerivation — vi duplicerar inte dess labor/material-
  // heuristik, bara summerar dess output). quoted_material_kr = resten av
  // quoted_amount. Båda null om ingen offert kopplad.
  const quotedLaborKr = input.budget
    ? Math.round(input.budget.labor_items.reduce((sum, item) => sum + (item.total || 0), 0))
    : null
  const quotedMaterialKr =
    quotedAmount != null && quotedLaborKr != null ? Math.round(quotedAmount - quotedLaborKr) : null

  const actualHours = input.economics.kostnader.arbete_timmar
  const actualLaborKr = input.economics.kostnader.arbete_kr
  const actualMaterialPurchaseKr = input.economics.kostnader.material_inkop_kr
  const actualMaterialBillableKr = input.economics.kostnader.material_billable_kr
  const totalActualKr = input.economics.kostnader.total_kr

  const laborCostConfigured = input.economics.marginal.arbetskostnad_konfigurerad
  const marginKr = input.economics.marginal.marginal_kr
  const marginPct = input.economics.marginal.marginal_pct

  const ataSignedKr = input.economics.intakter.ata_signerat_kr
  const invoicedKr = input.economics.intakter.fakturerat_kr
  const realizedRevenueKr = input.economics.intakter.fakturerat_ex_moms_kr

  const sourceCounts: OutcomeSourceCounts = {
    ata: input.economics.meta.ata_count,
    invoice: input.economics.meta.invoice_count,
    realized_invoice: input.economics.meta.realized_invoice_count,
    time_entry: input.economics.meta.time_entry_count,
    supplier_invoice: input.economics.meta.supplier_invoice_count,
    project_material: input.economics.meta.project_material_count,
    project_cost: input.economics.meta.extra_cost_count,
  }
  const costRowsPresent =
    sourceCounts.time_entry + sourceCounts.supplier_invoice +
      sourceCounts.project_material + sourceCounts.project_cost > 0
  // Etapp 1 leverantörsfakturor (2026-08-19): en supplier_invoices-rad och
  // en project_material-rad kan avse samma inköp — men bara om INGEN av dem
  // är länkad (project_material.supplier_invoice_id). Länkade par har
  // dubbelräkningen bevisat undanröjd i compute-economics.ts (fakturan
  // räknas via materialraden, aldrig separat), så bara KVARSTÅENDE olänkad
  // överlappning blockerar lärdata.
  const materialSourceOverlapFree = !(
    input.economics.meta.unlinked_supplier_invoice_count > 0 &&
    input.economics.meta.unlinked_project_material_count > 0
  )
  const quoteSourceType = input.budget?.source ?? 'none'
  const completenessFlags: OutcomeCompletenessFlags = {
    project_completed: input.projectCompleted,
    quote_linked: input.quoteId !== null,
    quote_budget_present: Boolean(input.budget && input.budget.budget_amount && input.budget.budget_amount > 0),
    quote_hours_present: Boolean(input.budget && input.budget.budget_hours && input.budget.budget_hours > 0),
    time_entries_present: sourceCounts.time_entry > 0,
    cost_rows_present: costRowsPresent,
    material_source_overlap_free: materialSourceOverlapFree,
    labor_cost_complete: laborCostConfigured,
    invoice_present: sourceCounts.realized_invoice > 0,
    invoice_net_amount_complete: input.economics.meta.invoice_net_amount_complete,
    realized_revenue_present: realizedRevenueKr != null && realizedRevenueKr > 0,
    source_reads_complete: true,
  }
  const timeLearningEligible =
    completenessFlags.project_completed &&
    completenessFlags.quote_linked &&
    completenessFlags.quote_budget_present &&
    completenessFlags.quote_hours_present &&
    completenessFlags.time_entries_present
  const financialLearningEligible =
    completenessFlags.project_completed &&
    completenessFlags.quote_linked &&
    completenessFlags.quote_budget_present &&
    completenessFlags.cost_rows_present &&
    completenessFlags.material_source_overlap_free &&
    completenessFlags.labor_cost_complete &&
    completenessFlags.invoice_present &&
    completenessFlags.invoice_net_amount_complete &&
    completenessFlags.realized_revenue_present &&
    totalActualKr !== null

  const realizedMarginKr = financialLearningEligible && totalActualKr != null
    ? Math.round((realizedRevenueKr as number) - totalActualKr)
    : null
  const realizedMarginPct = realizedMarginKr != null && realizedRevenueKr != null && realizedRevenueKr > 0
    ? Math.round((realizedMarginKr / realizedRevenueKr) * 1000) / 10
    : null

  const learningBlockers: string[] = []
  if (!completenessFlags.project_completed) learningBlockers.push('project_not_completed')
  if (!completenessFlags.quote_linked) learningBlockers.push('quote_not_linked')
  else if (!completenessFlags.quote_budget_present) learningBlockers.push('quote_budget_missing')
  if (!completenessFlags.quote_hours_present) learningBlockers.push('quoted_hours_missing')
  if (!completenessFlags.time_entries_present) learningBlockers.push('time_entries_missing')
  if (!completenessFlags.cost_rows_present) learningBlockers.push('cost_rows_missing')
  if (!completenessFlags.material_source_overlap_free) learningBlockers.push('material_source_overlap_unresolved')
  if (!completenessFlags.labor_cost_complete) learningBlockers.push('labor_cost_incomplete')
  if (!completenessFlags.invoice_present) learningBlockers.push('invoice_missing')
  else if (!completenessFlags.invoice_net_amount_complete) learningBlockers.push('invoice_net_amount_incomplete')
  else if (!completenessFlags.realized_revenue_present) learningBlockers.push('realized_revenue_missing')

  const { hours_diff_pct, amount_diff_pct } = computeOutcomeDiffs({
    quotedHours,
    actualHours,
    quotedAmount,
    actualTotalKr: totalActualKr,
  })

  return {
    // Deterministiskt id (== project_id-nyckeln) — gör upsert idempotent
    // utan att behöva läsa ev. befintlig rad först.
    id: `outc_${input.projectId}`,
    business_id: input.businessId,
    project_id: input.projectId,
    quote_id: input.quoteId,
    job_type: input.jobType,
    template_id: input.templateId,

    quoted_amount: quotedAmount,
    quoted_hours: quotedHours,
    quoted_labor_kr: quotedLaborKr,
    quoted_material_kr: quotedMaterialKr,

    actual_hours: actualHours,
    actual_labor_kr: actualLaborKr,
    actual_material_purchase_kr: actualMaterialPurchaseKr,
    actual_material_billable_kr: actualMaterialBillableKr,
    ata_signed_kr: ataSignedKr,
    invoiced_kr: invoicedKr,
    margin_kr: marginKr,
    margin_pct: marginPct,
    expected_revenue_kr: input.economics.intakter.forvantad_intakt_kr,
    realized_revenue_kr: realizedRevenueKr,
    realized_margin_kr: realizedMarginKr,
    realized_margin_pct: realizedMarginPct,
    labor_cost_configured: laborCostConfigured,

    hours_diff_pct,
    amount_diff_pct,

    calculation_version: OUTCOME_CALCULATION_VERSION,
    quote_source_type: quoteSourceType,
    source_counts: sourceCounts,
    completeness_flags: completenessFlags,
    time_learning_eligible: timeLearningEligible,
    financial_learning_eligible: financialLearningEligible,
    learning_blockers: learningBlockers,
    computed_at: input.economics.meta.computed_at,
    frozen_at: input.frozenAt,
    reconciled_at: input.reconciledAt,

    closed_at: input.closedAt,
  }
}

// ─────────────────────────────────────────────────────────────────
// Orkestrering — DB-läsning + fail-safe skrivning
// ─────────────────────────────────────────────────────────────────

interface ProjectRowForFreeze {
  project_id: string
  business_id: string
  status: string | null
  quote_id: string | null
  job_type: string | null
  completed_at: string | null
}

/** Loggas bara en gång per körande process — migrationerna körs manuellt
    av Andreas, ingen anledning att spamma loggen vid varje projektstängning
    innan den är körd. */
let missingTableWarned = false

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  // Postgres undefined_table, eller PostgREST-felmeddelandet för samma sak.
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')
}

function isMissingQualitySchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return isMissingTableError(error) || error.code === '42703' || error.code === 'PGRST204'
}

export type FreezeOutcomeFailureCode =
  | 'project_not_found'
  | 'project_not_completed'
  | 'completion_timestamp_missing'
  | 'source_read_failed'
  | 'quote_read_failed'
  | 'schema_missing'
  | 'upsert_failed'
  | 'unexpected'

export type FreezeOutcomeResult =
  | { ok: true; row: ProjectOutcomeRow }
  | { ok: false; code: FreezeOutcomeFailureCode; message: string }

async function freezeFailure(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  code: FreezeOutcomeFailureCode,
  message: string,
): Promise<FreezeOutcomeResult> {
  console.error('[freeze-outcome] frysning misslyckades', { projectId, code, message })
  try {
    await rapporteraTystFel(
      supabase,
      businessId,
      `freeze-outcome:${code}`,
      message,
      { projectId },
    )
  } catch (reportError) {
    console.error('[freeze-outcome] driftlarmet kunde inte sparas', { projectId, code, reportError })
  }
  return { ok: false, code, message }
}

/**
 * Fryser utfall-vs-offert för ett stängt projekt. FAIL-SAFE: kastar
 * aldrig. Anropas från BÅDA stängningsvägarna (app/api/projects/route.ts
 * PUT och app/api/booking/complete-job/route.ts) direkt efter
 * autoInvoiceOnComplete, bara när status faktiskt blev 'completed'.
 */
export async function freezeProjectOutcome(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  options: { reconciliation?: boolean; now?: Date } = {},
): Promise<FreezeOutcomeResult> {
  try {
    const { data: projectRow, error: projectErr } = await supabase
      .from('project')
      .select('project_id, business_id, status, quote_id, job_type, completed_at')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (projectErr || !projectRow) {
      return freezeFailure(
        supabase,
        businessId,
        projectId,
        'project_not_found',
        projectErr?.message || 'projekt hittades inte',
      )
    }

    const project = projectRow as ProjectRowForFreeze
    if (project.status !== 'completed') {
      return {
        ok: false,
        code: 'project_not_completed',
        message: 'Projektet är inte avslutat och får inte bli träningsdata.',
      }
    }
    if (!project.completed_at) {
      return freezeFailure(
        supabase,
        businessId,
        projectId,
        'completion_timestamp_missing',
        'Projektet saknar completed_at och får inte få ett påhittat stängningsdatum.',
      )
    }

    const economics = await computeProjectEconomics(supabase, projectId, businessId)
    if (!economics) {
      return freezeFailure(
        supabase,
        businessId,
        projectId,
        'source_read_failed',
        'computeProjectEconomics gav null',
      )
    }

    let quoteId: string | null = project.quote_id || null
    let templateId: string | null = null
    let jobType: string | null = project.job_type || null
    let budget: QuoteBudgetDerivation | null = null

    if (quoteId) {
      try {
        budget = await getQuoteBudgetDerivation(supabase, quoteId, businessId)
      } catch (quoteBudgetError) {
        return freezeFailure(
          supabase,
          businessId,
          projectId,
          'quote_read_failed',
          quoteBudgetError instanceof Error ? quoteBudgetError.message : String(quoteBudgetError),
        )
      }

      const { data: quoteRow, error: quoteError } = await supabase
        .from('quotes')
        .select('template_id, job_type')
        .eq('quote_id', quoteId)
        .eq('business_id', businessId)
        .maybeSingle()

      if (quoteError) {
        return freezeFailure(
          supabase,
          businessId,
          projectId,
          'quote_read_failed',
          quoteError.message,
        )
      }

      if (quoteRow) {
        templateId = (quoteRow as { template_id: string | null }).template_id || null
        // project.job_type är primär grupperingsnyckel (v49, backfillad).
        // quotes.job_type är sekundär fallback om projektet saknar den.
        if (!jobType) jobType = (quoteRow as { job_type: string | null }).job_type || null
      }
    }

    const nowIso = (options.now ?? new Date()).toISOString()

    const row = buildProjectOutcomeRow({
      projectId,
      businessId,
      quoteId,
      jobType,
      templateId,
      closedAt: project.completed_at,
      frozenAt: nowIso,
      reconciledAt: options.reconciliation ? nowIso : null,
      projectCompleted: true,
      economics,
      budget,
    })

    const { error: upsertErr } = await supabase
      .from('project_outcome')
      .upsert(row, { onConflict: 'project_id' })

    if (upsertErr) {
      if (isMissingQualitySchemaError(upsertErr)) {
        // Väntat innan kvalitetsschemat körts — larma inte driftlarmet
        // för ett känt, väntat tillstånd. Samma konvention som arSchemaSaknas
        // i lib/observability/driftlarm.ts.
        if (!missingTableWarned) {
          missingTableWarned = true
          console.error(
            '[freeze-outcome] kvalitetsschemat saknas (kör först v73 och därefter sql/v138_outcome_quality_gate.sql) — skippar frysning tills vidare',
            upsertErr,
          )
        }
        return {
          ok: false,
          code: 'schema_missing',
          message: 'Kör sql/v138_outcome_quality_gate.sql manuellt före aktivering.',
        }
      }
      return freezeFailure(
        supabase,
        businessId,
        projectId,
        'upsert_failed',
        upsertErr.message,
      )
    }
    return { ok: true, row }
  } catch (err) {
    // Absolut sista skyddsnät — freezeProjectOutcome får ALDRIG fälla
    // anroparen (projektstängning/autofakturering har redan körts).
    return freezeFailure(
      supabase,
      businessId,
      projectId,
      err instanceof ProjectEconomicsSourceError ? 'source_read_failed' : 'unexpected',
      err instanceof Error ? err.message : String(err),
    )
  }
}
