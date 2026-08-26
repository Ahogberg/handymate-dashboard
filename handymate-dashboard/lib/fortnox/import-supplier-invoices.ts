import { getServerSupabase } from '@/lib/supabase'
import { getFortnoxSupplierInvoices, getFortnoxSupplierInvoice, type FortnoxSupplierInvoiceDetail } from '@/lib/fortnox'
import { mapFortnoxSupplierInvoice } from '@/lib/fortnox/map-supplier-invoice'
import { matchSupplierInvoiceToProject, type ProjectRef, type SupplierInvoiceMatch } from '@/lib/fortnox/match-supplier-invoice'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

/**
 * Detaljen för en faktura (Project/CostCenter/referenser/rader) + den
 * deterministiska matchningen. Best-effort: misslyckas detaljhämtningen
 * importeras fakturan ändå — utan koppling, som förr.
 */
async function fetchDetailAndMatch(
  businessId: string,
  docNumber: string,
  projects: ProjectRef[],
): Promise<{ detail: FortnoxSupplierInvoiceDetail | null; match: SupplierInvoiceMatch | null }> {
  try {
    const detail = await getFortnoxSupplierInvoice(businessId, docNumber)
    if (!detail) return { detail: null, match: null }
    return { detail, match: matchSupplierInvoiceToProject(detail, projects) }
  } catch (err: unknown) {
    console.error('[import-supplier-invoices] detaljhämtning misslyckades (importerar utan koppling):', docNumber, err instanceof Error ? err.message : err)
    return { detail: null, match: null }
  }
}

function detailColumns(detail: FortnoxSupplierInvoiceDetail | null, match: SupplierInvoiceMatch | null, nowIso: string) {
  return {
    fortnox_project_number: detail?.Project ?? null,
    fortnox_cost_center: detail?.CostCenter ?? null,
    fortnox_reference: [detail?.YourReference, detail?.OurReference, detail?.Comments].filter(Boolean).join(' | ') || null,
    fortnox_rows: detail?.SupplierInvoiceRows ?? null,
    project_id: match?.project_id ?? null,
    match_source: match?.source ?? null,
    matched_at: match ? nowIso : null,
  }
}

async function loadProjectRefs(businessId: string): Promise<ProjectRef[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('project')
    .select('project_id, project_number, fortnox_project_number')
    .eq('business_id', businessId)
    .not('project_number', 'is', null)
  if (error) {
    console.error('[import-supplier-invoices] projektuppslag misslyckades — ingen automatisk matchning denna körning:', error.message)
    return []
  }
  return (data || []) as ProjectRef[]
}

/**
 * Importerar leverantörsfakturor från Fortnox till lokala supplier_invoices-
 * rader. PULL-ONLY. Nya rader börjar ALLTID med project_id=NULL och
 * subcontractor_id=NULL — matchningskön på Karins sida (Etapp 3) äger den
 * kopplingen, aldrig importen.
 *
 * EXTRAHERAD 2026-08-26 ur app/api/integrations/fortnox/import/supplier-
 * invoices/route.ts (rad 42–128 flyttade oförändrade) så att BÅDE den
 * manuella knappen och 2h-cronen (app/api/cron/fortnox-sync) går genom
 * samma kod. Cronen kunde inte anropa rutten — den är session-grindad
 * (getAuthenticatedBusiness), inte CRON_SECRET-grindad.
 *
 * DEDUP: hoppar över fakturor vars fortnox_supplier_invoice_number redan
 * finns lokalt.
 *
 * SCOPE: kräver Fortnox-scopet "supplierinvoice" (tillagt i FORTNOX_SCOPES
 * 2026-08-19) — konton anslutna innan dess saknar rättigheten på sin token
 * och måste göra om OAuth. Ett saknat scope surfar bara som ett naket
 * "Fortnox API error: 403" från fortnoxRequest; det mappas här till
 * `needs_reconnect: true` i stället för att kastas, så cronen kan räkna det
 * separat (inte som ett fel varannan timme för evigt) och rutten kan svara
 * med sin svenska återanslut-text.
 *
 * Kastar aldrig för en enskild rad (per-rad-felisolering). Kastar bara vid
 * ett oväntat fel utanför Fortnox-hämtningen (t.ex. dedup-selecten).
 */

interface ExistingSupplierInvoice {
  fortnox_supplier_invoice_number: string | null
}

export interface SupplierInvoiceImportResult {
  business_id: string
  imported: number
  skipped: number
  /** Kopplade automatiskt till projekt vid importen (säker matchning). */
  auto_matched: number
  total: number
  total_amount_kr: number
  errors: { documentNumber: string; error: string }[]
  /** true = Fortnox svarade 403 (saknat supplierinvoice-scope) — ägaren måste återansluta. Inget importerades. */
  needs_reconnect?: boolean
}

function arScopeFel(message: string): boolean {
  return message.includes('403') || message.toLowerCase().includes('scope')
}

