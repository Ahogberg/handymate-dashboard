/**
 * Karin — besök→faktura för serviceavtal (Motor 2, Etapp 1, del 7).
 *
 * En slutförd booking med agreement_id (kind='service') → utkastfaktura
 * byggd från avtalets FRUSNA price_items + ett review_auto_invoice-kort i
 * kön. Speglar lib/projects/auto-invoice-on-complete.ts (nummerserie/OCR/
 * ROT-fält/pending_approvals-shapen) men källan är service_agreement.
 * price_items istället för en offert — inga ÄTA, ingen quote_id.
 *
 * ▸DEFAULT v1: ALDRIG autonom sändning — alltid draft + kort, oavsett
 * business_config.auto_invoice_on_complete (till skillnad från projekt-
 * flödet). Förtroendetrappan för serviceavtal byggs senare.
 *
 * Dedup: en faktura per booking_id (invoice.booking_id, v74-migrationen).
 *
 * payload.invoice_id är det ENDA fält som approve-exekveringen i
 * app/api/approvals/[id]/route.ts (case 'review_auto_invoice') faktiskt
 * läser — övriga fält är kontext för kortet/UI:t. Samma approval_type och
 * samma load-bearing fältnamn som auto-invoice-on-complete.ts (rad ~325)
 * så den befintliga exekveringen fungerar rakt av utan ändring där.
 */

import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { createInvoice } from '@/lib/invoices/create-invoice'

type SupabaseClient = any

interface InvoiceVisitResult {
  success: boolean
  invoice_id?: string
  invoice_number?: string
  total?: number
  error?: string
}

function isMissingRelationError(error: any): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === '42703') return true
  const message = String(error?.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|column/i.test(message)
}

