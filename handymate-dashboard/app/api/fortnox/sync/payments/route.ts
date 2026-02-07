import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { isFortnoxConnected, getFortnoxInvoice } from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/fortnox/sync/payments
 * Check Fortnox for paid invoices and update Handymate
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

    // Get all sent/overdue invoices that have been synced to Fortnox
    const { data: invoices, error: fetchError } = await adminSupabase
      .from('invoice')
      .select('invoice_id, fortnox_document_number, status')
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue'])
      .not('fortnox_document_number', 'is', null)

    if (fetchError) {
      throw fetchError
    }

    const results = {
      updated: 0,
      unchanged: 0,
      errors: [] as { invoiceId: string; error: string }[]
    }

    for (const invoice of invoices || []) {
      try {
        const fortnoxInvoice = await getFortnoxInvoice(businessId, invoice.fortnox_document_number)

        if (fortnoxInvoice.FullyPaid) {
          await adminSupabase
            .from('invoice')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              payment_method: 'fortnox'
            })
            .eq('invoice_id', invoice.invoice_id)

          results.updated++
        } else if (fortnoxInvoice.Cancelled) {
          await adminSupabase
            .from('invoice')
            .update({ status: 'cancelled' })
            .eq('invoice_id', invoice.invoice_id)

          results.updated++
        } else {
          results.unchanged++
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push({
          invoiceId: invoice.invoice_id,
          error: errorMessage
        })
      }
    }

    return NextResponse.json({
      success: true,
      updated: results.updated,
      unchanged: results.unchanged,
      total: (invoices || []).length,
      errors: results.errors
    })

  } catch (error: unknown) {
    console.error('Sync payments error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
