import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected } from '@/lib/fortnox'
import { syncInvoiceToFortnox } from '@/lib/invoices/sync-to-fortnox'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

/**
 * POST /api/integrations/fortnox/sync/invoices
 *
 * Synkar alla icke-draft-fakturor utan fortnox_invoice_number till Fortnox.
 */
export async function POST(request: NextRequest) {
  let businessId: string | null = null
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    const { data: invoices, error: fetchError } = await supabase
      .from('invoice')
      .select('invoice_id')
      .eq('business_id', businessId)
      .neq('status', 'draft')
      .is('fortnox_invoice_number', null)

    if (fetchError) {
      throw fetchError
    }

    const results = {
      synced: 0,
      failed: 0,
      errors: [] as { invoiceId: string; error: string }[]
    }

    for (const invoice of invoices || []) {
      const result = await syncInvoiceToFortnox(supabase, { businessId, invoiceId: invoice.invoice_id })
      if (result.success) {
        results.synced++
      } else {
        results.failed++
        results.errors.push({
          invoiceId: invoice.invoice_id,
          error: result.error || 'Unknown error'
        })
      }
    }

    await logFortnoxOperation(businessId, 'sync_invoices', {
      synced: results.synced,
      failed: results.failed,
      error_count: results.errors.length,
    })

    return NextResponse.json({
      success: true,
      synced: results.synced,
      failed: results.failed,
      errors: results.errors
    })

  } catch (error: unknown) {
    console.error('Sync invoices error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    if (businessId) {
      await logFortnoxOperation(businessId, 'sync_invoices', null, errorMessage)
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
