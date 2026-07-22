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
import { computeProjectEconomics, type ProjectEconomics } from '@/lib/projects/compute-economics'
import {
  getQuoteBudgetDerivation,
  type QuoteBudgetDerivation,
} from '@/lib/quotes/get-quote-budget-derivation'

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
  labor_cost_configured: boolean

  hours_diff_pct: number | null
  amount_diff_pct: number | null

  closed_at: string
}

export interface BuildOutcomeRowInput {
  projectId: string
  businessId: string
  quoteId: string | null
  jobType: string | null
  templateId: string | null
  closedAt: string
  /** Endast de delar av ProjectEconomics vi faktiskt använder — pure
      function, ingen DB-läsning. */
  economics: Pick<ProjectEconomics, 'kostnader' | 'marginal' | 'intakter'>
  /** Null om projektet saknar quote_id (ingen offert kopplad — ingen
      jämförelse möjlig, se ärlighetsprincipen). */
  budget: Pick<QuoteBudgetDerivation, 'budget_hours' | 'budget_amount' | 'labor_items'> | null
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
    labor_cost_configured: laborCostConfigured,

    hours_diff_pct,
    amount_diff_pct,

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
}

/** Loggas bara en gång per körande process — v73-migrationen körs manuellt
    av Andreas, ingen anledning att spamma loggen vid varje projektstängning
    innan den är körd. */
let missingTableWarned = false

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  // Postgres undefined_table, eller PostgREST-felmeddelandet för samma sak.
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')
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
): Promise<void> {
  try {
    const { data: projectRow, error: projectErr } = await supabase
      .from('project')
      .select('project_id, business_id, status, quote_id, job_type')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .single()

    if (projectErr || !projectRow) {
      console.error('[freeze-outcome] projekt hittades inte, skippar frysning', {
        projectId,
        businessId,
        error: projectErr,
      })
      return
    }

    const project = projectRow as ProjectRowForFreeze

    const economics = await computeProjectEconomics(supabase, projectId, businessId)
    if (!economics) {
      console.error('[freeze-outcome] computeProjectEconomics gav null, skippar frysning', { projectId })
      return
    }

    let quoteId: string | null = project.quote_id || null
    let templateId: string | null = null
    let jobType: string | null = project.job_type || null
    let budget: QuoteBudgetDerivation | null = null

    if (quoteId) {
      budget = await getQuoteBudgetDerivation(supabase, quoteId, businessId)

      const { data: quoteRow } = await supabase
        .from('quotes')
        .select('template_id, job_type')
        .eq('quote_id', quoteId)
        .eq('business_id', businessId)
        .maybeSingle()

      if (quoteRow) {
        templateId = (quoteRow as { template_id: string | null }).template_id || null
        // project.job_type är primär grupperingsnyckel (v49, backfillad).
        // quotes.job_type är sekundär fallback om projektet saknar den.
        if (!jobType) jobType = (quoteRow as { job_type: string | null }).job_type || null
      }
    }

    const row = buildProjectOutcomeRow({
      projectId,
      businessId,
      quoteId,
      jobType,
      templateId,
      closedAt: new Date().toISOString(),
      economics,
      budget,
    })

    const { error: upsertErr } = await supabase
      .from('project_outcome')
      .upsert(row, { onConflict: 'project_id' })

    if (upsertErr) {
      if (isMissingTableError(upsertErr)) {
        if (!missingTableWarned) {
          missingTableWarned = true
          console.error(
            '[freeze-outcome] project_outcome-tabellen saknas (kör sql/v73_efterkalkyl.sql) — skippar frysning tyst tills vidare',
            upsertErr,
          )
        }
        return
      }
      console.error('[freeze-outcome] upsert misslyckades, skippar frysning', { projectId, error: upsertErr })
      return
    }
  } catch (err) {
    // Absolut sista skyddsnät — freezeProjectOutcome får ALDRIG fälla
    // anroparen (projektstängning/autofakturering har redan körts).
    console.error('[freeze-outcome] oväntat fel (fail-safe, ignoreras)', { projectId, businessId, error: err })
  }
}
