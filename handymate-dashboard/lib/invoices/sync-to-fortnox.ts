import type { SupabaseClient } from '@supabase/supabase-js'
import { fortnoxRequest, isFortnoxConnected, syncCustomerToFortnox } from '@/lib/fortnox'
import { prepareInvoiceManifest, markInvoiceDelivered } from '@/lib/invoices/evidence-manifest'

/**
 * Fortnox-bokföringssteget för en kundfaktura. Bruten ut ur
 * app/api/invoices/[id]/send-via-fortnox/route.ts (2026-08-20, enat
 * fakturautskick) så samma logik kan köras från BÅDE den fristående
 * "Bokför i Fortnox"-rutten och sendInvoice() (som körs för både
 * manuellt utskick och autoInvoiceOnComplete).
 *
 * Rör ALDRIG kundleverans (email/SMS) — det är sendInvoice()s ansvar,
 * som anropar denna funktion FÖRE leveransförsöket.
 */

const FORTNOX_PENDING_TIMEOUT_MS = 5 * 60 * 1000

interface InvoiceItem {
  description?: string
  quantity?: number
  unit?: string
  unit_price?: number
}

interface FortnoxInvoiceRow {
  ArticleNumber?: string
  Description: string
  DeliveredQuantity: number
  Price: number
  Unit?: string
  VAT?: number
}

export interface SyncToFortnoxResult {
  success: boolean
  /** true = Fortnox var inte kopplat, inget gjordes. Inte ett fel. */
  skipped?: boolean
  /** true = fakturan var redan synkad, denna körning gjorde inget nytt Fortnox-anrop. */
  idempotent?: boolean
  fortnoxInvoiceNumber?: string
  fortnoxDocumentNumber?: string
  error?: string
}

