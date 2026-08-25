import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkSmsRateLimitDb, checkEmailRateLimitDb } from '@/lib/rate-limit-db'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { sendInvoice } from '@/lib/invoices/send-invoice'

// Chromium-rendering (buildInvoicePdfBuffer → renderHtmlToPdf, i sändkärnan
// lib/invoices/send-invoice.ts) kräver Node-runtime och en generösare
// timeout än default — samma mönster som quotes/pdf och invoices/pdf
// (ETAPP 6b, offert-masterplan.md).
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST - Skicka faktura via SMS och/eller email
 *
 * Tunn rutt (Etapp Q, TD-86, 2026-08-18): auth, behörighet, validering och
 * rate limiting stannar här — själva sändningen (email/SMS/PDF/manifest/
 * status/post-send-automationer) bor i den delade kärnan
 * lib/invoices/send-invoice.ts, som även autoInvoiceOnComplete anropar
 * direkt (server-till-server, ingen session).
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

    const supabase = getServerSupabase()
    const body = await request.json()
    const { invoice_id, send_sms = false, send_email = true } = body

    if (!invoice_id) {
      return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 })
    }

    // Rate limit check
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

    const sendResult = await sendInvoice(supabase, {
      businessId: business.business_id,
      invoiceId: invoice_id,
      sendEmail: send_email,
      sendSms: send_sms,
    })

    if (!sendResult.found) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { found, ...results } = sendResult
    return NextResponse.json({
      // BUGFIX (2026-08-25, Codex-granskningens fynd 3, källverifierat):
      // sändkärnan hoppar MEDVETET över mejl/SMS när e-fakturan gått via
      // Fortnox (results.einvoice — se send-invoice.ts: annars får en
      // e-fakturakund ett dubblettmejl). `email || sms` ensamt gjorde då en
      // LYCKAD e-fakturaleverans till success:false mot UI/anropare.
      success: Boolean(results.email || results.sms || results.einvoice),
      ...results
    })

  } catch (error: any) {
    console.error('Send invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
