import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { syncInvoiceToFortnox } from '@/lib/fortnox'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

/**
 * POST /api/integrations/fortnox/sync/invoice
 *
 * Synkar EN faktura till Fortnox ({ invoiceId } i body).
 */
export async function POST(request: NextRequest) {
  let businessId: string | null = null
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    businessId = business.business_id

    const { invoiceId } = await request.json()
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
    }

    const result = await syncInvoiceToFortnox(businessId, invoiceId)

    await logFortnoxOperation(businessId, 'sync_invoice', {
      invoice_id: invoiceId,
      success: result.success,
      fortnox_invoice_number: result.fortnoxInvoiceNumber ?? null,
    }, result.success ? null : result.error)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      fortnoxInvoiceNumber: result.fortnoxInvoiceNumber,
      fortnoxDocumentNumber: result.fortnoxDocumentNumber
    })

  } catch (error: unknown) {
    console.error('Sync invoice error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    if (businessId) {
      await logFortnoxOperation(businessId, 'sync_invoice', null, errorMessage)
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