export async function importSupplierInvoicesForBusiness(
  businessId: string,
): Promise<SupplierInvoiceImportResult> {
  const supabase = getServerSupabase()

  let fortnoxSupplierInvoices
  try {
    fortnoxSupplierInvoices = await getFortnoxSupplierInvoices(businessId)
  } catch (fetchError: unknown) {
    const message = fetchError instanceof Error ? fetchError.message : ''
    if (arScopeFel(message)) {
      return {
        business_id: businessId,
        imported: 0,
        skipped: 0,
        auto_matched: 0,
        total: 0,
        total_amount_kr: 0,
        errors: [],
        needs_reconnect: true,
      }
    }
    throw fetchError
  }

  const { data: existingInvoices, error: existingError } = await supabase
    .from('supplier_invoices')
    .select('fortnox_supplier_invoice_number')
    .eq('business_id', businessId)
    .not('fortnox_supplier_invoice_number', 'is', null)
  // Ett misslyckat dedup-uppslag får ALDRIG tolkas som "inga befintliga"
  // — då skulle varje redan importerad faktura importeras igen.
  if (existingError) throw existingError

  const existingDocNumbers = new Set(
    (existingInvoices as ExistingSupplierInvoice[] | null)
      ?.map(i => i.fortnox_supplier_invoice_number)
      .filter((n): n is string => !!n) ?? []
  )

  const results = {
    imported: 0,
    skipped: 0,
    auto_matched: 0,
    total_amount_kr: 0,
    errors: [] as { documentNumber: string; error: string }[],
  }

  const today = new Date().toISOString().split('T')[0]
  // Projektnumren hämtas EN gång per körning (matchningen är ren).
  let projectRefs: ProjectRef[] | null = null

  for (const fi of fortnoxSupplierInvoices) {
    const mapped = mapFortnoxSupplierInvoice(fi, today)
    if (!mapped) {
      results.skipped++
      continue
    }

    const { docNumber, row } = mapped

    if (existingDocNumbers.has(docNumber)) {
      results.skipped++
      continue
    }

    try {
      // Detalj + deterministisk matchning (2026-08-26): bara för NYA
      // fakturor — en extra GET per faktura, aldrig per körning.
      if (projectRefs === null) projectRefs = await loadProjectRefs(businessId)
      const { detail, match } = await fetchDetailAndMatch(businessId, docNumber, projectRefs)
      const nowIso = new Date().toISOString()
      const vat = typeof detail?.VAT === 'number' ? detail.VAT : row.vat_amount

      const id = `sinv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      // subcontractor_id sätts ALDRIG här — UE-kopplingen ägs av kön/UI:t.
      // project_id sätts BARA när matchningen är säker (match_source).
      const { error: insertError } = await supabase
        .from('supplier_invoices')
        .insert({
          id,
          business_id: businessId,
          supplier_name: row.supplier_name,
          invoice_number: row.invoice_number,
          invoice_date: row.invoice_date,
          due_date: row.due_date,
          amount_excl_vat: Math.max(0, row.total_amount - vat),
          vat_amount: vat,
          total_amount: row.total_amount,
          status: row.status === 'overdue' ? 'unpaid' : row.status,
          fortnox_supplier_invoice_number: row.fortnox_supplier_invoice_number,
          fortnox_supplier_number: row.fortnox_supplier_number,
          fortnox_synced_at: nowIso,
          ...detailColumns(detail, match, nowIso),
        })

      if (insertError) throw insertError

      existingDocNumbers.add(docNumber)
      results.imported++
      if (match) results.auto_matched++
      results.total_amount_kr += row.total_amount
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      results.errors.push({ documentNumber: docNumber, error: errorMessage })
    }
  }

  await logFortnoxOperation(businessId, 'import_supplier_invoices', {
    imported: results.imported,
    skipped: results.skipped,
    auto_matched: results.auto_matched,
    total: fortnoxSupplierInvoices.length,
    total_amount_kr: Math.round(results.total_amount_kr),
    error_count: results.errors.length,
  })

  return {
    business_id: businessId,
    imported: results.imported,
    skipped: results.skipped,
    auto_matched: results.auto_matched,
    total: fortnoxSupplierInvoices.length,
    total_amount_kr: Math.round(results.total_amount_kr),
    errors: results.errors,
  }
}

export interface UnlinkedRescanResult {
  business_id: string
  scanned: number
  matched: number
  errors: string[]
}

/**
 * Svep över redan importerade OKOPPLADE rader som saknar Fortnox-detalj
 * (importerade före v171, eller vars detaljhämtning misslyckades). Hämtar
 * detaljen en gång per rad (cap per körning) och kopplar när matchningen
 * är säker. Rader som fått detalj men ingen match rörs inte igen — de är
 * Karins kö. Anropas från 2h-cronen efter importen.
 */
export async function rescanUnlinkedSupplierInvoices(
  businessId: string,
  opts: { limit?: number } = {},
): Promise<UnlinkedRescanResult> {
  const supabase = getServerSupabase()
  const result: UnlinkedRescanResult = { business_id: businessId, scanned: 0, matched: 0, errors: [] }

  const { data: rows, error } = await supabase
    .from('supplier_invoices')
    .select('id, fortnox_supplier_invoice_number')
    .eq('business_id', businessId)
    .is('project_id', null)
    .is('fortnox_rows', null)
    .is('matched_at', null)
    .not('fortnox_supplier_invoice_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 40)
  if (error) {
    result.errors.push(`fetch: ${error.message}`)
    return result
  }
  if (!rows || rows.length === 0) return result

  const projects = await loadProjectRefs(businessId)
  for (const r of rows) {
    result.scanned++
    try {
      const { detail, match } = await fetchDetailAndMatch(businessId, r.fortnox_supplier_invoice_number as string, projects)
      if (!detail) continue
      const nowIso = new Date().toISOString()
      const { error: updError } = await supabase
        .from('supplier_invoices')
        .update({
          ...detailColumns(detail, match, nowIso),
          // Aldrig skriva över en manuell koppling: svepet tar bara rader
          // med project_id IS NULL (filtret ovan) — men vaktas igen här.
          ...(match ? {} : { project_id: null }),
        })
        .eq('id', r.id)
        .eq('business_id', businessId)
        .is('project_id', null)
      if (updError) throw updError
      if (match) result.matched++
    } catch (err: unknown) {
      result.errors.push(`${r.id}: ${err instanceof Error ? err.message : 'rescan error'}`)
    }
  }
  return result
}
