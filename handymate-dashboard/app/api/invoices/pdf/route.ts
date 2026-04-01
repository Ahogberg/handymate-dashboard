import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'
import { generateInvoicePDF } from '@/lib/pdf-generator'
import { generateSwishQR } from '@/lib/swish-qr'
import {
  escapeHtml,
  formatCurrency,
  formatDateLong,
  buildContactLine,
  renderDocumentHeader,
  renderTealLine,
  renderFooterGrid,
  wrapInPage,
} from '@/lib/document-html'

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
          contact_phone: businessConfig?.contact_phone || businessConfig?.phone_number,
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
      )

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="faktura-${invoice.invoice_number}.pdf"`,
        },
      })
    }

    // HTML view
    const payAmount = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
    const swishQR = await generateSwishQR(
      businessConfig?.swish_number,
      payAmount || invoice.total,
      invoice.invoice_number,
    )

    const html = generateInvoiceHTML(invoice, businessConfig, ocrNumber, swishQR)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Generate invoice PDF error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── HTML generation ────────────────────────────────────────────

function generateInvoiceHTML(
  invoice: any,
  config: any,
  ocrNumber: string,
  swishQR: string | null,
): string {
  const items = (invoice.items || []) as any[]
  const invoiceType = invoice.invoice_type || 'standard'

  // Determine document title
  let docType = 'Faktura'
  if (invoice.is_credit_note || invoiceType === 'credit') docType = 'Kreditfaktura'
  else if (invoiceType === 'reminder') docType = 'Betalningspåminnelse'
  else if (invoiceType === 'partial') docType = `Delfaktura ${invoice.partial_number || ''} av ${invoice.partial_total || ''}`

  const contactLine = buildContactLine(
    config?.contact_name,
    config?.phone_number || config?.contact_phone,
    config?.contact_email,
    config?.website,
  )

  // ── Header ──
  const header = renderDocumentHeader(
    config?.business_name || 'Företag',
    contactLine,
    docType,
    invoice.invoice_number,
  )

  // ── Meta row ──
  const customerAddress = [
    invoice.customer?.name || 'Kund',
    invoice.customer?.address_line || '',
  ].filter(Boolean).join('<br>')

  // Avser-kolumn: offert-referens om finns
  const avserParts: string[] = []
  if (invoice.quote_number) avserParts.push(`Offert ${escapeHtml(invoice.quote_number)}`)
  if (invoice.description) avserParts.push(escapeHtml(invoice.description))
  if (invoice.project_address) avserParts.push(escapeHtml(invoice.project_address))

  const metaRow = `
  <div class="meta-row meta-row-3">
    <div class="meta-block">
      <div class="label">Faktureras till</div>
      <div class="value">${customerAddress}</div>
    </div>
    <div class="meta-block">
      <div class="label">Fakturadatum</div>
      <div class="value">${formatDateLong(invoice.invoice_date)}</div>
      <div class="label" style="margin-top:12px">Förfallodatum</div>
      <div class="value highlight">${formatDateLong(invoice.due_date)}</div>
    </div>
    <div class="meta-block">
      <div class="label">Avser</div>
      <div class="value">${avserParts.join('<br>') || '—'}</div>
      ${invoice.our_reference ? `<div class="label" style="margin-top:12px">Vår referens</div><div class="value">${escapeHtml(invoice.our_reference)}</div>` : ''}
      ${invoice.your_reference ? `<div class="label" style="margin-top:12px">Er referens</div><div class="value">${escapeHtml(invoice.your_reference)}</div>` : ''}
    </div>
  </div>`

  // ── Items table ──
  const itemsHtml = renderInvoiceItems(items)

  // ── Totals ──
  const hasRotRut = !!invoice.rot_rut_type
  const rotRutLabel = invoice.rot_rut_type?.toUpperCase() || ''
  const rotRutPercent = invoice.rot_rut_type === 'rut' ? '50' : '30'

  let totalsRows = ''
  totalsRows += `<div class="t-row"><span>Netto exkl. moms</span><span>${formatCurrency(invoice.subtotal)}</span></div>`
  if (invoice.discount_amount) {
    totalsRows += `<div class="t-row"><span>Rabatt</span><span>-${formatCurrency(invoice.discount_amount)}</span></div>`
  }
  totalsRows += `<div class="t-row"><span>Moms ${invoice.vat_rate || 25}%</span><span>${formatCurrency(invoice.vat_amount)}</span></div>`
  if (hasRotRut) {
    totalsRows += `<div class="t-row rot"><span>${rotRutLabel}-avdrag ${rotRutPercent}%</span><span>-${formatCurrency(invoice.rot_rut_deduction)}</span></div>`
  }
  totalsRows += `<div class="t-row final"><span>Att betala</span><span>${formatCurrency(hasRotRut ? invoice.customer_pays : invoice.total)}</span></div>`

  const totalsHtml = `
  <div class="totals">
    <div class="totals-block">
      ${totalsRows}
    </div>
  </div>`

  // ── Swish row ──
  const finalAmount = hasRotRut ? invoice.customer_pays : invoice.total
  let swishRowHtml = ''

  if (swishQR && config?.swish_number) {
    const formattedSwish = config.swish_number.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4')
    swishRowHtml = `
    <div class="swish-row">
      <div class="swish-qr">
        <img src="${swishQR}" alt="Swish QR" style="width:48px;height:48px;border-radius:4px;" />
      </div>
      <div class="swish-info">
        <div class="label">Betala med Swish</div>
        <div class="val">${escapeHtml(formattedSwish)}</div>
        <div class="sub">Märk betalning: ${escapeHtml(invoice.invoice_number)}</div>
      </div>
      <div class="swish-amount">
        <div class="big">${formatCurrency(finalAmount)}</div>
        <div class="due">förfaller ${formatDateLong(invoice.due_date)}</div>
      </div>
    </div>`
  } else if (config?.bankgiro || config?.plusgiro) {
    // Fallback: show payment info without QR
    const payNum = config?.bankgiro || config?.plusgiro || ''
    const payLabel = config?.bankgiro ? 'Bankgiro' : 'Plusgiro'
    swishRowHtml = `
    <div class="swish-row">
      <div class="swish-info">
        <div class="label">${payLabel}</div>
        <div class="val">${escapeHtml(payNum)}</div>
        <div class="sub">OCR: ${escapeHtml(ocrNumber)}</div>
      </div>
      <div class="swish-amount">
        <div class="big">${formatCurrency(finalAmount)}</div>
        <div class="due">förfaller ${formatDateLong(invoice.due_date)}</div>
      </div>
    </div>`
  }

  // ── Footer ──
  const orgNumber = config?.org_number || ''
  const momsNr = orgNumber ? `SE${orgNumber.replace('-', '')}01` : ''

  const footerHtml = renderFooterGrid([
    {
      label: 'Bankgiro',
      value: escapeHtml(config?.bankgiro || '—'),
    },
    {
      label: 'Org.nr / Moms',
      value: [
        escapeHtml(orgNumber),
        momsNr ? escapeHtml(momsNr) : '',
      ].filter(Boolean).join('<br>'),
    },
    {
      label: 'F-skattsedel',
      value: config?.f_skatt_registered ? 'Godkänd' : '—',
    },
  ])

  // ── Assemble ──
  const bodyHtml = [
    header,
    renderTealLine(),
    metaRow,
    '<div class="section-title">Specifikation</div>',
    itemsHtml,
    totalsHtml,
    swishRowHtml,
    footerHtml,
  ].filter(Boolean).join('\n')

  return wrapInPage(
    `${docType} ${escapeHtml(invoice.invoice_number)} — ${escapeHtml(config?.business_name || '')}`,
    '',
    bodyHtml,
  )
}

// ── Invoice items table ────────────────────────────────────────

function renderInvoiceItems(items: any[]): string {
  if (!items.length) return ''

  const rows = items.map((item: any) => {
    const itemType = item.item_type || 'item'

    if (itemType === 'heading') {
      return `<tr class="heading-row"><td colspan="5">${escapeHtml(item.description)}</td></tr>`
    }
    if (itemType === 'text') {
      return `<tr class="text-row"><td colspan="5">${escapeHtml(item.description)}</td></tr>`
    }
    if (itemType === 'subtotal') {
      return `<tr class="subtotal-row"><td colspan="4" style="text-align:right">${escapeHtml(item.description || 'Delsumma')}</td><td class="amt">${formatCurrency(item.total)}</td></tr>`
    }
    if (itemType === 'discount') {
      return `<tr class="discount-row"><td>${escapeHtml(item.description || 'Rabatt')}</td><td class="r">${item.quantity}</td><td class="r">${item.unit || 'st'}</td><td class="r">${formatCurrency(Math.abs(item.unit_price))}</td><td class="amt">-${formatCurrency(Math.abs(item.total))}</td></tr>`
    }

    // Regular item
    return `<tr>
      <td><div class="item-name">${escapeHtml(item.description)}</div></td>
      <td class="r">${item.quantity}</td>
      <td class="r">${item.unit || 'st'}</td>
      <td class="r">${formatCurrency(item.unit_price)}</td>
      <td class="amt">${formatCurrency(item.total)}</td>
    </tr>`
  }).join('\n')

  return `
  <table class="items">
    <thead><tr>
      <th style="width:44%">Beskrivning</th>
      <th class="r" style="width:10%">Antal</th>
      <th class="r" style="width:10%">Enhet</th>
      <th class="r" style="width:18%">Pris/enhet</th>
      <th class="r" style="width:18%">Summa</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}
