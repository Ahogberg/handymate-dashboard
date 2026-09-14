import { paymentCommandId, InvalidPaymentCommandKey } from '@/lib/invoices/payment-command-key'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { applyInvoicePayment } from '@/lib/invoices/apply-payment'

/**
 * PATCH - Update invoice status with payment details
 * Body: { status: 'paid' | 'cancelled' | 'sent', paid_at?, paid_amount?, paid_via? }
 *
 * 2026-08-26: `status: 'paid'` går genom den delade betal-kärnan
 * (lib/invoices/apply-payment.ts) — samma beslut som mark-paid, kundens
 * bekräftelse och Fortnox-synken. En ROT/RUT-faktura där bara kundens del
 * registreras blir `customer_paid` (Skatteverkets del väntar); utan ROT
 * blir den `paid` precis som förr. De tidigare duplicerade automations-
 * blocken här är borta (kärnan äger dem). Golden Path tack-SMS +
 * recensionsschemaläggning bor kvar här och körs bara när kunden JUST
 * gjort sitt (to_paid / to_customer_paid) — aldrig vid slutreglering.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: invoiceId } = params

    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { status, paid_at, paid_amount, paid_via, payment_method } = body

    if (!status) {
      return NextResponse.json({ error: 'Missing status' }, { status: 400 })
    }

    // Verify invoice belongs to business
    const { data: existing, error: fetchError } = await supabase
      .from('invoice')
      .select('invoice_id, status, total')
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const INVOICE_SELECT = `
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email
        )
      `

    if (status !== 'paid') {
      const updates: Record<string, unknown> = { status }
      if (status === 'cancelled') {
        updates.cancelled_at = new Date().toISOString()
      }

      const { data: invoice, error: updateError } = await supabase
        .from('invoice')
        .update(updates)
        .eq('invoice_id', invoiceId)
        .eq('business_id', business.business_id)
        .select(INVOICE_SELECT)
        .single()

      if (updateError) throw updateError

      return NextResponse.json({ success: true, invoice, message: 'Fakturastatus uppdaterad' })
    }

    // ── status === 'paid' → delad betal-kärna ──────────────────────────────
    const commandId = paymentCommandId(request.headers.get('Idempotency-Key'), body.command_id)
    const result = await applyInvoicePayment({
      businessId: business.business_id,
      invoiceId,
      paidAt: (paid_at as string) || undefined,
      amount: paid_amount != null && paid_amount !== '' ? Number(paid_amount) : undefined,
      paidVia: (paid_via as string) || (payment_method as string) || undefined,
      markedByUserId: null,
      source: 'status_patch',
      commandKey: `status_patch:${invoiceId}:${commandId}`,
    })

    if (!result.ok) {
      const code = result.error === 'Faktura hittades inte' ? 404 : 500
      return NextResponse.json({ error: result.error || 'Serverfel' }, { status: code })
    }

    const { data: invoice, error: refetchError } = await supabase
      .from('invoice')
      .select(INVOICE_SELECT)
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()
    if (refetchError) throw refetchError

    const customerJustSettled = result.transition === 'to_paid' || result.transition === 'to_customer_paid'

    if (customerJustSettled && !result.kernel) {
      // Golden Path: tack-SMS + recensionsförfrågan efter betalning
      const { runLegacyPaymentThanks } = await import('@/lib/invoices/payment-thanks')
      await runLegacyPaymentThanks(supabase,business,invoice,invoiceId)
    }

    const message = result.already_paid
      ? 'Fakturan var redan betald'
      : result.transition === 'to_customer_paid'
        ? `Kundens del registrerad — ROT/RUT-delen (${Math.round(result.remaining_rot_kr || 0).toLocaleString('sv-SE')} kr) väntar på Skatteverket`
        : result.transition === 'settled'
          ? 'Skatteverkets utbetalning registrerad — fakturan är slutbetald'
          : result.transition === 'none'
            ? 'Delbelopp registrerat'
            : 'Faktura markerad som betald'

    return NextResponse.json({
      command_id: commandId,
      success: true,
      invoice,
      transition: result.transition,
      already_paid: result.already_paid ?? false,
      remaining_rot_kr: result.remaining_rot_kr ?? 0,
      message,
    })

  } catch (error: any) {
    if (error instanceof InvalidPaymentCommandKey) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Update invoice status error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

