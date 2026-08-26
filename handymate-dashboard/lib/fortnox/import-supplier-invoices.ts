import { getServerSupabase } from '@/lib/supabase'
import { getFortnoxSupplierInvoices } from '@/lib/fortnox'
import { mapFortnoxSupplierInvoice } from '@/lib/fortnox/map-supplier-invoice'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

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
    total_amount_kr: 0,
    errors: [] as { documentNumber: string; error: string }[],
  }

  const today = new Date().toISOString().split('T')[0]

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
      const id = `sinv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const { error: insertError } = await supabase
        .from('supplier_invoices')
        .insert({
          id,
          business_id: businessId,
          supplier_name: row.supplier_name,
          invoice_number: row.invoice_number,
          invoice_date: row.invoice_date,
          due_date: row.due_date,
          amount_excl_vat: row.amount_excl_vat,
          vat_amount: row.vat_amount,
          total_amount: row.total_amount,
          status: row.status === 'overdue' ? 'unpaid' : row.status,
          fortnox_supplier_invoice_number: row.fortnox_supplier_invoice_number,
          fortnox_supplier_number: row.fortnox_supplier_number,
          fortnox_synced_at: new Date().toISOString(),
        })

      if (insertError) throw insertError

      existingDocNumbers.add(docNumber)
      results.imported++
      results.total_amount_kr += row.total_amount
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      results.errors.push({ documentNumber: docNumber, error: errorMessage })
    }
  }

  await logFortnoxOperation(businessId, 'import_supplier_invoices', {
    imported: results.imported,
    skipped: results.skipped,
    total: fortnoxSupplierInvoices.length,
    total_amount_kr: Math.round(results.total_amount_kr),
    error_count: results.errors.length,
  })

  return {
    business_id: businessId,
    imported: results.imported,
    skipped: results.skipped,
    total: fortnoxSupplierInvoices.length,
    total_amount_kr: Math.round(results.total_amount_kr),
    errors: results.errors,
  }
}
