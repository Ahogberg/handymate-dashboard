import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { syncInvoiceToFortnox } from '@/lib/invoices/sync-to-fortnox'

/**
 * POST /api/invoices/[id]/send-via-fortnox
 *
 * Fristående "Bokför i Fortnox"-åtgärd — bokför fakturan i Fortnox UTAN
 * att skicka något till kunden. Sedan 2026-08-20 (enat fakturautskick)
 * är detta INTE längre den primära vägen: "Skicka faktura"-knappen gör
 * numera Fortnox-steget automatiskt FÖRE kundleverans, via samma
 * syncInvoiceToFortnox()-funktion. Denna rutt finns kvar för fall där
 * någon medvetet vill bokföra separat från kundleverans (se
 * app/dashboard/invoices/[id]/components/InvoiceHeader.tsx, "Bokför i
 * Fortnox" i "…"-menyn).
 *
 * status='sent' sätts HÄR (till skillnad från syncInvoiceToFortnox, som
 * inte rör kundleverans-status) — historiskt beteende bevarat för denna
 * fristående knapp: en faktura som medvetet bara bokförs via den här
 * vägen (utan att gå via "Skicka faktura") räknas ändå som "sent" i
 * Handymates mening, eftersom det är den enda bekräftelsen som finns
 * att någon tog en aktiv handling på fakturan.
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

    const invoiceId = params.id
    const supabase = getServerSupabase()

    const result = await syncInvoiceToFortnox(supabase, {
      businessId: business.business_id,
      invoiceId,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, message: 'Fortnox-synk misslyckades. Försök igen — vi skapar ingen dubblett.' },
        { status: 502 },
      )
    }

    if (result.skipped) {
      return NextResponse.json({ error: 'Fortnox är inte kopplad. Gå till Inställningar → Integrationer.' }, { status: 400 })
    }

    if (!result.idempotent) {
      await supabase
        .from('invoice')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('invoice_id', invoiceId)
        .eq('business_id', business.business_id)
    }

    return NextResponse.json({
      success: true,
      fortnox_invoice_number: result.fortnoxInvoiceNumber,
      fortnox_document_number: result.fortnoxDocumentNumber,
      idempotent: result.idempotent,
      message: result.idempotent
        ? 'Fakturan är redan synkad till Fortnox.'
        : `Faktura ${result.fortnoxInvoiceNumber} skapad i Fortnox.`,
    })
  } catch (err: any) {
    console.error('[send-via-fortnox] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
