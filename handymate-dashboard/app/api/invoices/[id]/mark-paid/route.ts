import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { applyInvoicePayment } from '@/lib/invoices/apply-payment'

/**
 * POST /api/invoices/[id]/mark-paid
 *
 * Manuell betal-markering — överstyr cron-syncen. Delar kärnlogiken
 * (status-flip + Fortnox-synk + automation-pipeline + portal-notis) med
 * kundens "Jag har betalat"-bekräftelse via `lib/invoices/apply-payment`.
 *
 * Body (optional): { paid_at?: string, amount?: number }
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

    const currentUser = await getCurrentUser(request)
    const body = await request.json().catch(() => ({}))

    const result = await applyInvoicePayment({
      businessId: business.business_id,
      invoiceId: params.id,
      paidAt: (body?.paid_at as string) || undefined,
      amount: body?.amount != null ? Number(body.amount) : undefined,
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

    return NextResponse.json({
      success: true,
      status: result.status,
      paid_at: result.paid_at,
      fortnox_synced: result.fortnox_synced,
      fortnox_error: result.fortnox_error || null,
      message: result.fortnox_synced !== false
        ? 'Faktura markerad som betald.'
        : `Markerad som betald i Handymate. Fortnox-synk misslyckades: ${result.fortnox_error}`,
    })
  } catch (err: any) {
    console.error('[mark-paid] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
