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
 * GET /api/fortnox/invoices?invoiceId=xxx
 * Get invoice status from Fortnox
 */
export async function GET(request: NextRequest) {
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

    const invoiceId = request.nextUrl.searchParams.get('invoiceId')
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
    }

    const connected = await isFortnoxConnected(business.business_id)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    // Get invoice from Handymate to find Fortnox document number
    const { data: invoice } = await adminSupabase
      .from('invoice')
      .select('fortnox_document_number')
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (!invoice?.fortnox_document_number) {
      return NextResponse.json({ error: 'Invoice not synced to Fortnox' }, { status: 404 })
    }

    const fortnoxInvoice = await getFortnoxInvoice(business.business_id, invoice.fortnox_document_number)

    return NextResponse.json({
      balance: fortnoxInvoice.Balance,
      fullyPaid: fortnoxInvoice.FullyPaid,
      booked: fortnoxInvoice.Booked,
      cancelled: fortnoxInvoice.Cancelled
    })

  } catch (error: unknown) {
    console.error('Get Fortnox invoice status error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get status'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
