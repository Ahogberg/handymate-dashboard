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
    const result = await applyInvoicePayment({
      businessId: business.business_id,
      invoiceId,
      paidAt: (paid_at as string) || undefined,
      amount: paid_amount != null && paid_amount !== '' ? Number(paid_amount) : undefined,
      paidVia: (paid_via as string) || (payment_method as string) || undefined,
      markedByUserId: null,
      source: 'status_patch',
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

    if (customerJustSettled) {
      // Golden Path: tack-SMS + recensionsförfrågan efter betalning
      try {
        const customerPhone = (invoice as any)?.customer?.phone_number
        const customerName = (invoice as any)?.customer?.name?.split(' ')[0] || ''
        if (customerPhone) {
          const { data: config } = await supabase
            .from('business_config')
            .select('business_name, google_review_url, review_request_enabled, review_request_delay_days')
            .eq('business_id', business.business_id)
            .single()

          const bizName = config?.business_name || 'Vi'
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

          // Tack-SMS (alltid). Etapp 0 (2026-08-27): gick tidigare via den
          // sessions-grindade /api/sms/send utan cookie → 401 — tack-SMS:et
          // har aldrig nått en kund. Nu strypunkten (STOPP/kvot/logg).
          const { sendSmsViaElks } = await import('@/lib/sms-send')
          const tack = await sendSmsViaElks({
            supabase,
            businessId: business.business_id,
            businessName: bizName,
            to: customerPhone,
            message: `Tack ${customerName}! Vi har mottagit din betalning. Det var ett nöje att hjälpa dig — hör av dig om du behöver mer hjälp! // ${bizName}`,
            customerId: invoice.customer_id ?? null,
            relatedId: invoiceId,
            messageType: 'invoice_paid_thanks',
            recipient: 'customer',
            purpose: 'transactional',
          })
          if (!tack.success) console.error('[invoice status] tack-SMS misslyckades (non-blocking):', tack.error)

          // Recensionsförfrågan med Google Reviews-länk (om aktiverad).
          //
          // Buggfix 2026-08-10: payloaden byggdes tidigare UTAN `to`/`message`
          // — exekveringscaset (app/api/approvals/[id]/route.ts, case
          // 'scheduled_review_request') läser just de fälten, så
          // godkännandet failade tyst med "payload saknar to eller message"
          // så fort hantverkaren klickade Godkänn. Kanonisk form nu, samma
          // som cronens (app/api/cron/review-requests/route.ts).
          if (config?.review_request_enabled !== false && config?.google_review_url && invoice.customer_id) {
            // 180-dagarsspärr (review_request_sent_at) — samma spärr som
            // cronen respekterar. Utan den kan denna faktura-triggade väg
            // och cronen be samma kund om recension två gånger.
            const { data: customerReview } = await supabase
              .from('customer')
              .select('review_request_sent_at')
              .eq('customer_id', invoice.customer_id)
              .eq('business_id', business.business_id)
              .maybeSingle()
            const reviewSentAt = customerReview?.review_request_sent_at as string | null | undefined
            const askedRecently = !!reviewSentAt
              && new Date(reviewSentAt) > new Date(Date.now() - 180 * 24 * 3600000)

            if (!askedRecently) {
              const delayDays = config.review_request_delay_days || 3
              const delayMs = delayDays * 24 * 60 * 60 * 1000

              // Schemalägg review-SMS — lagra i pending_approvals som scheduled task
              const scheduledAt = new Date(Date.now() + delayMs).toISOString()
              const { buildReviewRequestMessage } = await import('@/lib/notifications/review-request-message')
              const message = buildReviewRequestMessage({
                customerName,
                businessName: bizName,
                reviewUrl: config.google_review_url,
              })
              await supabase.from('pending_approvals').insert({
                id: `review_${invoiceId}_${Date.now()}`,
                business_id: business.business_id,
                approval_type: 'scheduled_review_request',
                title: `Skicka recensionsförfrågan till ${customerName || 'kund'}`,
                description: `Schemalagd ${delayDays} dagar efter betalning`,
                payload: {
                  customer_id: invoice.customer_id,
                  customer_phone: customerPhone,
                  customer_name: customerName,
                  google_review_url: config.google_review_url,
                  business_name: bizName,
                  invoice_id: invoiceId,
                  to: customerPhone,
                  message,
                  agent_id: 'hanna',
                },
                status: 'pending',
                risk_level: 'low',
                expires_at: scheduledAt,
              })
            }
          }
        }
      } catch (err) {
        console.error('[invoice status] Golden Path tack-SMS/recensionsförfrågan failed (non-blocking):', invoiceId, err)
      }
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
      success: true,
      invoice,
      transition: result.transition,
      already_paid: result.already_paid ?? false,
      remaining_rot_kr: result.remaining_rot_kr ?? 0,
      message,
    })

  } catch (error: any) {
    console.error('Update invoice status error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
