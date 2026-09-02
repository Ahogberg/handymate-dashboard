import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'
import { generateInvoicePDF } from '@/lib/pdf-generator'
import { generateSwishQR } from '@/lib/swish-qr'
import {
  buildInvoiceTemplateData,
  selectInvoiceTemplate,
} from '@/lib/invoice-templates'
import { buildInvoicePdfBuffer } from '@/lib/invoices/build-invoice-pdf'
import { buildAttribution } from '@/lib/branding/attribution'

// Chromium-rendering kräver Node-runtime (inte Edge) och tål kallstart —
// @sparticuz/chromium packar upp binären vid första anropet. Samma mönster
// som quotes/pdf (ETAPP 6b, offert-masterplan.md).
export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

/**
 * GET - Generera faktura-PDF (HTML eller binär)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const invoiceId = request.nextUrl.searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
    }

    // Försök autentiserad åtkomst först (dashboard-vy)
    const business = await getAuthenticatedBusiness(request)

    let query = supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          name,
          phone_number,
          email,
          address_line,
          personal_number,
          property_designation,
          customer_number
        )
      `)
      .eq('invoice_id', invoiceId)

    if (business) {
      // Autentiserad: visa bara egna fakturor
      query = query.eq('business_id', business.business_id)
    } else {
      // Publik åtkomst: bara skickade/betalda fakturor (inte drafts)
      query = query.in('status', ['sent', 'paid', 'overdue', 'reminded'])
    }

    const { data: invoice, error: invoiceError } = await query.single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', invoice.business_id)
      .single()

    const format = request.nextUrl.searchParams.get('format') || 'html'
    const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')

    // Binary PDF
    if (format === 'pdf') {
      // ── Primär väg (ETAPP 6b, offert-masterplan.md): samma mall-HTML
      // som HTML-vyn nedan (buildInvoiceTemplateData + selectInvoiceTemplate)
      // → Chromium → PDF. Exakt match mot vad kunden/hantverkaren ser i
      // "Visa faktura" — samma princip som offertens PDF-väg (ETAPP 1-2).
      try {
        const styleOverride = request.nextUrl.searchParams.get('style')
        const pdfFromHtml = await buildInvoicePdfBuffer(invoice, businessConfig, {
          styleOverride,
          logTag: 'invoices/pdf',
        })
        if (pdfFromHtml) {
          return new NextResponse(pdfFromHtml, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="faktura-${invoice.invoice_number}.pdf"`,
            },
          })
        }
      } catch (err) {
        console.error('[invoices/pdf] HTML→PDF-vägen kastade — faller tillbaka till jsPDF:', err)
      }

      // ── Fallback: gamla jsPDF-renderaren (fail-safe, samma logg-taggmönster
      // som offerten — greppbar i Vercel-loggarna) ─────────────────────────
      console.error('[invoices/pdf] FALLBACK-JSPDF AKTIV — Chromium-rendering misslyckades, fakturan laddas ner med den äldre jsPDF-renderaren')
      const payAmount = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
      const swishQR = await generateSwishQR(
        businessConfig?.swish_number,
        payAmount || invoice.total,
        invoice.invoice_number,
      )

      const pdfBuffer = generateInvoicePDF(
        {
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          status: invoice.status,
          items: invoice.items || [],
          subtotal: invoice.subtotal,
          vat_rate: invoice.vat_rate,
          vat_amount: invoice.vat_amount,
          total: invoice.total,
          rot_rut_type: invoice.rot_rut_type,
          rot_rut_deduction: invoice.rot_rut_deduction,
          customer_pays: invoice.customer_pays,
          is_credit_note: invoice.is_credit_note,
          credit_reason: invoice.credit_reason,
          original_invoice_id: invoice.original_invoice_id,
          personnummer: invoice.personnummer,
          fastighetsbeteckning: invoice.fastighetsbeteckning,
          customer: invoice.customer,
          ocr_number: ocrNumber,
          our_reference: invoice.our_reference,
          your_reference: invoice.your_reference,
          invoice_type: invoice.invoice_type || 'standard',
        },
        {
          business_name: businessConfig?.business_name,
          org_number: businessConfig?.org_number,
          contact_email: businessConfig?.contact_email,
          contact_phone: businessConfig?.public_phone || businessConfig?.phone_number,
          address: businessConfig?.address || businessConfig?.service_area,
          bankgiro: businessConfig?.bankgiro,
          plusgiro: businessConfig?.plusgiro,
          swish_number: businessConfig?.swish_number,
          swish_qr: swishQR || undefined,
          bank_account_number: businessConfig?.bank_account_number,
          f_skatt_registered: businessConfig?.f_skatt_registered,
          accent_color: '#0F766E',
          invoice_footer_text: businessConfig?.invoice_footer_text,
          penalty_interest: businessConfig?.penalty_interest || businessConfig?.late_fee_percent,
        },
        // businessConfig är hela raden (select('*')) — stämpeln byggs direkt.
        { attribution: buildAttribution(businessConfig) },
      )

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="faktura-${invoice.invoice_number}.pdf"`,
        },
      })
    }

    // HTML view via template-systemet — väljer mall från quote_template_style
    // (samma fält styr offerter, fakturor och påminnelser för konsistent stil).
    const payAmount = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
    const swishQR = await generateSwishQR(
      businessConfig?.swish_number,
      payAmount || invoice.total,
      invoice.invoice_number,
    )

    // Säkerställ att invoice har ocr_number satt + customer-objekt
    invoice.ocr_number = ocrNumber

    const templateData = buildInvoiceTemplateData(invoice, businessConfig, swishQR)
    // Style-precedence: ?style=... (settings-preview) > per-faktura val
    // (ETAPP 6c, sql/v82) > business default.
    const styleOverride = request.nextUrl.searchParams.get('style')
    const renderFn = selectInvoiceTemplate(
      styleOverride || invoice.template_style || businessConfig?.quote_template_style,
    )
    const html = renderFn(templateData)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Generate invoice PDF error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ETAPP 6a (offert-masterplan.md, faktura-sprinten): generateInvoiceHTML +
// renderInvoiceItems (213 döda rader — importerades ingenstans, HTML-vägen
// ovan har alltid gått via buildInvoiceTemplateData/selectInvoiceTemplate)
// raderade. De var facit för subtotal/discount-radsemantiken — porterad
// till lib/invoice-templates/data-builder.ts (items-mappningen) innan
// radering, se den filens kommentarer.
//
// ETAPP 6b: den binära PDF-vägen (format=pdf) går nu PRIMÄRT via samma
// mall-HTML→Chromium-väg som offerten (buildInvoicePdfBuffer, delad med
// invoices/send + invoices/[id]/reminder-pdf) — jsPDF (lib/pdf-generator.ts)
// är fail-safe-fallback, precis som quotes/pdf.
