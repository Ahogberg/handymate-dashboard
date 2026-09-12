import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
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
 * Bokföring ändrar inte leveransstatus och denna fristående väg skickar
 * ingen e-faktura. Kundleverans hanteras av det separata sändflödet.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getCurrentUser(request, business.business_id)
    if (!user?.is_active || !hasPermission(user, 'create_invoices')) return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })

    const invoiceId = params.id
    const supabase = getServerSupabase()

    const result = await syncInvoiceToFortnox(supabase, {
      businessId: business.business_id,
      invoiceId,
      allowEInvoice: false,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, message: result.error || 'Fortnox-synken kunde inte bekräftas. Kontrollera läget innan du fortsätter.' },
        { status: 502 },
      )
    }

    if (result.skipped) {
      return NextResponse.json({ error: 'Fortnox är inte kopplad. Gå till Inställningar → Integrationer.' }, { status: 400 })
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
