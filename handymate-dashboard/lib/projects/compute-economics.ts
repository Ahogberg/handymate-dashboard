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
import { isCustomerSettled } from '@/lib/invoices/status'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

/**
 * Tröskeln för när registrerad kostnad räknas som "rimligt komplett".
 * Används för kostnad_sannolikt_komplett-flaggan (TD-63).
 * Exporterad så UI (MarginalCard) kan referera till samma värde.
 */
export const COST_COMPLETENESS_THRESHOLD = 0.30

export interface ProjectEconomics {
  project_id: string
  business_id: string

  // ── Intäkter (vad vi tjänat / kan tjäna) ───────────────────────
  intakter: {
    budget_amount: number  // från offert
    ata_signerat_kr: number  // signed/invoiced project_change-tillägg
    ata_pending_kr: number  // skickade men ej signerade ÄTAs
    fakturerat_kr: number  // sum(invoice.total) för detta projekt
    /** Utfärdad fakturering exklusive moms. Null om någon relevant faktura
        saknar subtotal — används av lärloopen, aldrig total inkl. moms. */
    fakturerat_ex_moms_kr: number | null
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
    /** TD-63b (2026-05-22): projektet har varken budget eller registrerad
        kostnad. Skiljer "tomt" från "preliminär" — tomma projekt har inte
        OFULLSTÄNDIG data, de har INGEN data. UI visar "Ingen intäkt eller
        kostnad registrerad ännu", Lars skippar preliminär-uttalanden. */
    är_tomt: boolean
    /** TD-63 (2026-05-22): är registrerad kostnad rimligt komplett?
        Heuristik: status='completed' ELLER tomt projekt ELLER kostnad
        utgör >= 30% av förväntad intäkt. False = pågående projekt med
        så liten kostnadsregistrering att marginalen sannolikt är
        vilseledande ("preliminär"). UI och Lars använder denna för
        ärlig signalering. */
    kostnad_sannolikt_komplett: boolean
    /** Kostnadens andel av förväntad intäkt i procent. Null om
        intäkt = 0 eller arbetskostnad ej konfigurerad. UI visar
        "kostnad registrerad: X% av budget". */
    kostnad_completeness_pct: number | null
  }

  // ── Metadata ───────────────────────────────────────────────────
  meta: {
    computed_at: string  // ISO timestamp
    invoice_count: number
    ata_count: number
    time_entry_count: number
    supplier_invoice_count: number
    project_material_count: number
    realized_invoice_count: number
    invoice_net_amount_complete: boolean
    extra_cost_count: number  // antal project_cost-rader
    unlinked_supplier_invoice_count: number
    unlinked_project_material_count: number
  }