export async function syncInvoiceToFortnox(
  supabase: SupabaseClient,
  params: { businessId: string; invoiceId: string },
): Promise<SyncToFortnoxResult> {
  const { businessId, invoiceId } = params

  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    return { success: true, skipped: true }
  }

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoice')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Faktura hittades inte' }
  }

  if (invoice.customer_id) {
    const { data: customerData, error: customerErr } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', invoice.customer_id)
      .maybeSingle()
    if (customerErr) {
      console.error('[sync-to-fortnox] customer fetch error:', customerErr)
      return { success: false, error: 'Kunde inte hämta kunduppgifter för fakturan. Försök igen.' }
    }
    invoice.customer = customerData
  } else {
    invoice.customer = null
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return { success: false, error: `Fakturan är redan ${invoice.status === 'paid' ? 'betald' : 'avbruten'}` }
  }

  const syncStatus = invoice.fortnox_sync_status as string | null
  const lastAttempt = invoice.fortnox_sync_attempted_at as string | null
  if (syncStatus === 'synced' && invoice.fortnox_invoice_number) {
    return {
      success: true,
      idempotent: true,
      fortnoxInvoiceNumber: invoice.fortnox_invoice_number,
      fortnoxDocumentNumber: invoice.fortnox_document_number,
    }
  }
  if (syncStatus === 'pending' && lastAttempt) {
    const ageMs = Date.now() - new Date(lastAttempt).getTime()
    if (ageMs < FORTNOX_PENDING_TIMEOUT_MS) {
      return { success: false, error: 'Sync pågår redan. Vänta ett par minuter innan du försöker igen.' }
    }
    console.warn(
      `[sync-to-fortnox] invoice ${invoiceId} pending för ${Math.round(ageMs / 1000)}s — antar in-flight-dödad, tillåter retry`,
    )
  }

  let customerNumber = invoice.customer?.fortnox_customer_number as string | null
  if (!customerNumber && invoice.customer_id) {
    const sync = await syncCustomerToFortnox(businessId, invoice.customer_id)
    if (!sync.success || !sync.customerNumber) {
      return { success: false, error: `Kunde inte synka kund till Fortnox: ${sync.error || 'okänt fel'}` }
    }
    customerNumber = sync.customerNumber
  }

  if (!customerNumber) {
    return { success: false, error: 'Ingen kund kopplad till fakturan' }
  }

  const items: InvoiceItem[] = Array.isArray(invoice.items) ? invoice.items : []
  if (items.length === 0) {
    return { success: false, error: 'Fakturan saknar rader' }
  }

  const invoiceRows: FortnoxInvoiceRow[] = items.map(item => ({
    Description: (item.description || 'Arbete').slice(0, 200),
    DeliveredQuantity: Number(item.quantity ?? 1),
    Price: Number(item.unit_price ?? 0),
    Unit: mapUnit(item.unit),
    VAT: 25,
  }))

  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('business_name, contact_name')
    .eq('business_id', businessId)
    .single()

  const today = new Date().toISOString().split('T')[0]
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toISOString().split('T')[0]
    : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const invoicePayload: Record<string, unknown> = {
    CustomerNumber: customerNumber,
    InvoiceDate: today,
    DueDate: dueDate,
    Currency: 'SEK',
    Language: 'SV',
    OurReference: bizConfig?.contact_name || bizConfig?.business_name || undefined,
    YourReference: invoice.customer?.name || undefined,
    InvoiceRows: invoiceRows,
    Remarks: invoice.internal_notes || undefined,
    ExternalInvoiceReference1: invoiceId,
  }

  const isRot = invoice.rot_rut_type === 'ROT' || invoice.rot_rut_type === 'rot'
  const isRut = invoice.rot_rut_type === 'RUT' || invoice.rot_rut_type === 'rut'
  if (isRot || isRut) {
    invoicePayload.TaxReductionType = isRot ? 'ROT' : 'RUT'
    const reductionAmount = Number(invoice.rot_deduction || invoice.rot_rut_deduction || 0)
    const personalNumber = invoice.rot_personal_number || invoice.customer?.personal_number || null
    const propertyDesignation = invoice.rot_property_designation || invoice.customer?.property_designation || null
    if (reductionAmount > 0 && personalNumber) {
      invoicePayload.TaxReduction = {
        Type: isRot ? 'ROT' : 'RUT',
        PropertyType: 'Villa',
        PropertyDesignation: propertyDesignation,
        TaxReductionAmount: reductionAmount,
        AskerSocialSecurityNumber: personalNumber,
      }
    }
  }

  await prepareInvoiceManifest(supabase, {
    businessId,
    invoiceId,
    projectId: invoice.project_id || null,
  })

  const startedAt = new Date().toISOString()
  await supabase
    .from('invoice')
    .update({ fortnox_sync_status: 'pending', fortnox_sync_attempted_at: startedAt })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  let fortnoxInvoiceNumber: string | null = null
  let fortnoxDocumentNumber: string | null = null
  let fortnoxError: string | null = null

  try {
    const response = await fortnoxRequest<{ Invoice: { InvoiceNumber: string; DocumentNumber: string } }>(
      businessId,
      'POST',
      '/invoices',
      { Invoice: invoicePayload },
    )
    fortnoxInvoiceNumber = response?.Invoice?.InvoiceNumber ?? null
    fortnoxDocumentNumber = response?.Invoice?.DocumentNumber ?? null
  } catch (err: any) {
    fortnoxError = err?.message || 'Fortnox-fel'
    console.error('[sync-to-fortnox] Fortnox API failed:', fortnoxError)
  }

  // Dubbelskydd (2026-08-20, verifierat mot Fortnox egen OpenAPI-spec —
  // se lib/invoices/sync-to-fortnox.ts's grannefil-historik för research):
  // PUT /invoices/{DocumentNumber}/externalprint markerar fakturan som
  // Sent=true i Fortnox UTAN att generera/skicka något själv ("Use this
  // endpoint to set invoice as sent, without generating an invoice").
  // Gör att Fortnox egen "Skicka"-knapp/e-postutskick i deras gränssnitt
  // visar fakturan som redan skickad, så en människa där inte råkar
  // dubbelmejla kunden. Best-effort — bokföringen (huvudsyftet) är redan
  // klar vid det här laget oavsett vad detta anrop gör.
  if (fortnoxDocumentNumber) {
    try {
      await fortnoxRequest(
        businessId,
        'PUT',
        `/invoices/${fortnoxDocumentNumber}/externalprint`,
        { Invoice: { CustomerNumber: customerNumber } },
      )
    } catch (markSentErr: any) {
      console.error('[sync-to-fortnox] externalprint (markera som skickad) misslyckades — bokföringen kvarstår korrekt:', markSentErr?.message || markSentErr)
    }
  }

  if (fortnoxError || !fortnoxInvoiceNumber) {
    await supabase
      .from('invoice')
      .update({ fortnox_sync_status: 'failed', fortnox_sync_error: fortnoxError || 'No invoice number returned' })
      .eq('invoice_id', invoiceId)
      .eq('business_id', businessId)

    return { success: false, error: fortnoxError || 'No invoice number returned' }
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    fortnox_invoice_number: fortnoxInvoiceNumber,
    fortnox_document_number: fortnoxDocumentNumber,
    fortnox_synced_at: now,
    fortnox_sync_status: 'synced',
    fortnox_sync_error: null,
  }
  if (isRot) {
    updateData.rot_application_status = 'submitted'
  }

  await supabase
    .from('invoice')
    .update(updateData)
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  await markInvoiceDelivered(supabase, { businessId, invoiceId, method: 'fortnox' })

  return { success: true, fortnoxInvoiceNumber, fortnoxDocumentNumber: fortnoxDocumentNumber ?? undefined }
}

function mapUnit(u: string | undefined): string | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'tim' || lower === 'h' || lower === 'timmar') return 'h'
  if (lower === 'st' || lower === 'styck') return 'st'
  if (lower === 'm' || lower === 'meter') return 'm'
  if (lower === 'm2' || lower === 'kvm') return 'm2'
  if (lower === 'kg') return 'kg'
  return undefined
}
