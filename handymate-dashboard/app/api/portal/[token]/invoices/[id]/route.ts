import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { generateOCR } from '@/lib/ocr'
import { generateSwishQR } from '@/lib/swish-qr'
import { buildInvoiceTemplateData, selectInvoiceTemplate } from '@/lib/invoice-templates'
import { stripPrintBar } from '@/lib/document-html'

// Chromium ligger inte i denna väg (bara HTML-strängar/React-rendering till
// markup) — men buildInvoiceTemplateData/selectInvoiceTemplate går via
// react-dom/server (samma skäl som quotes/public/[token], ETAPP 5).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/[token]/invoices/[id] — ETAPP 6e (offert-masterplan.md,
 * faktura-sprinten): fakturans motsvarighet till /api/quotes/public/[token]
 * — bygger SAMMA dokumentmotor-data (buildInvoiceTemplateData) som PDF:en/
 * dashboardens Fakturarum redan renderar, så portalens fakturavy kan visa
 * det RIKTIGA dokumentet istället för en fjärde tolkning.
 *
 * LAZY, medvetet: listroutens (/invoices) svar hämtas i förväg för ALLA
 * fakturor när "Dokument"-fliken öppnas (befintligt mönster, se
 * app/portal/[token]/page.tsx). Att bygga templateData där för varje faktura
 * hade betytt en Swish-QR-generering (riktig PNG, ej gratis) PER faktura i
 * listan — även de kunden aldrig öppnar. Den här routen hämtas först när
 * kunden faktiskt trycker in i en specifik faktura (PortalInvoiceDetail),
 * så kostnaden bärs bara av det dokument som visas.
 *
 * Returnerar ENDAST dokumentdata — invoice/paymentInfo kommer redan från
 * listan (props till PortalInvoiceDetail, orört). Inget skäl att
 * duplicera dem här.
 *
 * Sanitering: buildInvoiceTemplateData projicerar råraden till
 * InvoiceTemplateData (business/customer/invoice) fält-för-fält — samma
 * "kundvänd by design"-princip som lib/quotes/public-document.ts
 * dokumenterar, men fakturan har inget displayLevel-koncept att sanera för
 * (kunden ser alltid alla belopp på sin egen faktura). Inga interna kolumner
 * (kostnadsfält/interna noter) selekteras överhuvudtaget i queryn nedan —
 * `select('*')` undviks medvetet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string; id: string } },
) {
  try {
    const supabase = getServerSupabase()
    const { token, id: invoiceId } = params

    // 1. Kund via portal_token (samma mönster som claim-paid/invoices-list)
    const { data: customer, error: custErr } = await supabase
      .from('customer')
      .select('customer_id, business_id, name, phone_number, email, address_line, personal_number, portal_enabled')
      .eq('portal_token', token)
      .single()

    if (custErr || !customer || !customer.portal_enabled) {
      return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })
    }

    // 2. Faktura + ägarskap — samma statusfilter som listroutens publika
    // åtkomst (draft/cancelled ska aldrig nå kunden). customer_id kollas
    // direkt i queryn (ägarskap), inte bara business_id — annars kunde en
    // kund med giltig portal_token gissa sig till en ANNAN kunds
    // fakturanummer på samma företag.
    const { data: invoice, error: invErr } = await supabase
      .from('invoice')
      .select(`
        invoice_id, invoice_number, invoice_type, status, description,
        items, subtotal, vat_rate, vat_amount, total,
        rot_rut_type, rot_rut_deduction, customer_pays,
        invoice_date, due_date, paid_at, created_at,
        ocr_number, our_reference, your_reference,
        personnummer, fastighetsbeteckning,
        is_credit_note, credit_reason, original_invoice_id, credit_for_invoice_id,
        reminder_count, partial_number, quote_number,
        discount_percent, discount_amount, payment_terms_text,
        introduction_text, conclusion_text,
        bankgiro_number, plusgiro_number, template_style
      `)
      .eq('invoice_id', invoiceId)
      .eq('customer_id', customer.customer_id)
      .eq('business_id', customer.business_id)
      .in('status', ['sent', 'paid', 'overdue'])
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Fakturan hittades inte' }, { status: 404 })
    }

    // 3. Business-config — explicit fältlista (INTE select('*'), samma regel
    // som resten av routen: aldrig exponera en framtida intern kolumn av
    // misstag). Listan speglar EXAKT den som app/api/invoices/[id]/
    // reminder-pdf/route.ts redan använder framgångsrikt i produktion —
    // valt som facit istället för att gissa, eftersom PostgREST 400:ar HELA
    // frågan om en efterfrågad kolumn inte finns (till skillnad från
    // select('*') där en obefintlig kolumn i data-builder.ts:s optional
    // chaining bara blir undefined). `vat_number`/`default_invoice_terms`
    // (som data-builder.ts också läser) utelämnas medvetet — ingen
    // bekräftad träff i sql/-migrationerna, och en trasig kolumnbegäran här
    // hade tystat HELA dokumentet (businessConfig blir null) för varje
    // portal-faktura. Samma dokumenterade luckor som masterplanens
    // "Kända uppföljningar" (E1-E5-rapporten) redan listar för offerten.
    const { data: businessConfig } = await supabase
      .from('business_config')
      .select(`
        business_name, contact_name, contact_email, contact_phone, phone_number,
        address, service_area, website, org_number, f_skatt_registered,
        logo_url, accent_color, tagline, bankgiro, plusgiro, swish_number,
        penalty_interest, late_fee_percent, reminder_fee, quote_template_style
      `)
      .eq('business_id', customer.business_id)
      .single()

    const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
    invoice.ocr_number = ocrNumber
    ;(invoice as any).customer = {
      name: customer.name,
      phone_number: customer.phone_number,
      email: customer.email,
      address_line: customer.address_line,
      personal_number: customer.personal_number,
    }

    const payAmount = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
    const swishQR = await generateSwishQR(businessConfig?.swish_number, payAmount || invoice.total, invoice.invoice_number)

    const templateData = buildInvoiceTemplateData(invoice, businessConfig, swishQR)

    const templateStyle = (invoice.template_style || businessConfig?.quote_template_style || 'modern') as
      | 'modern' | 'premium' | 'friendly'

    let documentHtml: string | null = null
    if (templateStyle !== 'modern') {
      const renderFn = selectInvoiceTemplate(templateStyle)
      documentHtml = stripPrintBar(renderFn(templateData))
    }

    return NextResponse.json({
      template_data: templateData,
      template_style: templateStyle,
      document_html: documentHtml,
    })
  } catch (error: any) {
    console.error('Portal invoice detail error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
