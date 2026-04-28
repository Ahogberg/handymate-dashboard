import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { fortnoxRequest, isFortnoxConnected, syncCustomerToFortnox } from '@/lib/fortnox'

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
 * sparar fortnox_invoice_number, och markerar Handymate-fakturan som 'sent'
 * DIREKT — oavsett om Fortnox lyckades. Detta så att Karins påminnelser
 * och projekt-stage-flytt börjar bevaka utan fördröjning.
 *
 * Returnerar:
 *   { success: boolean, fortnox_invoice_number?, fortnox_document_number?, error? }
 *
 * Status='sent' uppdateras alltid på Handymate-sidan om DB-skrivningen
 * lyckas, även när Fortnox-anropet kraschar — användaren kan då försöka
 * synka senare via "Synka nu".
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

    // KRITISKT: Sätt status='sent' och sent_at DIREKT — oavsett Fortnox-resultat.
    // Automationer (Karin-påminnelser, projekt-stage) behöver inte vänta på sync.
    const now = new Date().toISOString()
    const updateData: Record<string, unknown> = {
      status: 'sent',
      sent_at: now,
    }
    if (fortnoxInvoiceNumber) {
      updateData.fortnox_invoice_number = fortnoxInvoiceNumber
      updateData.fortnox_synced_at = now
    }
    if (fortnoxDocumentNumber) {
      updateData.fortnox_document_number = fortnoxDocumentNumber
    }
    if (isRot && fortnoxInvoiceNumber) {
      updateData.rot_application_status = 'submitted'
    }
    if (fortnoxError) {
      updateData.fortnox_sync_error = fortnoxError
    }

    await supabase
      .from('invoice')
      .update(updateData)
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)

    // Trigga samma post-send automationer som /api/invoices/send
    await runPostSendAutomations(invoiceId, business.business_id, invoice.customer_id).catch(err =>
      console.error('[send-via-fortnox] post-send automations failed:', err)
    )

    return NextResponse.json({
      success: !fortnoxError,
      fortnox_invoice_number: fortnoxInvoiceNumber,
      fortnox_document_number: fortnoxDocumentNumber,
      error: fortnoxError,
      message: fortnoxError
        ? 'Fakturan markerad som skickad i Handymate, men Fortnox-synk misslyckades. Försök "Synka nu" senare.'
        : `Faktura ${fortnoxInvoiceNumber} skapad i Fortnox.`,
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
