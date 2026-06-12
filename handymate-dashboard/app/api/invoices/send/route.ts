import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkSmsRateLimitDb, checkEmailRateLimitDb } from '@/lib/rate-limit-db'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { sendInvoice } from '@/lib/invoices/send-invoice'

/**
 * POST - Skicka faktura via SMS och/eller email.
 *
 * Steg 1 (execution-chain): affärslogiken bor nu i lib/invoices/send-invoice.ts
 * (service-role-kapabel, delas med execute.ts i Steg 3). Routen är en tunn
 * wrapper: auth → permission → rate-limit → sendInvoice. Beteende utåt
 * oförändrat (samma response-shape, samma sidoeffekter).
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const body = await request.json()
    const { invoice_id, send_sms = false, send_email = true } = body

    if (!invoice_id) {
      return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 })
    }

    // Rate limit check (user-facing — körs INTE på systemvägen via execute.ts)
    if (send_sms) {
      const smsLimit = await checkSmsRateLimitDb(business.business_id)
      if (!smsLimit.allowed) {
        return NextResponse.json({ error: smsLimit.error }, { status: 429 })
      }
    }
    if (send_email) {
      const emailLimit = await checkEmailRateLimitDb(business.business_id)
      if (!emailLimit.allowed) {
        return NextResponse.json({ error: emailLimit.error }, { status: 429 })
      }
    }

    const supabase = getServerSupabase()
    const results = await sendInvoice(supabase, business.business_id, {
      invoiceId: invoice_id,
      sendSms: send_sms,
      sendEmail: send_email,
    })

    if (results.notFound) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Samma response-shape som tidigare: success = email || sms (truthy/absent),
    // plus sms/email/errors. undefined-fält faller bort i JSON precis som
    // den gamla `...results`-spreaden.
    return NextResponse.json({
      success: results.email || results.sms,
      sms: results.sms,
      email: results.email,
      errors: results.errors,
    })

  } catch (error: any) {
    console.error('Send invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
