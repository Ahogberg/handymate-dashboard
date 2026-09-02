import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'
import { generateSwishQR } from '@/lib/swish-qr'
import { buildInvoiceTemplateData, selectInvoiceTemplate } from '@/lib/invoice-templates'
import { buildInvoicePdfBuffer } from '@/lib/invoices/build-invoice-pdf'
import { buildAttribution } from '@/lib/branding/attribution'

// Chromium-rendering (format=pdf-grenen, ETAPP 6b) kräver Node-runtime och
// en generösare timeout — samma mönster som quotes/pdf och invoices/pdf.
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET - Generate reminder PDF (HTML preview, default) eller riktig binär
 * PDF (?format=pdf, ETAPP 6b) för en försenad faktura. Visar ursprungligt
 * belopp, påminnelseavgift, dröjsmålsränta och nytt totalbelopp.
 *
 * HTML-läget (default) BEHÅLLS OFÖRÄNDRAT — det är vad
 * app/dashboard/invoices/[id]/page.tsx ("Visa påminnelse-PDF"-länken,
 * target="_blank") faktiskt använder idag.
 *
 * format=pdf har INGEN jsPDF-fallback (medvetet val, ETAPP 6b): jsPDF-
 * generatorn (lib/pdf-generator.ts) saknar helt stöd för dröjsmålsränta/
 * påminnelseavgift-rader — den kan alltså inte producera en KORREKT
 * påminnelse-PDF. Hellre ett tydligt fel än en felaktig PDF som saknar
 * avgifterna kunden faktiskt ska betala.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: invoiceId } = params

    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Fetch invoice with customer
    const { data: invoice, error: fetchError } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Get business config — quote_template_style styr även påminnelsens stil
    const { data: config } = await supabase
      .from('business_config')
      .select('business_name, display_name, org_number, contact_name, contact_email, contact_phone, phone_number, address, service_area, bankgiro, plusgiro, swish_number, f_skatt_registered, penalty_interest, late_fee_percent, reminder_fee, accent_color, logo_url, tagline, invoice_footer_text, quote_template_style')
      .eq('business_id', business.business_id)
      .single()

    // Get reminder history
    const { data: reminders } = await supabase
      .from('invoice_reminders')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('reminder_number', { ascending: true })

    // OCR
    const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
    invoice.ocr_number = ocrNumber

    // Markera som påminnelse + säkerställ att data-builder beräknar dröjsmålsränta
    // (dataset behöver ha invoice_type='reminder' och reminder_count för att
    // late-card/late-rows ska aktiveras i mallarna).
    invoice.invoice_type = 'reminder'
    invoice.reminder_count = (invoice.reminder_count || 0) + 1

    // Räkna ut Swish QR med drojs-ränta inräknad (mallens amountToPay)
    const tmp = buildInvoiceTemplateData(invoice, config, null)
    const swishQR = await generateSwishQR(
      config?.swish_number,
      tmp.invoice.amountToPay,
      invoice.invoice_number,
    )

    // format=pdf (ETAPP 6b): riktig binär PDF via samma delade helper som
    // invoices/pdf och invoices/send — swishQrOverride skickas in eftersom
    // beloppet för en påminnelse (inkl. dröjsmålsränta + avgift) redan är
    // uträknat ovan (tvåstegs-beräkningen som HTML-läget alltid gjort).
    // Stämpeln: config ovan är en kolumnlista (får inte utökas med stämpel-
    // kolumnen före sql/v202), men `business` från getAuthenticatedBusiness
    // är hela raden — bygg direkt, ingen extra query.
    const attribution = buildAttribution(business)

    const format = request.nextUrl.searchParams.get('format') || 'html'
    if (format === 'pdf') {
      const pdfBuffer = await buildInvoicePdfBuffer(invoice, config, {
        swishQrOverride: swishQR,
        logTag: 'invoices/reminder-pdf',
        attribution,
      })
      if (!pdfBuffer) {
        // Medvetet ingen jsPDF-fallback — se filens header-kommentar.
        console.error('[invoices/reminder-pdf] Chromium-rendering misslyckades — ingen jsPDF-fallback finns för påminnelser (saknar ränte-/avgiftsstöd)')
        return NextResponse.json(
          { error: 'Kunde inte generera påminnelse-PDF just nu. Försök igen om en stund.' },
          { status: 502 },
        )
      }
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="paminnelse-${invoice.invoice_number}.pdf"`,
        },
      })
    }

    const templateData = buildInvoiceTemplateData(invoice, config, swishQR)
    templateData.attribution = attribution
    const renderFn = selectInvoiceTemplate(config?.quote_template_style)
    const html = renderFn(templateData)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: any) {
    console.error('Reminder PDF error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
