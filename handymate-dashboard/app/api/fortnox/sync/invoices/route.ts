import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { isFortnoxConnected, syncInvoiceToFortnox } from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/fortnox/sync/invoices
 * Sync all unsynced invoices to Fortnox
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = getSupabase()
    const { data: business } = await adminSupabase
      .from('business_config')
      .select('business_id')
      .eq('user_id', session.user.id)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    // Get all non-draft invoices without fortnox_invoice_number
    const { data: invoices, error: fetchError } = await adminSupabase
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
      const result = await syncInvoiceToFortnox(businessId, invoice.invoice_id)
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

    return NextResponse.json({
      success: true,
      synced: results.synced,
      failed: results.failed,
      errors: results.errors
    })

  } catch (error: unknown) {
    console.error('Sync invoices error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
