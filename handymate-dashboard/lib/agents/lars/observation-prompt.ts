/**
 * Lars observation-pipeline — Projektledare med fokus på scope-creep,
 * lönsamhet per projekt-storlek, ÄTA-pipeline och booking-completion.
 *
 * Klonad från Karin-mönstret 2026-05-18 (Phase C1). Använder shared:
 * - lib/agents/shared/schema-block (SCHEMA_BLOCK)
 * - lib/agents/shared/normalize (AgentObservation + normalizeObservation)
 * - lib/agents/shared/thinking-call (callAgentWithThinking + AgentDebugInfo)
 * - lib/agents/shared/save-and-push (saveAndPush med agentId='lars')
 *
 * Tre-nivåer fallback:
 *   - 0 projekt 90d: skip 'no_projects_last_90d'
 *   - 1-4 projekt: skip 'insufficient_data'
 *   - 5-9 projekt: 'early_stage' — relation-byggande
 *   - 10+ projekt: 'full_analysis' — hypotes-driven djupanalys
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEMA_BLOCK } from '@/lib/agents/shared/schema-block'
import { type AgentObservation } from '@/lib/agents/shared/normalize'
import {
  callAgentWithThinking,
  type AgentDebugInfo,
} from '@/lib/agents/shared/thinking-call'
import { saveAndPush } from '@/lib/agents/shared/save-and-push'
import {
  computeProjectEconomics,
  type ProjectEconomics,
} from '@/lib/projects/compute-economics'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export type LarsObservation = AgentObservation
export type LarsDebugInfo = AgentDebugInfo

export const LARS_CODE_VERSION = 'lars-v1-2026-05-18'

export interface LarsRunResult {
  skipped?: string
  reason?: string
  aggregate?: LarsAggregate
  data_maturity?: 'early_stage' | 'full_analysis'
  observations_total?: number
  saved?: number
  approvals_created?: number
  insights_pushed?: number
  thinking_preview?: string
  error?: string
  debug?: LarsDebugInfo
}

// ─────────────────────────────────────────────────────────────────
// Aggregate-typer
// ─────────────────────────────────────────────────────────────────

// Etapp 2.4 (2026-05-22): ProjectRow innehåller nu BARA grunddata.
// Marginal, kostnader och alla "actual_*"-fält hämtas via
// computeProjectEconomics (per projekt) — inga snapshot-läsningar
// av stale actual_labor_cost / actual_material_cost / profitability_status.
interface ProjectRow {
  project_id: string
  name: string | null
  customer_id: string | null
  status: string
  budget_hours: number | null
  budget_amount: number | null
  completed_at: string | null
  created_at: string
}

interface BookingRow {
  booking_id: string
  status: string
  scheduled_start: string
  project_id: string | null
}

interface ProjectChangeRow {
  change_id: string
  status: string
  total: number | null
  change_type: string | null
  signed_at: string | null
  sent_at: string | null
  declined_at: string | null
  created_at: string
  project_id: string | null
}

interface InvoiceRow {
  invoice_id: string
  project_id: string | null
  total: number | null
  status: string | null
  paid_at: string | null
  invoice_date: string | null
}

export interface LarsAggregate {
  period_days: 90
  projects_90d: {
    total_count: number
    completed_count: number
    active_count: number
    // over_budget_count räknas nu från helpern: arbetskostnad_konfigurerad
    // OCH total_kr > forvantad_intakt
    over_budget_count: number
    // Projekt där vi inte kan beräkna marginal (timrader utan intern
    // kostnad satt) — ärlighet vid saknad data.
    missing_cost_config_count: number
    avg_margin_pct: number | null
    over_budget_samples: Array<{
      project_id: string
      name: string
      budget_amount: number
      actual_total_cost: number
      pct_over: number
    }>
  }
  // Etapp 2.4: full ekonomi per projekt via computeProjectEconomics.
  // Lars använder dessa istället för stale snapshot-kolumner.
  project_economics: Array<{
    project_id: string
    name: string
    status: string
    budget_amount: number
    forvantad_intakt_kr: number
    fakturerat_kr: number
    betalt_kr: number
    total_cost_kr: number | null
    marginal_kr: number | null
    marginal_pct: number | null
    arbetskostnad_konfigurerad: boolean
    timrader_utan_kostnad: number
    // TD-63: ärlighet vid ofullständig kostnadsregistrering.
    // false = marginal-siffran är preliminär (lite kostnad registrerad
    // hittills relativt budgeten), inte verklig lönsamhet.
    kostnad_sannolikt_komplett: boolean
    kostnad_completeness_pct: number | null
    // TD-63b: projektet är helt tomt (varken budget eller kostnad).
    // Vinner över preliminär-flaggan — tomma projekt ska skippas i
    // marginal-analyser, inte flaggas som preliminära.
    är_tomt: boolean
  }>
  // Lista av projekt där marginal EJ kan beräknas pga saknad intern-
  // kostnad. Lars ska refera till dessa explicit i sina observationer
  // istället för att räkna fram en falskt hög marginal.
  projects_missing_internal_cost: Array<{
    project_id: string
    name: string
    budget_amount: number
    timrader_utan_kostnad: number
  }>
  scope_creep: {
    completed_with_budget: number
    avg_pct_actual_vs_budget: number | null
    projects_over_120_pct_count: number
    projects_over_120_pct_pct: number | null
  }
  by_project_size: {
    small_under_50k: {
      count: number
      completed: number
      avg_margin_pct: number | null
    }
    large_over_50k: {
      count: number
      completed: number
      avg_margin_pct: number | null
    }
  }
  bookings_90d: {
    total_count: number
    completed_count: number
    cancelled_count: number
    pending_count: number
    completion_rate_pct: number | null
  }
  ata_pipeline: {
    total_count: number
    sent_count: number
    signed_count: number
    declined_count: number
    pending_count: number
    sign_rate_pct: number | null
    total_signed_value_kr: number
    avg_signed_value_kr: number | null
  }
  // Tillagt v52 (2026-05-20): invoice WHERE project_id direkt-läsning.
  // Bygger på `invoice.project_id`-kolumnen som lades till i samma
  // migration. Låser upp marginal-analys per projekt — Lars kunde
  // tidigare bara läsa snapshot-kolumner (`actual_*`) som ej synkades
  // tillförlitligt.
  invoicing_90d: {
    total_count: number
    with_project_id_count: number
    total_invoiced_kr: number
    total_paid_kr: number
    paid_rate_pct: number | null
    under_invoiced_samples: Array<{
      project_id: string
      name: string
      budget_amount: number
      invoiced_kr: number
      gap_kr: number
    }>
  }
}

// ─────────────────────────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────────────────────────

/** Avgör om ett projekt är "över budget" från helper-data.
 *  Kräver att arbetskostnad är konfigurerad — annars vet vi inte. */
