import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { fortnoxRequest, isFortnoxConnected, syncCustomerToFortnox } from '@/lib/fortnox'

/**
 * Hur länge en pending sync räknas som "in-flight" innan vi antar att den
 * dog (nätverket eller serverless-functionen) och tillåter retry. 5 minuter
 * ger gott om tid för långsamma Fortnox-svar utan att blockera långvariga
 * felfall. Om vi någonsin behöver per-business-override → flytta till
 * business_config eller env-var.
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

/**
 * POST /api/invoices/[id]/send-via-fortnox
 *
 * Skapar fakturan i Fortnox (med ROT-stöd om invoice.rot_rut_type='ROT'/'RUT'),
 * sparar fortnox_invoice_number, markerar Handymate-fakturan som 'sent' och
 * triggar post-send-automationer (pipeline-flytt, project-stage, smart-
 * communication, portal-notifikation).
 *
 * Pilot-fix-plan Steg 4 / audit 1 B3 (2026-05-29 refactor):
 * Tidigare sattes status='sent' OAVSETT om Fortnox lyckades — användaren
 * tryckte "skicka igen" vid fel → DUBBLETT i Fortnox. Nu drivs flödet
 * av fortnox_sync_status:
 *   - synced → blocka retry, returnera befintlig data (idempotent)
 *   - pending + < 5 min → blocka retry (in-flight)
 *   - pending + >= 5 min → tillåt retry (antag in-flight-dödad)
 *   - failed eller NULL → tillåt retry
 *
 * status='sent' sätts BARA när Fortnox-anropet lyckas. Post-send
 * automationer triggas BARA vid lyckad sync.
 *
 * ExternalInvoiceReference1 sätts till Handymate-invoice_id på Fortnox-
 * payload → möjliggör framtida idempotens-lookup via Fortnox-search-API.
 *
 * KRÄVER MIGRATION: sql/v58_invoice_fortnox_sync_status.sql.
 *
 * Returnerar:
 *   { success: boolean, fortnox_invoice_number?, fortnox_document_number?,
 *     error?, idempotent?: true }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoiceId = params.id
    const supabase = getServerSupabase()

    // Hämta faktura + kund
    const { data: invoice, error: fetchErr } = await supabase
      .from('invoice')
      .select('*, customer:customer_id(*)')
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchErr || !invoice) {
      return NextResponse.json({ error: 'Faktura hittades inte' }, { status: 404 })
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return NextResponse.json(
        { error: `Fakturan är redan ${invoice.status === 'paid' ? 'betald' : 'avbruten'}` },
        { status: 400 }
      )
    }

    // Idempotens-skydd: blocka retry om sync redan lyckats eller pågår.
    // Eliminerar dubblett-fakturor i Fortnox när användaren trycker
    // "skicka igen" på en faktura som faktiskt är synkad.
    const syncStatus = invoice.fortnox_sync_status as string | null
    const lastAttempt = invoice.fortnox_sync_attempted_at as string | null
    if (syncStatus === 'synced' && invoice.fortnox_invoice_number) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        fortnox_invoice_number: invoice.fortnox_invoice_number,
        fortnox_document_number: invoice.fortnox_document_number,
        message: 'Fakturan är redan synkad till Fortnox.',
      })
    }
    if (syncStatus === 'pending' && lastAttempt) {
      const ageMs = Date.now() - new Date(lastAttempt).getTime()
      if (ageMs < FORTNOX_PENDING_TIMEOUT_MS) {
        return NextResponse.json(
          {
            error: 'Sync pågår redan. Vänta ett par minuter innan du försöker igen.',
            sync_status: 'pending',
          },
          { status: 409 },
        )
      }
      // > 5 min sedan → antag in-flight-dödad, tillåt retry
      console.warn(
        `[send-via-fortnox] invoice ${invoiceId} pending för ${Math.round(ageMs / 1000)}s — antar in-flight-dödad, tillåter retry`,
      )
    }

    const connected = await isFortnoxConnected(business.business_id)
    if (!connected) {
      return NextResponse.json(
        { error: 'Fortnox är inte kopplad. Gå till Inställningar → Integrationer.' },
        { status: 400 }
      )
    }

    // Säkerställ att kunden finns i Fortnox
    let customerNumber = invoice.customer?.fortnox_customer_number as string | null
    if (!customerNumber && invoice.customer_id) {
      const sync = await syncCustomerToFortnox(business.business_id, invoice.customer_id)
      if (!sync.success || !sync.customerNumber) {
        return NextResponse.json(
          { error: `Kunde inte synka kund till Fortnox: ${sync.error || 'okänt fel'}` },
          { status: 502 }
        )
      }
      customerNumber = sync.customerNumber
    }

    if (!customerNumber) {
      return NextResponse.json({ error: 'Ingen kund kopplad till fakturan' }, { status: 400 })
    }

    // Bygg invoice-rader från items JSONB
    const items: InvoiceItem[] = Array.isArray(invoice.items) ? invoice.items : []
    if (items.length === 0) {
      return NextResponse.json({ error: 'Fakturan saknar rader' }, { status: 400 })
    }

    const invoiceRows: FortnoxInvoiceRow[] = items.map(item => ({
      Description: (item.description || 'Arbete').slice(0, 200),
      DeliveredQuantity: Number(item.quantity ?? 1),
      Price: Number(item.unit_price ?? 0),
      Unit: mapUnit(item.unit),
      VAT: 25,
    }))

    // Hämta business-config för OurReference
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('business_name, contact_name')
      .eq('business_id', business.business_id)
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
      // Idempotens-stöd: ger oss möjlighet att framtidigt fråga
      // Fortnox "har du redan en invoice med denna ExternalReference?"
      // via search-API. Skyddar mot mid-flight-nätverksdöd.
      ExternalInvoiceReference1: invoiceId,
    }

    // ROT/RUT — Fortnox `TaxReductionType` på Invoice + `TaxReduction`-payload
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

    // Markera sync som in-flight FÖRE Fortnox-anropet. Skydd mot
    // parallella requests (samtidiga tryck på "Skicka") och in-flight-
    // detection vid retry.
    const startedAt = new Date().toISOString()
    await supabase
      .from('invoice')
      .update({
        fortnox_sync_status: 'pending',
        fortnox_sync_attempted_at: startedAt,
      })
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)

    // Skapa fakturan i Fortnox
    let fortnoxInvoiceNumber: string | null = null
    let fortnoxDocumentNumber: string | null = null
    let fortnoxError: string | null = null

    try {
      const response = await fortnoxRequest<{ Invoice: { InvoiceNumber: string; DocumentNumber: string } }>(
        business.business_id,
        'POST',
        '/invoices',
        { Invoice: invoicePayload }
      )
      fortnoxInvoiceNumber = response?.Invoice?.InvoiceNumber ?? null
      fortnoxDocumentNumber = response?.Invoice?.DocumentNumber ?? null
    } catch (err: any) {
      fortnoxError = err?.message || 'Fortnox-fel'
      console.error('[send-via-fortnox] Fortnox API failed:', fortnoxError)
    }

    const now = new Date().toISOString()

    // FAILURE-väg: behåll status (draft/sent), markera sync som failed
    // så användaren kan retry utan att skapa dubblett. INGEN post-send-
    // automation triggas — pipeline/project-stage/portal-notis ska bara
    // ske vid faktisk lyckad sync.
    if (fortnoxError || !fortnoxInvoiceNumber) {
      await supabase
        .from('invoice')
        .update({
          fortnox_sync_status: 'failed',
          fortnox_sync_error: fortnoxError || 'No invoice number returned',
        })
        .eq('invoice_id', invoiceId)
        .eq('business_id', business.business_id)

      return NextResponse.json(
        {
          success: false,
          error: fortnoxError || 'No invoice number returned',
          message: 'Fortnox-synk misslyckades. Försök igen — vi skapar ingen dubblett.',
        },
        { status: 502 },
      )
    }

    // SUCCESS-väg: sätt status='sent', spara Fortnox-data, markera synced.
    const updateData: Record<string, unknown> = {
      status: 'sent',
      sent_at: now,
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
      .eq('business_id', business.business_id)

    // Post-send automationer triggas BARA vid lyckad sync — pipeline-flytt
    // och project-stage ska inte starta för fakturor som faktiskt inte
    // nådde Fortnox.
    await runPostSendAutomations(invoiceId, business.business_id, invoice.customer_id).catch(err =>
      console.error('[send-via-fortnox] post-send automations failed:', err)
    )

    return NextResponse.json({
      success: true,
      fortnox_invoice_number: fortnoxInvoiceNumber,
      fortnox_document_number: fortnoxDocumentNumber,
      message: `Faktura ${fortnoxInvoiceNumber} skapad i Fortnox.`,
    })
  } catch (err: any) {
    console.error('[send-via-fortnox] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
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

/**
 * Trigga samma sidoeffekter som /api/invoices/send efter en lyckad send:
 * pipeline-flytt, project-stage advance, smart-communication, fireEvent.
 */
