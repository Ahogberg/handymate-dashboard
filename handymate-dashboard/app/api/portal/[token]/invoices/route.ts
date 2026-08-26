import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { generateOCR } from '@/lib/ocr'
import { getCustomerFromPortalToken } from '@/lib/portal-link'
import { PORTAL_VISIBLE_STATUSES } from '@/lib/invoices/status'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { data: invoices, error: invoicesError } = await supabase
      .from('invoice')
      .select(`
        invoice_id, invoice_number, invoice_type, status,
        items, subtotal, vat_rate, vat_amount, total,
        rot_rut_type, rot_rut_deduction, customer_pays,
        invoice_date, due_date, paid_at, created_at,
        ocr_number, our_reference, your_reference,
        personnummer, fastighetsbeteckning,
        is_credit_note, reminder_count,
        introduction_text, conclusion_text
      `)
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      // customer_paid MÅSTE med — annars försvinner en ROT/RUT-faktura ur
      // kundens portal i samma sekund som kunden betalat sin del.
      .in('status', [...PORTAL_VISIBLE_STATUSES])
      .order('created_at', { ascending: false })

    // TD-22: tidigare bara `{ data: invoices }` — en kolumnmissmatch eller
    // RLS-miss gav en tyst tom lista med HTTP 200, ingen spår i loggen.
    if (invoicesError) {
      console.error('[portal/invoices] query error:', invoicesError)
      return NextResponse.json({ error: 'Kunde inte hämta fakturorna just nu' }, { status: 500 })
    }

    // Enrich with OCR numbers
    const enrichedInvoices = (invoices || []).map((inv: any) => ({
      ...inv,
      ocr_number: inv.ocr_number || generateOCR(inv.invoice_number || ''),
    }))

    // Get business payment info — sekundär, best-effort: en trasig
    // affärsprofil ska inte blockera fakturalistan, men loggas.
    const { data: biz, error: bizError } = await supabase
      .from('business_config')
      .select('business_name, bankgiro, plusgiro, swish_number, bank_account_number, phone_number, penalty_interest, late_fee_percent, reminder_fee, f_skatt_registered, org_number')
      .eq('business_id', customer.business_id)
      .single()
    if (bizError) console.error('[portal/invoices] business_config-hämtning misslyckades:', bizError.message)

    return NextResponse.json({
      invoices: enrichedInvoices,
      paymentInfo: {
        bankgiro: biz?.bankgiro || null,
        plusgiro: biz?.plusgiro || null,
        swish: biz?.swish_number || biz?.phone_number || null,
        bank_account: biz?.bank_account_number || null,
        penalty_interest: biz?.penalty_interest || biz?.late_fee_percent || 8,
        reminder_fee: biz?.reminder_fee || 60,
      },
      business: {
        name: biz?.business_name || '',
        org_number: biz?.org_number || '',
        f_skatt: biz?.f_skatt_registered || false,
      }
    })
  } catch (error: any) {
    console.error('Portal invoices error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