function isOverBudgetFromEconomics(e: ProjectEconomics): boolean {
  if (!e.marginal.arbetskostnad_konfigurerad) return false
  if (e.kostnader.total_kr == null) return false
  return e.kostnader.total_kr > e.intakter.forvantad_intakt_kr
}

/** Beräkna marginal-percent från helper-data, eller null om
 *  arbetskostnad ej konfigurerad eller intäkt = 0. */
function marginPctFromEconomics(e: ProjectEconomics): number | null {
  if (!e.marginal.arbetskostnad_konfigurerad) return null
  return e.marginal.marginal_pct
}

async function buildLarsAggregate(
  supabase: SupabaseClient,
  businessId: string,
): Promise<LarsAggregate | null> {
  const now = Date.now()
  const ninetyDaysAgo = new Date(now - 90 * 86400000)

  // ── Projekt (90d) ─────────────────────────────────────────
  const { data: projectsData, error: projectsError } = await supabase
    .from('project')
    .select('project_id, name, customer_id, status, budget_hours, budget_amount, completed_at, created_at')
    .eq('business_id', businessId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(300)

  if (projectsError) {
    console.error('[lars/aggregate] project query error:', projectsError)
    return null
  }

  if (!projectsData || projectsData.length === 0) {
    return null
  }

  const projects = projectsData as ProjectRow[]
  const completed = projects.filter(p => p.status === 'completed')
  const active = projects.filter(p => p.status === 'active' || p.status === 'planning')

  // ── Etapp 2.4: full ekonomi via computeProjectEconomics per projekt ──
  // Anropar helpern parallellt med Promise.all. För ~25 projekt blir
  // det ~25 helper-anrop = ~175 round-trips totalt (helpern gör ~7
  // queries internt). TD-62 loggat om vi behöver batcha senare.
  const economicsResults = await Promise.all(
    projects.map(p => computeProjectEconomics(supabase, p.project_id, businessId)),
  )
  const economicsByProjectId = new Map<string, ProjectEconomics>()
  for (let i = 0; i < projects.length; i++) {
    const e = economicsResults[i]
    if (e) economicsByProjectId.set(projects[i].project_id, e)
  }

  // Strukturerad lista per projekt — det är denna data Lars använder
  // i sina observationer (inte snapshot-fält).
  const projectEconomicsList = projects.map(p => {
    const e = economicsByProjectId.get(p.project_id)
    return {
      project_id: p.project_id,
      name: p.name || '(namnlöst)',
      status: p.status,
      budget_amount: Math.round(Number(p.budget_amount || 0)),
      forvantad_intakt_kr: e?.intakter.forvantad_intakt_kr ?? Math.round(Number(p.budget_amount || 0)),
      fakturerat_kr: e?.intakter.fakturerat_kr ?? 0,
      betalt_kr: e?.intakter.betalt_kr ?? 0,
      total_cost_kr: e?.kostnader.total_kr ?? null,
      marginal_kr: e?.marginal.marginal_kr ?? null,
      marginal_pct: e?.marginal.marginal_pct ?? null,
      arbetskostnad_konfigurerad: e?.marginal.arbetskostnad_konfigurerad ?? false,
      timrader_utan_kostnad: e?.marginal.timrader_utan_kostnad ?? 0,
      kostnad_sannolikt_komplett: e?.marginal.kostnad_sannolikt_komplett ?? false,
      kostnad_completeness_pct: e?.marginal.kostnad_completeness_pct ?? null,
      är_tomt: e?.marginal.är_tomt ?? false,
    }
  })

  // Projekt där marginal EJ kan beräknas — Lars ska referera till
  // dessa explicit istället för att gissa.
  const projectsMissingInternalCost = projectEconomicsList
    .filter(p => !p.arbetskostnad_konfigurerad && p.timrader_utan_kostnad > 0)
    .map(p => ({
      project_id: p.project_id,
      name: p.name,
      budget_amount: p.budget_amount,
      timrader_utan_kostnad: p.timrader_utan_kostnad,
    }))
    .sort((a, b) => b.timrader_utan_kostnad - a.timrader_utan_kostnad)
    .slice(0, 10)

  // Över-budget-projekt (helper-bedömt, ej snapshot)
  const overBudgetEconomics = Array.from(economicsByProjectId.values())
    .filter(isOverBudgetFromEconomics)

  // Genomsnittlig marginal — endast räknat på projekt med konfigurerad
  // arbetskostnad. Projekt utan kostnad-config exkluderas (de skulle
  // annars sänka snittet med null:s).
  const completedWithEconomics = completed
    .map(p => economicsByProjectId.get(p.project_id))
    .filter((e): e is ProjectEconomics => e !== undefined)
  const completedWithMargin = completedWithEconomics
    .filter(e => e.marginal.arbetskostnad_konfigurerad && Number(e.intakter.forvantad_intakt_kr) > 0)
  const completedMargins = completedWithMargin
    .map(e => marginPctFromEconomics(e))
    .filter((m): m is number => m !== null)
  const avgMarginPct = completedMargins.length > 0
    ? Math.round(completedMargins.reduce((s, m) => s + m, 0) / completedMargins.length)
    : null

  // Top 5 over-budget samples — helper-baserade, alltid pålitliga
  const overBudgetSamples = overBudgetEconomics
    .map(e => {
      const proj = projects.find(p => p.project_id === e.project_id)
      const budget = e.intakter.forvantad_intakt_kr
      const totalCost = e.kostnader.total_kr || 0
      const pctOver = budget > 0 ? Math.round(((totalCost - budget) / budget) * 100) : 0
      return {
        project_id: e.project_id,
        name: proj?.name || '(namnlöst)',
        budget_amount: Math.round(budget),
        actual_total_cost: Math.round(totalCost),
        pct_over: pctOver,
      }
    })
    .sort((a, b) => b.pct_over - a.pct_over)
    .slice(0, 5)

  // ── Scope-creep (faktiska timmar vs budget-timmar) ───────
  // Använder arbete_timmar från helpern istället för project.actual_hours.
  const completedWithHours = completed.filter(p => {
    if (!(Number(p.budget_hours || 0) > 0)) return false
    const e = economicsByProjectId.get(p.project_id)
    return e ? e.kostnader.arbete_timmar > 0 : false
  })
  let avgActualVsBudgetPct: number | null = null
  let projectsOver120Count = 0
  if (completedWithHours.length > 0) {
    const ratios = completedWithHours.map(p => {
      const e = economicsByProjectId.get(p.project_id)
      const budgetHours = Number(p.budget_hours || 0)
      const actualHours = e?.kostnader.arbete_timmar || 0
      return budgetHours > 0 ? Math.round((actualHours / budgetHours) * 100) : null
    }).filter((r): r is number => r !== null)
    if (ratios.length > 0) {
      avgActualVsBudgetPct = Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length)
      projectsOver120Count = ratios.filter(r => r > 120).length
    }
  }

  // ── Projekt-storlek (under/över 50k SEK) ─────────────────
  // Marginal per storleksklass — bara från projekt med konfigurerad
  // arbetskostnad.
  const small = projects.filter(p => Number(p.budget_amount || 0) > 0 && Number(p.budget_amount) < 50000)
  const large = projects.filter(p => Number(p.budget_amount || 0) >= 50000)
  const smallCompleted = small.filter(p => p.status === 'completed')
  const largeCompleted = large.filter(p => p.status === 'completed')

  const collectMargins = (rows: ProjectRow[]): number[] =>
    rows
      .map(p => economicsByProjectId.get(p.project_id))
      .filter((e): e is ProjectEconomics => !!e && e.marginal.arbetskostnad_konfigurerad)
      .map(e => e.marginal.marginal_pct)
      .filter((m): m is number => m !== null)

  const smallMargins = collectMargins(smallCompleted)
  const largeMargins = collectMargins(largeCompleted)

  const smallAvgMargin = smallMargins.length > 0
    ? Math.round(smallMargins.reduce((s, m) => s + m, 0) / smallMargins.length)
    : null
  const largeAvgMargin = largeMargins.length > 0
    ? Math.round(largeMargins.reduce((s, m) => s + m, 0) / largeMargins.length)
    : null

  // ── Bokningar (90d) ──────────────────────────────────────
  const { data: bookingsData } = await supabase
    .from('booking')
    .select('booking_id, status, scheduled_start, project_id')
    .eq('business_id', businessId)
    .gte('scheduled_start', ninetyDaysAgo.toISOString())
    .limit(500)

  const bookings = (bookingsData || []) as BookingRow[]
  const bookCompleted = bookings.filter(b => b.status === 'completed')
  const bookCancelled = bookings.filter(b => b.status === 'cancelled')
  const bookPending = bookings.filter(b => !['completed', 'cancelled'].includes(b.status))
  const decidedBookings = bookCompleted.length + bookCancelled.length
  const completionRate = decidedBookings > 0
    ? Math.round((bookCompleted.length / decidedBookings) * 100)
    : null

  // ── ÄTA-pipeline (90d, project_change-tabellen) ──────────
  const { data: changesData } = await supabase
    .from('project_change')
    .select('change_id, status, total, change_type, signed_at, sent_at, declined_at, created_at, project_id')
    .eq('business_id', businessId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(300)

  const changes = (changesData || []) as ProjectChangeRow[]
  const ataSent = changes.filter(c => c.sent_at !== null)
  const ataSigned = changes.filter(c => c.signed_at !== null || c.status === 'signed' || c.status === 'invoiced')
  const ataDeclined = changes.filter(c => c.declined_at !== null || c.status === 'declined')
  const ataPending = changes.filter(c => c.sent_at === null && c.status !== 'declined')

  const ataDecided = ataSigned.length + ataDeclined.length
  const signRate = ataDecided > 0
    ? Math.round((ataSigned.length / ataDecided) * 100)
    : null

  const ataSignedValue = ataSigned.reduce((s, c) => s + Math.abs(Number(c.total || 0)), 0)
  const ataAvgSignedValue = ataSigned.length > 0
    ? Math.round(ataSignedValue / ataSigned.length)
    : null

  // ── Invoice (90d, v52 invoice.project_id) ────────────────
  // Direkt-läsning per projekt. Karins mönster (hon läser invoice för
  // cash-flow); Lars läser samma tabell men slicar per projekt-id.
  const { data: invoicesData } = await supabase
    .from('invoice')
    .select('invoice_id, project_id, total, status, paid_at, invoice_date')
    .eq('business_id', businessId)
    .gte('invoice_date', ninetyDaysAgo.toISOString().split('T')[0])
    .limit(500)

  const invoices = (invoicesData || []) as InvoiceRow[]
  const invoicesWithProject = invoices.filter(i => i.project_id !== null)

  const totalInvoicedKr = invoicesWithProject.reduce(
    (s, i) => s + Number(i.total || 0),
    0,
  )
  const totalPaidKr = invoicesWithProject
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + Number(i.total || 0), 0)
  const paidRatePct = totalInvoicedKr > 0
    ? Math.round((totalPaidKr / totalInvoicedKr) * 100)
    : null

  // Aggregera fakturerat per projekt
  const invoicedByProject = new Map<string, number>()
  for (const inv of invoicesWithProject) {
    const key = inv.project_id!
    invoicedByProject.set(key, (invoicedByProject.get(key) || 0) + Number(inv.total || 0))
  }

  // Top 5 under-invoiced projekt (har offert men fakturerat <80% av budget)
  const underInvoicedSamples = projects
    .filter(p => Number(p.budget_amount || 0) > 0)
    .map(p => {
      const budget = Number(p.budget_amount || 0)
      const invoiced = invoicedByProject.get(p.project_id) || 0
      return {
        project_id: p.project_id,
        name: p.name || '(namnlöst)',
        budget_amount: Math.round(budget),
        invoiced_kr: Math.round(invoiced),
        gap_kr: Math.round(budget - invoiced),
      }
    })
    .filter(s => s.gap_kr > 0 && s.invoiced_kr / s.budget_amount < 0.8)
    .sort((a, b) => b.gap_kr - a.gap_kr)
    .slice(0, 5)

  return {
    period_days: 90,
    projects_90d: {
      total_count: projects.length,
      completed_count: completed.length,
      active_count: active.length,
      over_budget_count: overBudgetEconomics.length,
      missing_cost_config_count: projectsMissingInternalCost.length,
      avg_margin_pct: avgMarginPct,
      over_budget_samples: overBudgetSamples,
    },
    project_economics: projectEconomicsList,
    projects_missing_internal_cost: projectsMissingInternalCost,
    scope_creep: {
      completed_with_budget: completedWithHours.length,
      avg_pct_actual_vs_budget: avgActualVsBudgetPct,
      projects_over_120_pct_count: projectsOver120Count,
      projects_over_120_pct_pct:
        completedWithHours.length > 0
          ? Math.round((projectsOver120Count / completedWithHours.length) * 100)
          : null,
    },
    by_project_size: {
      small_under_50k: {
        count: small.length,
        completed: smallCompleted.length,
        avg_margin_pct: smallAvgMargin,
      },
      large_over_50k: {
        count: large.length,
        completed: largeCompleted.length,
        avg_margin_pct: largeAvgMargin,
      },
    },
    bookings_90d: {
      total_count: bookings.length,
      completed_count: bookCompleted.length,
      cancelled_count: bookCancelled.length,
      pending_count: bookPending.length,
      completion_rate_pct: completionRate,
    },
    ata_pipeline: {
      total_count: changes.length,
      sent_count: ataSent.length,
      signed_count: ataSigned.length,
      declined_count: ataDeclined.length,
      pending_count: ataPending.length,
      sign_rate_pct: signRate,
      total_signed_value_kr: Math.round(ataSignedValue),
      avg_signed_value_kr: ataAvgSignedValue,
    },
    invoicing_90d: {
      total_count: invoices.length,
      with_project_id_count: invoicesWithProject.length,
      total_invoiced_kr: Math.round(totalInvoicedKr),
      total_paid_kr: Math.round(totalPaidKr),
      paid_rate_pct: paidRatePct,
      under_invoiced_samples: underInvoicedSamples,
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// Hypotes-driven prompt
// ─────────────────────────────────────────────────────────────────

function buildLarsSystemPrompt(
  businessName: string,
  maturity: 'early_stage' | 'full_analysis',
): string {
  if (maturity === 'early_stage') {
    return `Du är Lars, projektledare hos ${businessName}. Du är ny på företaget och har precis fått tillgång till projekt-flödet.

Du ser att det finns lite data — färre än 10 projekt senaste 90 dagarna. Det räcker inte för djupanalys, men det är dags att presentera sig och flagga vad du tänker hålla extra koll på.

Generera EXAKT 1 observation av typen "early-stage relation-byggande". Anpassa siffrorna till verkliga aggregatet. Var lugn och saklig — du är operatören som håller hjulen i rullning, inte säljaren.

REGLER:
- 1 observation, inte fler.
- knowledge_type: 'insight'
- suggestion: null (ren introduktion, ingen action)
- confidence: 0.9
- data_basis: { period_days, project_count, completed_count, note: 'early_stage_introduction' }
- dedup_key: "lars_early_stage_intro" (OBLIGATORISK i denna prompt — så denna introduktion
  inte upprepas vid nästa körning även om du formulerar titeln lite annorlunda)

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen, anpassa siffrorna:

[
  {
    "knowledge_type": "insight",
    "title": "Jag börjar förstå projekt-flödet",
    "observation": "Hej! Lars här, din projektledare. Hittills har jag sett 7 projekt — 3 färdiga och 4 aktiva — de senaste 90 dagarna. Det räcker för att börja känna takten, men berätta gärna vilka projekt du vill att jag håller extra koll på framöver.",
    "suggestion": null,
    "confidence": 0.9,
    "data_basis": {
      "period_days": 90,
      "project_count": 7,
      "completed_count": 3,
      "note": "early_stage_introduction"
    },
    "dedup_key": "lars_early_stage_intro"
  }
]`
  }

  return `Du är Lars, projektledare hos ${businessName}. Du håller koll på operativ effektivitet — scope, tid, material, ÄTA-flöde. Du analyserar senaste 90 dagarnas projekt-data med dessa konkreta hypoteser:

1. **Scope-creep per projekt-typ:**
   - Vilka projekt har gått 20%+ över budget-timmar?
   - Återkommande mönster — ex. badrum drar oftare över än kök?
   - Finns systematisk underestimering vid offert?

2. **Lönsamhet per projekt-storlek:**
   - Är små projekt (<50k SEK) mer eller mindre lönsamma än stora?
   - Vilken storleksklass har lägst marginal — och vad är orsaken?
   - Var lägger vi tid med dålig avkastning?
   - **ÄRLIGHET (Etapp 2.4):** Använd \`projects_90d.avg_margin_pct\` och \`by_project_size.*.avg_margin_pct\` — dessa räknas BARA på projekt med konfigurerad intern timkostnad. Om \`missing_cost_config_count > 0\`, notera det i din observation. ALDRIG hitta på en marginal-siffra för projekt utan kostnadsdata.

2b. **Projekt med saknad intern-kostnad (kritisk för datakvalitet):**
   - Lista i \`projects_missing_internal_cost\` är projekt där vi INTE kan beräkna marginal pga ingen intern timkostnad satt på medlemmar/business-default
   - Om listan är icke-tom: säg explicit "X projekt saknar kostnadsdata — sätt intern timkostnad på medlemmar för att låsa upp marginal-analys"
   - Detta är INTE en negativ observation — det är ärlighet om att verktyget behöver mer data

2c. **Förlustprojekt (negativ marginal):**
   - Använd \`project_economics\` — projekt där \`arbetskostnad_konfigurerad=true\` OCH \`marginal_kr < 0\`
   - Om någon ligger på 25%+ förlust, lyft det med projektnamn och belopp
   - Suggestion: "se över ÄTA-möjligheter" eller "granska tidsåtgång"

2d. **Preliminär marginal (KRITISK ärlighet, TD-63):**
   - Ett projekt där \`kostnad_sannolikt_komplett=false\` har så lite registrerad kostnad relativt budgeten att marginal-siffran SANNOLIKT är vilseledande
   - **TD-63b: HOPPA ÖVER projekt där \`är_tomt=true\`** — dessa är helt tomma (varken budget eller kostnad), inte preliminära. De är inte värda att kommentera marginal-mässigt alls.
   - Exempel: 85 000 kr budget med 2 083 kr registrerad kostnad ger matematiskt 98% marginal — men det är pågående data, inte verklig lönsamhet
   - ALDRIG säg "superlönsamt" eller "fantastisk marginal" om \`kostnad_sannolikt_komplett=false\` OCH \`är_tomt=false\`. Säg istället: "Preliminär marginal — bara X% av budgeten registrerad som kostnad hittills"
   - Ton: sakligt ärligt om datamognad, inte negativt. Samma anda som 2b
   - Använd \`kostnad_completeness_pct\` för att uttrycka hur mycket av budgeten som registrerats

3. **ÄTA-flödet:**
   - Skickas ÄTA:er ut i tid? (skapade men ej sent_at?)
   - Vad är signing-raten på utskickade ÄTA?
   - Vilken kund-segment har bäst ÄTA-godkännandegrad?

4. **Booking-completion:**
   - Vilken andel av bokningar slutförs vs avbokas?
   - Finns kunder/projekt med upprepade avbokningar?
   - Påverkar avbokningar projekt-timeline märkbart?

5. **Faktureringstakt vs offert (v52, ny):**
   - Vilka projekt i \`invoicing_90d.under_invoiced_samples\` har stor gap mellan offert-summa och fakturerat? Tappade vi en delfaktura?
   - Total \`paid_rate_pct\` — sittfaktureringar långsamma i betalning?
   - Finns aktiva projekt utan en enda faktura där arbetet pågått längre än rimligt?

Generera 1-3 KORTA observationer (max 2-3 meningar var) med konkret suggestion när det är vettigt.

Var inte trivial. "Du har X projekt aktiva" = data, inte observation.
"Badrum Solna ligger 28% över budget-timmar — ÄTA bör skickas innan slutbesiktning" = observation.

Använd KONKRETA projekt-namn när du refererar till over_budget_samples eller specifika ÄTA-flöden.

REGLER:
- 1-3 observationer max. Färre är bättre om du inte ser något viktigt.
- "title" max 60 tecken, konkret.
- "observation" max 2-3 meningar, första-person, planerar-lugnt språk.
- "suggestion" konkret action max 1 mening ELLER null om bara info.
- "confidence" 0-1, var ärlig. Under 0.5 om du gissar.

Om allt rullar smidigt — säg det med 1 positiv observation. Återhåll dig från att hitta på problem.

${SCHEMA_BLOCK}

EXAKT EXEMPEL — kopiera strukturen:

[
  {
    "knowledge_type": "anomaly",
    "title": "Badrum Solna 28% över budget-timmar",
    "observation": "Badrum Solna har gått från budget 70h till faktiska 90h — 28% över. Material-tunga projekt drar oftare över estimat enligt mönstret jag ser i datat.",
    "suggestion": "Skicka ÄTA-utkast till kund innan slutbesiktning för extra-tiden.",
    "confidence": 0.9,
    "data_basis": {
      "period_days": 90,
      "metric": "actual_hours_vs_budget_hours",
      "project_id": "proj_xxxxxxxx",
      "project_name": "Badrum Solna",
      "budget_hours": 70,
      "actual_hours": 90,
      "pct_over": 28
    }
  }
]`
}

// ─────────────────────────────────────────────────────────────────
// Claude-anrop
// ─────────────────────────────────────────────────────────────────

async function callLarsWithThinking(
  businessName: string,
  aggregate: LarsAggregate,
  maturity: 'early_stage' | 'full_analysis',
) {
  const systemPrompt = buildLarsSystemPrompt(businessName, maturity)
  const userMessage = `Här är ${businessName}s projekt-data senaste 90 dagarna:

${JSON.stringify(aggregate, null, 2)}

Tänk igenom det och returnera JSON-array.`

  return callAgentWithThinking({
    agentId: 'lars',
    codeVersion: LARS_CODE_VERSION,
    promptMaturity: maturity,
    systemPrompt,
    userMessage,
  })
}

// ─────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────

export async function runLarsObservation(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  options: { includeDebug?: boolean } = {},
): Promise<LarsRunResult> {
  console.log(`[lars/run] entry version=${LARS_CODE_VERSION} business=${businessId}`)

  const aggregate = await buildLarsAggregate(supabase, businessId)
  if (!aggregate) {
    return { skipped: 'no_projects_last_90d' }
  }

  const projectCount = aggregate.projects_90d.total_count
  if (projectCount < 5) {
    return {
      skipped: 'insufficient_data',
      reason: 'fewer_than_5_projects',
      aggregate,
    }
  }

  const maturity: 'early_stage' | 'full_analysis' =
    projectCount < 10 ? 'early_stage' : 'full_analysis'

  const { observations, thinkingPreview, debug } = await callLarsWithThinking(
    businessName,
    aggregate,
    maturity,
  )

  if (observations.length === 0) {
    return {
      skipped: 'no_observations_returned',
      aggregate,
      data_maturity: maturity,
      thinking_preview: thinkingPreview,
      ...(options.includeDebug ? { debug } : {}),
    }
  }

  const counts = await saveAndPush(supabase, businessId, 'lars', observations)

  return {
    aggregate,
    data_maturity: maturity,
    observations_total: observations.length,
    thinking_preview: thinkingPreview,
    ...counts,
    ...(options.includeDebug ? { debug } : {}),
  }
}
