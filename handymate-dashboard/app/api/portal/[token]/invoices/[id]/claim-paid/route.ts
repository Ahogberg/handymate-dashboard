import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/portal/[token]/invoices/[id]/claim-paid
 *
 * Kundens "Jag har betalat"-knapp i portalen (efter Swish-betalning).
 * Markerar INTE fakturan betald direkt — skapar ett bekräftelsekort i
 * hantverkarens godkänn-kö (Karin). Hantverkaren bekräftar med ett tryck →
 * executorn (`confirm_payment`) sätter betald via delad apply-payment-kärna.
 *
 * Ärlig loop: kunden PÅSTÅR betalning, människan bekräftar. Ingen falsk
 * auto-avprickning, inget Swish Handel-avtal krävs.
 *
 * Publik endpoint — autentiseras av portal_token (kunden), och kunden måste
 * äga fakturan. Idempotent: skapar inte dubblettkort.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { token: string; id: string } },
) {
  try {
    const supabase = getServerSupabase()
    const { token, id: invoiceId } = params

    // 1. Kund via portal_token
    const { data: customer, error: custErr } = await supabase
      .from('customer')
      .select('customer_id, business_id, name, portal_enabled')
      .eq('portal_token', token)
      .single()

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })
    }
    if (!customer.portal_enabled) {
      return NextResponse.json({ error: 'Portalen är inte aktiv' }, { status: 403 })
    }

    // 2. Faktura + ägarskap (måste tillhöra denna kund + business)
    const { data: invoice, error: invErr } = await supabase
      .from('invoice')
      .select('invoice_id, status, customer_id, business_id, fortnox_invoice_number, total')
      .eq('invoice_id', invoiceId)
      .eq('business_id', customer.business_id)
      .single()

    if (invErr || !invoice || invoice.customer_id !== customer.customer_id) {
      return NextResponse.json({ error: 'Fakturan hittades inte' }, { status: 404 })
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ ok: true, already_paid: true })
    }

    const invoiceNumber = invoice.fortnox_invoice_number || invoiceId

    // 3. Idempotens: finns redan ett pending confirm_payment för denna faktura?
    const { data: existing } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', customer.business_id)
      .eq('approval_type', 'confirm_payment')
      .eq('status', 'pending')
      .contains('payload', { invoice_id: invoiceId })
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ ok: true, already_pending: true })
    }

    // 4. Skapa bekräftelsekort (Karin)
    const { error: approvalErr } = await supabase.from('pending_approvals').insert({
      business_id: customer.business_id,
      approval_type: 'confirm_payment',
      title: `Bekräfta betalning — ${customer.name || 'kund'}`,
      description: `${customer.name || 'Kunden'} uppger att faktura ${invoiceNumber} på ${Number(invoice.total || 0).toLocaleString('sv-SE')} kr är betald (via Swish). Bekräfta om betalningen kommit in på ditt konto.`,
      risk_level: 'low',
      status: 'pending',
      payload: {
        agent_id: 'karin',
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        customer_id: customer.customer_id,
        customer_name: customer.name || null,
        total: Number(invoice.total || 0),
        source: 'portal_swish',
        claimed_at: new Date().toISOString(),
      },
    })

    if (approvalErr) {
      console.error('[claim-paid] approval insert failed:', approvalErr.message)
      return NextResponse.json({ error: 'Kunde inte registrera' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[claim-paid] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