export async function invoiceAgreementVisit(
  supabase: SupabaseClient,
  businessId: string,
  bookingId: string,
): Promise<InvoiceVisitResult> {
  try {
    // 1. Hämta bokningen — måste vara avtalskopplad och slutförd.
    const { data: booking, error: bookingErr } = await supabase
      .from('booking')
      .select('booking_id, agreement_id, customer_id, job_status')
      .eq('booking_id', bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (bookingErr) {
      if (isMissingRelationError(bookingErr)) return { success: false, error: 'v74 ej körd än' }
      return { success: false, error: bookingErr.message }
    }
    if (!booking) return { success: false, error: 'Bokning hittades inte' }
    if (!booking.agreement_id) return { success: false, error: 'Bokningen är inte kopplad till ett serviceavtal' }
    if (booking.job_status !== 'completed') return { success: false, error: 'Bokningen är inte slutförd' }

    // 2. Dedup — en faktura per booking_id.
    const { data: existingInvoice, error: existingErr } = await supabase
      .from('invoice')
      .select('invoice_id')
      .eq('business_id', businessId)
      .eq('booking_id', bookingId)
      .limit(1)
      .maybeSingle()

    if (existingErr && isMissingRelationError(existingErr)) {
      return { success: false, error: 'v74 ej körd än (invoice.booking_id saknas)' }
    }
    if (existingInvoice) {
      return { success: true, invoice_id: existingInvoice.invoice_id, error: 'Faktura finns redan för bokningen' }
    }

    // 3. Hämta avtalet — källan för de frusna prisraderna.
    const { data: agreement, error: agrErr } = await supabase
      .from('service_agreement')
      .select('agreement_id, title, price_items, rot_rut_type, customer_id')
      .eq('agreement_id', booking.agreement_id)
      .eq('business_id', businessId)
      .maybeSingle()

    if (agrErr) {
      if (isMissingRelationError(agrErr)) return { success: false, error: 'v74 ej körd än' }
      return { success: false, error: agrErr.message }
    }
    if (!agreement) return { success: false, error: 'Serviceavtalet hittades inte' }

    const rawItems: any[] = Array.isArray(agreement.price_items) ? agreement.price_items : []
    if (rawItems.length === 0) return { success: false, error: 'Avtalet saknar prisrader' }

    // Spegla auto-invoice-on-complete.ts steg 3 (quoteItems-mappningen) —
    // samma fält-shape i invoice.items, källan är bara price_items i stället
    // för quote.items.
    const items = rawItems.map((item: any, i: number) => ({
      id: 'ii_sa_' + Math.random().toString(36).substr(2, 8),
      item_type: item.item_type || 'item',
      description: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'st',
      unit_price: item.unit_price || 0,
      total: (item.quantity || 1) * (item.unit_price || 0),
      is_rot_eligible: item.is_rot_eligible || item.rot_rut_type === 'rot' || false,
      sort_order: item.sort_order ?? i,
    }))

    const customerId = booking.customer_id || agreement.customer_id
    const vatRate = 25
    const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0)
    const vatAmount = Math.round(subtotal * (vatRate / 100))
    const total = subtotal + vatAmount

    // ROT/RUT med årstaksvalidering — samma mönster som
    // auto-invoice-on-complete.ts steg 6.
    let rotRutType: string | null = agreement.rot_rut_type || null
    let rotRutDeduction = 0
    let customerPays: number | null = null

    if (rotRutType) {
      const rate = rotRutType === 'rut' ? 0.5 : 0.3
      const eligibleLabor = items.filter(i => i.is_rot_eligible).reduce((sum, i) => sum + (i.total || 0), 0)
      if (eligibleLabor > 0) {
        const capped = await calculateCappedDeduction(customerId, businessId, rotRutType as 'rot' | 'rut', eligibleLabor, { vatRate })
        rotRutDeduction = capped.deduction
      }
      customerPays = total - rotRutDeduction
    }

    // 4. Betalningsvillkor (nummer/OCR sköts nu av createInvoice-kärnan).
    const { data: config } = await supabase
      .from('business_config')
      .select('default_payment_days')
      .eq('business_id', businessId)
      .single()

    const dueDays = config?.default_payment_days || 30

    // 5. Skapa faktura — ALLTID draft (v1: ingen autonom sändning för
    // serviceavtal, till skillnad från projektflödets auto_invoice_on_complete).
    // ETAPP 6a (offert-masterplan.md): gemensam kärna för nummer/OCR/datum/
    // insert/bump — se lib/invoices/create-invoice.ts.
    let invoice: { invoice_id: string; invoice_number: string; total: number; status: string }
    try {
      const created = await createInvoice(supabase, {
        businessId,
        customerId,
        items,
        subtotal,
        vatRate,
        vatAmount,
        total,
        rotRutType: (rotRutType as 'rot' | 'rut' | null) || null,
        rotRutDeduction,
        customerPays: customerPays ?? total,
        invoiceType: 'standard',
        status: 'draft',
        dueDays,
        bookingId,
        selectClause: 'invoice_id, invoice_number, total, status',
      })
      invoice = created.invoice
    } catch (insertErr: any) {
      if (isMissingRelationError(insertErr)) return { success: false, error: 'v74 ej körd än (invoice.booking_id saknas)' }
      return { success: false, error: insertErr.message }
    }

    // 6. review_auto_invoice-kort — draft + kö alltid (aldrig autonom
    // sändning). payload.invoice_id är det fält approve-exekveringen läser.
    try {
      const { data: customer } = await supabase
        .from('customer')
        .select('name')
        .eq('customer_id', customerId)
        .maybeSingle()

      const { error: approvalErr } = await supabase.from('pending_approvals').insert({
        business_id: businessId,
        approval_type: 'review_auto_invoice',
        title: `Granska faktura — ${agreement.title}`,
        description: `Faktura ${invoice.invoice_number} på ${total.toLocaleString('sv-SE')} kr skapades automatiskt efter ett serviceavtalsbesök. Granska och skicka till ${customer?.name || 'kund'}.`,
        risk_level: 'medium',
        status: 'pending',
        payload: {
          agent_id: 'karin',
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          booking_id: bookingId,
          agreement_id: agreement.agreement_id,
          agreement_title: agreement.title,
          customer_id: customerId,
          customer_name: customer?.name || null,
          total,
          items_count: items.length,
          rot_rut_type: rotRutType,
        },
      })
      if (approvalErr) {
        console.error('[invoiceAgreementVisit] review_auto_invoice-approval insert failed (non-blocking):', {
          business_id: businessId,
          invoice_id: invoice.invoice_id,
          error: approvalErr.message,
        })
      }
    } catch (err: any) {
      console.error('[invoiceAgreementVisit] review_auto_invoice-approval insert threw (non-blocking):', {
        business_id: businessId,
        invoice_id: invoice.invoice_id,
        error: err?.message || String(err),
      })
    }

    return {
      success: true,
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      total,
    }
  } catch (err: any) {
    console.error('[invoiceAgreementVisit] Error:', err)
    return { success: false, error: err?.message || String(err) }
  }
}
