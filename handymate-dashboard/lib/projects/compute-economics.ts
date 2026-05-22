/**
 * Compute-economics helper (Etapp 2.1, v53 2026-05-21).
 *
 * Ren, UI-frikopplad funktion som beräknar projekt-ekonomi i realtid
 * från grunddata. Designprincip: ingen snapshot-läsning av
 * `project.actual_*` — istället direkt-aggregation från source tables.
 * Detta överlever Etapp 4 meny-redesign och eliminerar risk för
 * stale snapshots.
 *
 * Data som läses:
 * - project (budget_amount, budget_hours)
 * - project_change (godkända/signerade ÄTA-tillägg)
 * - invoice WHERE project_id (v52)
 * - time_entry + business_users.internal_hourly_cost (v53)
 * - supplier_invoices WHERE project_id
 *
 * KRITISKT — arbetskostnad_konfigurerad-flagga:
 * Om intern timkostnad saknas (varken på medlem eller business-default)
 * får vi INTE rapportera marginal. Annars ser projektet falskt lönsamt
 * ut (gratis arbetskraft). Returobjektet sätter då
 * `arbetskostnad_konfigurerad = false` och `marginal_kr = null`.
 * UI-lagret (Etapp 2.2) ansvarar för att visa lämpligt meddelande.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export interface ProjectEconomics {
  project_id: string
  business_id: string

  // ── Intäkter (vad vi tjänat / kan tjäna) ───────────────────────
  intakter: {
    budget_amount: number  // från offert
    ata_signerat_kr: number  // signed/invoiced project_change-tillägg
    ata_pending_kr: number  // skickade men ej signerade ÄTAs
    fakturerat_kr: number  // sum(invoice.total) för detta projekt
    betalt_kr: number  // sum(invoice.total WHERE status='paid')
    /** Aktuell intäktsförväntning = budget + signerade ÄTA. */
    forvantad_intakt_kr: number
  }

  // ── Kostnader (vad det faktiskt kostar) ────────────────────────
  kostnader: {
    arbete_kr: number | null  // null om arbetskostnad ej konfigurerad
    arbete_timmar: number  // alltid satt (även om kostnad-pris saknas)
    material_inkop_kr: number  // sum(supplier_invoices.total_amount)
    material_billable_kr: number  // delmängd med billable_to_customer=true
    // Manuella projektkostnader (project_cost: UE, övrigt) — Etapp 2.3
    extra_kr: number  // sum av alla manuella kostnader
    extra_per_kategori: Record<string, number>  // ex. { subcontractor: 5000, other: 1200 }
    total_kr: number | null  // arbete + material + extra (null om arbete null)
  }

  // ── Marginal ───────────────────────────────────────────────────
  marginal: {
    /** True om alla timrader har en bestämbar intern kostnad (per
        medlem eller business-default). False om någon rad saknar. */
    arbetskostnad_konfigurerad: boolean
    /** Antal timrader som saknade intern kostnad — info till UI. */
    timrader_utan_kostnad: number
    /** marginal i kr = forvantad_intakt - total_kostnad. Null om
        arbetskostnad_konfigurerad=false. */
    marginal_kr: number | null
    /** marginal i procent = marginal_kr / forvantad_intakt * 100. Null
        om arbetskostnad_konfigurerad=false eller intakt = 0. */
    marginal_pct: number | null
  }

  // ── Metadata ───────────────────────────────────────────────────
  meta: {
    computed_at: string  // ISO timestamp
    invoice_count: number
    ata_count: number
    time_entry_count: number
    supplier_invoice_count: number
    extra_cost_count: number  // antal project_cost-rader
  }
}

export interface ProjectExtraCost {
  id: string
  category: string  // 'subcontractor' | 'other' | (free text)
  description: string
  amount: number
  date: string
}

interface ProjectRow {
  project_id: string
  business_id: string
  budget_amount: number | null
  budget_hours: number | null
}

interface ProjectChangeRow {
  amount: number | null
  status: string
  signed_at: string | null
  sent_at: string | null
  declined_at: string | null
}

interface InvoiceRow {
  total: number | null
  status: string | null
}

interface TimeEntryRow {
  duration_minutes: number | null
  business_user_id: string | null
  hourly_rate: number | null  // legacy: använd för fallback om medlem saknar internal_hourly_cost
  is_billable: boolean | null
}