async function runPostSendAutomations(
  invoiceId: string,
  businessId: string,
  customerId: string | null
): Promise<void> {
  // 1. Pipeline: flytta deal till 'invoiced'
  try {
    const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
    const settings = await getAutomationSettings(businessId)
    if (settings?.auto_move_on_payment) {
      const deal = await findDealByInvoice(businessId, invoiceId)
      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId,
          toStageSlug: 'invoiced',
          triggeredBy: 'system',
        })
      }
    }
  } catch (err) {
    console.error('[send-via-fortnox] pipeline error:', err)
  }

  // 2. Project workflow stage: INVOICE_SENT
  try {
    const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
    const project = await findProjectForEntity({ businessId, invoiceId })
    if (project) {
      await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_SENT, businessId)
    }
  } catch (err) {
    console.error('[send-via-fortnox] project-stage error:', err)
  }

  // 3. Smart-communication
  if (customerId) {
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId,
        event: 'invoice_sent',
        customerId,
        context: { invoiceId },
      })
    } catch (err) {
      console.error('[send-via-fortnox] smart-communication error:', err)
    }
  }

  // 4. Portal-notifikation
  try {
    if (customerId) {
      const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
      await sendPortalNotification(businessId, customerId, 'invoice_sent', {
        context: { invoice_id: invoiceId },
      })
    }
  } catch (err) {
    console.error('[send-via-fortnox] portal notification error:', err)
  }
}