  /**
   * ROT/RUT-fält från projektets kopplade offert (Projektvy Fas 2,
   * 2026-07-31). OBS: populeras av /api/projects/[id]/profitability
   * (route-lagret) — INTE av computeProjectEconomics ovan. Helpern
   * känner inte till quotes-tabellen och gör ingen ROT/RUT-matte;
   * detta är rena, redan lagrade quotes-kolumner vidarebefordrade
   * ograverade (lib/rot-rut.ts äger själva beräkningen).
   *
   * null om projektet saknar kopplad offert, offerten saknar
   * rot_rut_type, eller quotes-raden inte kunde hämtas. Nycklarna är
   * EXAKT quotes-tabellens kolumnnamn (verifierat mot app/api/quotes/
   * — rot_deduction har fallback till legacy-kolumnen rot_rut_deduction
   * på samma sätt som app/api/quotes/pdf/route.ts gör).
   */
  quote_rot_rut: {
    rot_rut_type: 'rot' | 'rut'
    rot_work_cost?: number
    rot_deduction?: number
    rut_work_cost?: number
    rut_deduction?: number
    customer_pays?: number
  } | null
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
  status: string | null
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
  subtotal: number | null
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
  id: string
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

export type ProjectEconomicsSource =
  | 'project'
  | 'project_change'
  | 'invoice'
  | 'time_entry'
  | 'business_users'
  | 'business_config'
  | 'supplier_invoices'
  | 'project_material'
  | 'project_cost'

/** Ett källfel får aldrig degraderas till en tom lista eller 0 kr. */
export class ProjectEconomicsSourceError extends Error {
  constructor(
    public readonly source: ProjectEconomicsSource,
    cause: { message?: string; code?: string } | null | undefined,
  ) {
    super(`${source}-uppslag misslyckades: ${cause?.message || 'okänt databasfel'}`)
    this.name = 'ProjectEconomicsSourceError'
  }
}

function assertSourceRead(
  source: ProjectEconomicsSource,
  error: { message?: string; code?: string } | null | undefined,
): void {
  if (error) throw new ProjectEconomicsSourceError(source, error)
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
    .select('project_id, business_id, status, budget_amount, budget_hours')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()

  assertSourceRead('project', projectError)
  if (!projectRow) return null
  const project = projectRow as ProjectRow

  // ── 2. ÄTA (project_change) ──────────────────────────────────
  const { data: changesData, error: changesError } = await supabase
    .from('project_change')
    .select('amount, status, signed_at, sent_at, declined_at')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  assertSourceRead('project_change', changesError)

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
  const { data: invoicesData, error: invoicesError } = await supabase
    .from('invoice')
    .select('subtotal, total, status')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  assertSourceRead('invoice', invoicesError)

  const invoices = (invoicesData || []) as InvoiceRow[]
  let fakturerat = 0
  let faktureratExMoms = 0
  let betalt = 0
  let invoiceNetAmountComplete = true
  let realizedInvoiceCount = 0
  for (const inv of invoices) {
    const v = Number(inv.total || 0)
    fakturerat += v
    // customer_paid räknas som betalt: kunden har gjort sitt, ROT-delen är
    // en fordran på Skatteverket — inte en risk hos kunden.
    if (isCustomerSettled(inv.status)) betalt += v
    // Utkast är ännu inte en realiserad intäkt. Makulerade/krediterade
    // original ska inte heller träna marginalen. En eventuell kreditnota
    // representeras av sin egen negativa subtotal när den är utfärdad.
    if (['sent', 'overdue', 'customer_paid', 'paid'].includes(inv.status || '')) {
      realizedInvoiceCount += 1
      if (inv.subtotal == null) invoiceNetAmountComplete = false
      else faktureratExMoms += Number(inv.subtotal)
    }
  }

  // ── 4. Time entries + intern kostnad ─────────────────────────
  const { data: timeData, error: timeError } = await supabase
    .from('time_entry')
    .select('duration_minutes, business_user_id, hourly_rate, is_billable')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  assertSourceRead('time_entry', timeError)

  const timeEntries = (timeData || []) as TimeEntryRow[]

  // Hämta intern kostnad för alla unika business_user_ids på timrader
  const uniqueUserIds = Array.from(
    new Set(timeEntries.map(t => t.business_user_id).filter((u): u is string => !!u)),
  )

  const memberCostMap = new Map<string, number | null>()
  if (uniqueUserIds.length > 0) {
    const { data: usersData, error: usersError } = await supabase
      .from('business_users')
      .select('id, internal_hourly_cost')
      .eq('business_id', businessId)
      .in('id', uniqueUserIds)

    assertSourceRead('business_users', usersError)

    for (const u of (usersData || []) as BusinessUserCost[]) {
      memberCostMap.set(u.id, u.internal_hourly_cost)
    }
  }

  // Business default
  const { data: configData, error: configError } = await supabase
    .from('business_config')
    .select('default_internal_hourly_cost')
    .eq('business_id', businessId)
    .maybeSingle()
  assertSourceRead('business_config', configError)
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
  const { data: supplierData, error: supplierError } = await supabase
    .from('supplier_invoices')
    .select('id, total_amount, billable_to_customer')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  assertSourceRead('supplier_invoices', supplierError)

  const supplierInvoices = (supplierData || []) as SupplierInvoiceRow[]

  // Material registrerat via materials-UI (project_material). En rad kan
  // vara LÄNKAD till en supplier_invoices-rad (supplier_invoice_id satt) —
  // då representerar den fakturans faktiska kostnadsrader, och fakturans
  // total_amount ska INTE också räknas separat (dubbelräkning). En rad utan
  // länk är fristående inköp utanför fakturaflödet (Etapp 1,
  // docs/superpowers/specs/2026-08-19-leverantorsfakturor-design.md).
  const { data: projectMaterials, error: projectMaterialsError } = await supabase
    .from('project_material')
    .select('total_purchase, total_sell, supplier_invoice_id')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
  assertSourceRead('project_material', projectMaterialsError)

  const materialRows = (projectMaterials || []) as Array<{
    total_purchase: number | null
    total_sell: number | null
    supplier_invoice_id: string | null
  }>

  const linkedInvoiceIds = new Set(
    materialRows.map(m => m.supplier_invoice_id).filter((id): id is string => !!id),
  )
  const unlinkedSupplierInvoiceCount = supplierInvoices.filter(s => !linkedInvoiceIds.has(s.id)).length
  const unlinkedProjectMaterialCount = materialRows.filter(m => !m.supplier_invoice_id).length

  let materialInkop = 0
  let materialBillable = 0

  // Fakturor UTAN någon länkad materialrad räknas som fristående kostnad.
  // Länkade fakturor hoppas över här — deras belopp kommer in via
  // materialraderna nedan i stället, så det räknas exakt en gång.
  for (const s of supplierInvoices) {
    if (linkedInvoiceIds.has(s.id)) continue
    const v = Number(s.total_amount || 0)
    materialInkop += v
    if (s.billable_to_customer) materialBillable += v
  }

  for (const m of materialRows) {
    materialInkop += Number(m.total_purchase || 0)
    materialBillable += Number(m.total_sell || 0)
  }

  // ── 6. Project cost (manuella kostnader: UE, övrigt) ─────────
  // project_cost (sql/easoft_parity.sql:48) — användarinmatade kostnader
  // utöver tid och leverantörsfakturor. Återinfört i Etapp 2.3 efter att
  // ha varit urkopplat sedan 2.2-omskrivningen.
  const { data: costData, error: costError } = await supabase
    .from('project_cost')
    .select('amount, category')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  assertSourceRead('project_cost', costError)

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

  // TD-63b: är projektet helt tomt? (varken budget eller registrerad
  // kostnad). Tomt-tillståndet vinner över preliminär-tillståndet —
  // ett tomt projekt har inte OFULLSTÄNDIG data, det har INGEN data.
  const ärTomt = forvantadIntakt === 0 && (totalKostnad || 0) === 0

  // TD-63: kostnad-completeness-flagga. Skiljer pågående projekt med
  // lite registrerad kostnad från projekt där kostnaden faktiskt är
  // låg. Utan denna risk: ett 85k-projekt med 2k registrerad kostnad
  // skulle rapporteras som 97% marginal — vilseledande för Lars +
  // användare. Heuristik: completed-status = data är slutgiltig.
  // Annars kräv att kostnaden utgör minst 30% av förväntad intäkt
  // för att räknas som rimligt komplett.
  // TD-63b: tomma projekt räknas också som "komplett" — inget mer
  // finns att registrera än att börja med. Förhindrar att Lars/UI
  // går in i preliminär-grenen för tomma projekt.
  const kostnadCompletenessPct =
    arbetskostnadKonfigurerad && forvantadIntakt > 0 && totalKostnad != null
      ? Math.round((totalKostnad / forvantadIntakt) * 100)
      : null
  const kostnadSannoliktKomplett =
    ärTomt ||
    project.status === 'completed' ||
    (kostnadCompletenessPct != null && kostnadCompletenessPct >= COST_COMPLETENESS_THRESHOLD * 100)

  return {
    project_id: project.project_id,
    business_id: project.business_id,
    intakter: {
      budget_amount: Math.round(budgetAmount),
      ata_signerat_kr: Math.round(ataSigneratKr),
      ata_pending_kr: Math.round(ataPendingKr),
      fakturerat_kr: Math.round(fakturerat),
      fakturerat_ex_moms_kr: invoiceNetAmountComplete
        ? Math.round(faktureratExMoms)
        : null,
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
      är_tomt: ärTomt,
      kostnad_sannolikt_komplett: kostnadSannoliktKomplett,
      kostnad_completeness_pct: kostnadCompletenessPct,
    },
    meta: {
      computed_at: new Date().toISOString(),
      invoice_count: invoices.length,
      ata_count: changes.length,
      time_entry_count: timeEntries.length,
      supplier_invoice_count: supplierInvoices.length,
      project_material_count: (projectMaterials || []).length,
      realized_invoice_count: realizedInvoiceCount,
      invoice_net_amount_complete: invoiceNetAmountComplete,
      extra_cost_count: extraCosts.length,
      unlinked_supplier_invoice_count: unlinkedSupplierInvoiceCount,
      unlinked_project_material_count: unlinkedProjectMaterialCount,
    },
    // Sätts av routen (se fältets docstring ovan) — helpern har ingen
    // quotes-koppling.
    quote_rot_rut: null,
  }
}