interface SupplierInvoiceRow {
  total_amount: number | null
  billable_to_customer: boolean | null
}

interface ProjectCostRow {
  amount: number | null
  category: string | null
}

interface BusinessUserCost {
  id: string
  internal_hourly_cost: number | null
}

interface BusinessConfigCost {
  default_internal_hourly_cost: number | null
}

// ─────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────

/**
 * Avgör intern timkostnad för en time_entry-rad. Prioritet:
 * 1. Medlemmens internal_hourly_cost (om satt)
 * 2. Business default_internal_hourly_cost (om satt)
 * 3. null → raden räknas som "ej konfigurerad", påverkar flaggan
 *
 * `time_entry.hourly_rate` används INTE som fallback — det är kund-
 * fakturerings-priset (intäkt), inte intern kostnad. Att mixa dem
 * skulle visa marginal ≈ 0 vilket är meningslöst.
 */
function resolveInternalCost(
  entry: TimeEntryRow,
  memberCostMap: Map<string, number | null>,
  defaultCost: number | null,
): number | null {
  if (entry.business_user_id) {
    const memberCost = memberCostMap.get(entry.business_user_id)
    if (memberCost != null) return memberCost
  }
  return defaultCost
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

export async function computeProjectEconomics(
  supabase: SupabaseClient,
  projectId: string,
  businessId: string,
): Promise<ProjectEconomics | null> {
  // ── 1. Project (budget) ──────────────────────────────────────
  const { data: projectRow, error: projectError } = await supabase
    .from('project')
    .select('project_id, business_id, budget_amount, budget_hours')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (projectError || !projectRow) {
    console.warn('[compute-economics] project not found', { projectId, businessId, error: projectError })
    return null
  }
  const project = projectRow as ProjectRow

  // ── 2. ÄTA (project_change) ──────────────────────────────────
  const { data: changesData } = await supabase
    .from('project_change')
    .select('amount, status, signed_at, sent_at, declined_at')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  const changes = (changesData || []) as ProjectChangeRow[]
  let ataSigneratKr = 0
  let ataPendingKr = 0
  for (const c of changes) {
    const v = Math.abs(Number(c.amount || 0))
    const isSigned = c.signed_at !== null || c.status === 'signed' || c.status === 'invoiced'
    const isDeclined = c.declined_at !== null || c.status === 'declined'
    if (isSigned) {
      ataSigneratKr += v
    } else if (!isDeclined && c.sent_at !== null) {
      ataPendingKr += v
    }
  }

  // ── 3. Invoices (v52: WHERE project_id) ──────────────────────
  const { data: invoicesData } = await supabase
    .from('invoice')
    .select('total, status')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  const invoices = (invoicesData || []) as InvoiceRow[]
  let fakturerat = 0
  let betalt = 0
  for (const inv of invoices) {
    const v = Number(inv.total || 0)
    fakturerat += v
    if (inv.status === 'paid') betalt += v
  }

  // ── 4. Time entries + intern kostnad ─────────────────────────
  const { data: timeData } = await supabase
    .from('time_entry')
    .select('duration_minutes, business_user_id, hourly_rate, is_billable')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  const timeEntries = (timeData || []) as TimeEntryRow[]

  // Hämta intern kostnad för alla unika business_user_ids på timrader
  const uniqueUserIds = Array.from(
    new Set(timeEntries.map(t => t.business_user_id).filter((u): u is string => !!u)),
  )

  const memberCostMap = new Map<string, number | null>()
  if (uniqueUserIds.length > 0) {
    const { data: usersData } = await supabase
      .from('business_users')
      .select('id, internal_hourly_cost')
      .in('id', uniqueUserIds)

    for (const u of (usersData || []) as BusinessUserCost[]) {
      memberCostMap.set(u.id, u.internal_hourly_cost)
    }
  }

  // Business default
  const { data: configData } = await supabase
    .from('business_config')
    .select('default_internal_hourly_cost')
    .eq('business_id', businessId)
    .single()
  const defaultCost = ((configData || null) as BusinessConfigCost | null)?.default_internal_hourly_cost ?? null

  let arbeteKr = 0
  let arbeteTimmar = 0
  let timraderUtanKostnad = 0
  let allaKostnaderResolved = true

  for (const t of timeEntries) {
    const hours = (t.duration_minutes || 0) / 60
    arbeteTimmar += hours

    const cost = resolveInternalCost(t, memberCostMap, defaultCost)
    if (cost == null) {
      timraderUtanKostnad += 1
      allaKostnaderResolved = false
    } else {
      arbeteKr += hours * cost
    }
  }

  // Om någon timrad saknar resolverable kostnad → arbete blir null.
  // Detta är medvetet — vi vägrar visa partiell arbetskostnad som
  // skulle ge falskt hög marginal.
  const arbetskostnadKonfigurerad = allaKostnaderResolved || timeEntries.length === 0
  const arbeteKrFinal = arbetskostnadKonfigurerad ? arbeteKr : null

  // ── 5. Supplier invoices (material-inköp) ────────────────────
  const { data: supplierData } = await supabase
    .from('supplier_invoices')
    .select('total_amount, billable_to_customer')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  const supplierInvoices = (supplierData || []) as SupplierInvoiceRow[]
  let materialInkop = 0
  let materialBillable = 0
  for (const s of supplierInvoices) {
    const v = Number(s.total_amount || 0)
    materialInkop += v
    if (s.billable_to_customer) materialBillable += v
  }

  // ── 6. Project cost (manuella kostnader: UE, övrigt) ─────────
  // project_cost (sql/easoft_parity.sql:48) — användarinmatade kostnader
  // utöver tid och leverantörsfakturor. Återinfört i Etapp 2.3 efter att
  // ha varit urkopplat sedan 2.2-omskrivningen.
  const { data: costData } = await supabase
    .from('project_cost')
    .select('amount, category')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  const extraCosts = (costData || []) as ProjectCostRow[]
  let extraTotalKr = 0
  const extraPerKategori: Record<string, number> = {}
  for (const c of extraCosts) {
    const v = Number(c.amount || 0)
    const key = (c.category || 'other').toLowerCase()
    extraTotalKr += v
    extraPerKategori[key] = (extraPerKategori[key] || 0) + v
  }

  // ── 7. Beräkna marginal ──────────────────────────────────────
  const budgetAmount = Number(project.budget_amount || 0)
  const forvantadIntakt = budgetAmount + ataSigneratKr

  const totalKostnad =
    arbeteKrFinal != null ? arbeteKrFinal + materialInkop + extraTotalKr : null

  let marginalKr: number | null = null
  let marginalPct: number | null = null
  if (arbetskostnadKonfigurerad && totalKostnad != null) {
    marginalKr = forvantadIntakt - totalKostnad
    marginalPct = forvantadIntakt > 0
      ? Math.round((marginalKr / forvantadIntakt) * 100)
      : null
  }

  return {
    project_id: project.project_id,
    business_id: project.business_id,
    intakter: {
      budget_amount: Math.round(budgetAmount),
      ata_signerat_kr: Math.round(ataSigneratKr),
      ata_pending_kr: Math.round(ataPendingKr),
      fakturerat_kr: Math.round(fakturerat),
      betalt_kr: Math.round(betalt),
      forvantad_intakt_kr: Math.round(forvantadIntakt),
    },
    kostnader: {
      arbete_kr: arbeteKrFinal == null ? null : Math.round(arbeteKrFinal),
      arbete_timmar: Math.round(arbeteTimmar * 100) / 100,
      material_inkop_kr: Math.round(materialInkop),
      material_billable_kr: Math.round(materialBillable),
      extra_kr: Math.round(extraTotalKr),
      extra_per_kategori: Object.fromEntries(
        Object.entries(extraPerKategori).map(([k, v]) => [k, Math.round(v)]),
      ),
      total_kr: totalKostnad == null ? null : Math.round(totalKostnad),
    },
    marginal: {
      arbetskostnad_konfigurerad: arbetskostnadKonfigurerad,
      timrader_utan_kostnad: timraderUtanKostnad,
      marginal_kr: marginalKr == null ? null : Math.round(marginalKr),
      marginal_pct: marginalPct,
    },
    meta: {
      computed_at: new Date().toISOString(),
      invoice_count: invoices.length,
      ata_count: changes.length,
      time_entry_count: timeEntries.length,
      supplier_invoice_count: supplierInvoices.length,
      extra_cost_count: extraCosts.length,
    },
  }
}
