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
 * POST /api/fortnox/sync/invoice
 * Sync a single invoice to Fortnox (by invoice_id in body)
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

    const { invoiceId } = await request.json()
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
    }

    const result = await syncInvoiceToFortnox(business.business_id, invoiceId)

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
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
