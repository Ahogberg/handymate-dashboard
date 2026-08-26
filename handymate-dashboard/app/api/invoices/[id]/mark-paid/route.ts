import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { applyInvoicePayment } from '@/lib/invoices/apply-payment'

/**
 * POST /api/invoices/[id]/mark-paid
 *
 * Manuell betal-markering — överstyr cron-syncen. Delar kärnlogiken
 * (status-flip + automation-pipeline + portal-notis) med kundens "Jag har
 * betalat"-bekräftelse och Fortnox-synken via `lib/invoices/apply-payment`.
 *
 * ROT/RUT (2026-08-26): utan `amount` registreras kundens andel → fakturan
 * blir `customer_paid` (Skatteverkets del väntar). Anrop igen på en
 * customer_paid-faktura registrerar Skatteverkets utbetalning → `paid`.
 *
 * Body (optional): { paid_at?: string, amount?: number, paid_via?: string }
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

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))

    const result = await applyInvoicePayment({
      businessId: business.business_id,
      invoiceId: params.id,
      paidAt: (body?.paid_at as string) || undefined,
      amount: body?.amount != null ? Number(body.amount) : undefined,
      paidVia: (body?.paid_via as string) || undefined,
      markedByUserId: currentUser?.id || null,
      source: 'manual',
    })

    if (!result.ok) {
      // "hittades inte" → 404, övrigt → 500
      const status = result.error === 'Faktura hittades inte' ? 404 : 500
      return NextResponse.json({ error: result.error || 'Serverfel' }, { status })
    }
    // Bevara ursprungligt beteende: manuell markering av redan betald = 400.
    if (result.already_paid) {
      return NextResponse.json({ error: 'Fakturan är redan betald' }, { status: 400 })
    }

    const remaining = Math.round(result.remaining_rot_kr || 0)
    const message = result.transition === 'to_customer_paid'
      ? `Kundens del registrerad — ROT/RUT-delen (${remaining.toLocaleString('sv-SE')} kr) väntar på Skatteverket.`
      : result.transition === 'settled'
        ? 'Skatteverkets utbetalning registrerad — fakturan är slutbetald.'
        : result.transition === 'none'
          ? `Delbelopp registrerat — ${remaining.toLocaleString('sv-SE')} kr återstår.`
          : 'Faktura markerad som betald.'

    return NextResponse.json({
      success: true,
      status: result.status,
      transition: result.transition,
      paid_at: result.paid_at,
      paid_amount: result.paid_amount,
      remaining_rot_kr: remaining,
      message,
    })
  } catch (err: any) {
    console.error('[mark-paid] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
