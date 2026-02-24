import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'
import { generateInvoicePDF } from '@/lib/pdf-generator'

export const dynamic = 'force-dynamic'

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatSEK(amount: number | null | undefined): string {
  if (amount == null) return '0 kr'
  return amount.toLocaleString('sv-SE') + ' kr'
}

/**
 * GET - Generera faktura-PDF (HTML eller binär)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const invoiceId = request.nextUrl.searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          name,
          phone_number,
          email,
          address_line,
          personal_number,
          property_designation
        )
      `)
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    const items = (invoice.items || []) as any[]
    const format = request.nextUrl.searchParams.get('format') || 'html'
    const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
    const accentColor = businessConfig?.accent_color || '#7c3aed'

    // Determine invoice title
    const invoiceType = invoice.invoice_type || 'standard'
    let title = 'FAKTURA'
    if (invoice.is_credit_note || invoiceType === 'credit') title = 'KREDITFAKTURA'
    else if (invoiceType === 'reminder') title = 'BETALNINGSPÅMINNELSE'
    else if (invoiceType === 'partial') title = `DELFAKTURA ${invoice.partial_number || ''} av ${invoice.partial_total || ''}`

    // Binary PDF
    if (format === 'pdf') {
      const pdfBuffer = generateInvoicePDF(
        {
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          status: invoice.status,
          items,
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
          invoice_type: invoiceType,
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
          bank_account_number: businessConfig?.bank_account_number,
          f_skatt_registered: businessConfig?.f_skatt_registered,
          accent_color: accentColor,
          invoice_footer_text: businessConfig?.invoice_footer_text,
          penalty_interest: businessConfig?.penalty_interest || businessConfig?.late_fee_percent,
        }
      )

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="faktura-${invoice.invoice_number}.pdf"`,
        },
      })
    }

    // ROT/RUT details
    const hasRotRut = !!invoice.rot_rut_type
    const rotRutLabel = invoice.rot_rut_type?.toUpperCase() || ''
    const personnummer = invoice.personnummer || invoice.rot_personal_number || invoice.customer?.personal_number || ''
    const fastighet = invoice.fastighetsbeteckning || invoice.rot_property_designation || invoice.customer?.property_designation || ''

    // Payment methods
    const paymentMethods: { label: string; value: string }[] = []
    if (businessConfig?.bankgiro) paymentMethods.push({ label: 'Bankgiro', value: businessConfig.bankgiro })
    if (businessConfig?.plusgiro) paymentMethods.push({ label: 'Plusgiro', value: businessConfig.plusgiro })
    if (businessConfig?.swish_number) paymentMethods.push({ label: 'Swish', value: businessConfig.swish_number })
    if (businessConfig?.bank_account_number) paymentMethods.push({ label: 'Bankkonto', value: businessConfig.bank_account_number })

    // Build items HTML with grouping
    const itemsHtml = items.map((item: any) => {
      const itemType = item.item_type || 'item'

      if (itemType === 'heading') {
        return `<tr class="heading-row"><td colspan="5" style="font-weight:700;font-size:14px;padding:12px 16px;background:#f0f0f0;border-bottom:1px solid #ddd;">${escapeHtml(item.description)}</td></tr>`
      }
      if (itemType === 'text') {
        return `<tr class="text-row"><td colspan="5" style="color:#666;font-size:13px;padding:10px 16px;font-style:italic;border-bottom:1px solid #eee;">${escapeHtml(item.description)}</td></tr>`
      }
      if (itemType === 'subtotal') {
        return `<tr class="subtotal-row"><td colspan="4" style="text-align:right;font-weight:600;padding:10px 16px;background:#fef3c7;border-bottom:1px solid #ddd;">${escapeHtml(item.description)}</td><td style="text-align:right;font-weight:600;padding:10px 16px;background:#fef3c7;border-bottom:1px solid #ddd;">${formatSEK(item.total)}</td></tr>`
      }
      if (itemType === 'discount') {
        return `<tr class="discount-row"><td style="padding:12px 16px;color:#059669;border-bottom:1px solid #eee;">${escapeHtml(item.description)}</td><td style="text-align:right;padding:12px 16px;color:#059669;border-bottom:1px solid #eee;">${item.quantity}</td><td style="text-align:right;padding:12px 16px;color:#059669;border-bottom:1px solid #eee;">${item.unit}</td><td style="text-align:right;padding:12px 16px;color:#059669;border-bottom:1px solid #eee;">${formatSEK(Math.abs(item.unit_price))}</td><td style="text-align:right;padding:12px 16px;color:#059669;font-weight:600;border-bottom:1px solid #eee;">-${formatSEK(Math.abs(item.total))}</td></tr>`
      }

      // Regular item
      const rotBadge = item.is_rot_eligible ? ' <span style="color:#059669;font-size:10px;">ROT</span>' : item.is_rut_eligible ? ' <span style="color:#059669;font-size:10px;">RUT</span>' : ''
      return `<tr><td style="padding:12px 16px;border-bottom:1px solid #eee;">${escapeHtml(item.description)}${rotBadge}</td><td style="text-align:right;padding:12px 16px;border-bottom:1px solid #eee;">${item.quantity}</td><td style="text-align:right;padding:12px 16px;border-bottom:1px solid #eee;">${item.unit}</td><td style="text-align:right;padding:12px 16px;border-bottom:1px solid #eee;">${formatSEK(item.unit_price)}</td><td style="text-align:right;padding:12px 16px;border-bottom:1px solid #eee;font-weight:500;">${formatSEK(item.total)}</td></tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; line-height: 1.6; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid ${accentColor}; }
    .company-name { font-size: 28px; font-weight: 700; color: ${accentColor}; }
    .company-info { font-size: 12px; color: #666; margin-top: 8px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 32px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
    .invoice-number { font-size: 16px; color: ${accentColor}; font-weight: 600; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
    .party-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
    .party-section p { font-size: 14px; margin-bottom: 3px; }
    .meta-box { background: #f8f5ff; border-radius: 12px; padding: 20px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; }
    .meta-item label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; display: block; margin-bottom: 4px; }
    .meta-item span { font-size: 15px; font-weight: 600; color: #1a1a1a; }
    .rot-rut-banner { background: #d4edda; border: 1px solid #059669; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; font-size: 13px; color: #065f46; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .items-table th { text-align: left; padding: 10px 16px; background: ${accentColor}; color: white; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .items-table th:first-child { border-radius: 8px 0 0 0; }
    .items-table th:last-child { border-radius: 0 8px 0 0; text-align: right; }
    .items-table tr:nth-child(even) { background: #fafafa; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
    .totals-box { width: 300px; background: #f8f5ff; border-radius: 12px; padding: 20px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .totals-row.divider { border-top: 1px solid #ddd; margin-top: 4px; padding-top: 8px; }
    .totals-row.total { font-size: 20px; font-weight: 700; color: ${accentColor}; border-top: 2px solid ${accentColor}; margin-top: 6px; padding-top: 10px; }
    .totals-row.deduction { color: #059669; }
    .totals-row.customer-pays { font-size: 18px; font-weight: 700; background: #d4edda; margin: 10px -20px -20px; padding: 14px 20px; border-radius: 0 0 12px 12px; }
    .payment-box { background: #1a1a1a; color: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .payment-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 16px; }
    .payment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; }
    .payment-item label { font-size: 10px; color: #999; display: block; margin-bottom: 4px; }
    .payment-item span { font-size: 16px; font-weight: 600; color: ${accentColor}; }
    .footer { text-align: center; font-size: 11px; color: #999; padding-top: 16px; border-top: 1px solid #eee; }
    .footer p { margin-bottom: 4px; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(businessConfig?.business_name || 'Företag')}</div>
      <div class="company-info">
        ${escapeHtml(businessConfig?.address || businessConfig?.service_area || '')}<br>
        ${escapeHtml(businessConfig?.contact_email || '')} | ${escapeHtml(businessConfig?.contact_phone || businessConfig?.phone_number || '')}<br>
        Org.nr: ${escapeHtml(businessConfig?.org_number || 'Ej angivet')}
      </div>
    </div>
    <div class="invoice-title">
      <h1>${title}</h1>
      <div class="invoice-number">#${escapeHtml(invoice.invoice_number)}</div>
      ${invoice.is_credit_note && invoice.credit_reason ? `<div style="font-size:12px;color:#dc2626;margin-top:4px;">Anledning: ${escapeHtml(invoice.credit_reason)}</div>` : ''}
    </div>
  </div>

  <div class="parties">
    <div class="party-section">
      <h3>Avsändare</h3>
      <p><strong>${escapeHtml(businessConfig?.business_name || '')}</strong></p>
      <p>${escapeHtml(businessConfig?.address || businessConfig?.service_area || '')}</p>
      <p>${escapeHtml(businessConfig?.contact_email || '')}</p>
      <p>${escapeHtml(businessConfig?.contact_phone || businessConfig?.phone_number || '')}</p>
    </div>
    <div class="party-section">
      <h3>Mottagare</h3>
      <p><strong>${escapeHtml(invoice.customer?.name || 'Kund')}</strong></p>
      <p>${escapeHtml(invoice.customer?.address_line || '')}</p>
      <p>${escapeHtml(invoice.customer?.email || '')}</p>
      <p>${escapeHtml(invoice.customer?.phone_number || '')}</p>
      ${personnummer ? `<p style="margin-top:4px;font-size:12px;color:#666;">Personnr: ${escapeHtml(personnummer)}</p>` : ''}
      ${fastighet ? `<p style="font-size:12px;color:#666;">Fastighet: ${escapeHtml(fastighet)}</p>` : ''}
    </div>
  </div>

  <div class="meta-box">
    <div class="meta-item"><label>Fakturanr</label><span>${escapeHtml(invoice.invoice_number)}</span></div>
    <div class="meta-item"><label>Fakturadatum</label><span>${new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}</span></div>
    <div class="meta-item"><label>Förfallodatum</label><span>${new Date(invoice.due_date).toLocaleDateString('sv-SE')}</span></div>
    <div class="meta-item"><label>OCR-nummer</label><span style="font-family:monospace;">${ocrNumber}</span></div>
    ${invoice.our_reference ? `<div class="meta-item"><label>Vår referens</label><span>${escapeHtml(invoice.our_reference)}</span></div>` : ''}
    ${invoice.your_reference ? `<div class="meta-item"><label>Er referens</label><span>${escapeHtml(invoice.your_reference)}</span></div>` : ''}
  </div>

  ${hasRotRut ? `
  <div class="rot-rut-banner">
    <strong>${rotRutLabel}-avdrag tillämpas.</strong>
    Avdraget på ${formatSEK(invoice.rot_rut_deduction)} begärs av utföraren hos Skatteverket.
    Du betalar ${formatSEK(invoice.customer_pays)} till utföraren.
    ${personnummer ? `<br>Personnummer: ${escapeHtml(personnummer)}` : ''}
    ${fastighet ? ` | Fastighet: ${escapeHtml(fastighet)}` : ''}
  </div>
  ` : ''}

  <table class="items-table">
    <thead>
      <tr>
        <th>Beskrivning</th>
        <th style="text-align:right;">Antal</th>
        <th style="text-align:right;">Enhet</th>
        <th style="text-align:right;">à-pris</th>
        <th style="text-align:right;">Summa</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Delsumma</span><span>${formatSEK(invoice.subtotal)}</span></div>
      ${invoice.discount_amount ? `<div class="totals-row deduction"><span>Rabatt</span><span>-${formatSEK(invoice.discount_amount)}</span></div>` : ''}
      <div class="totals-row"><span>Moms (${invoice.vat_rate}%)</span><span>${formatSEK(invoice.vat_amount)}</span></div>
      <div class="totals-row total"><span>Totalt</span><span>${formatSEK(invoice.total)}</span></div>
      ${hasRotRut ? `
        <div class="totals-row deduction"><span>${rotRutLabel}-avdrag</span><span>-${formatSEK(invoice.rot_rut_deduction)}</span></div>
        <div class="totals-row customer-pays"><span>Att betala</span><span>${formatSEK(invoice.customer_pays)}</span></div>
      ` : ''}
    </div>
  </div>

  <div class="payment-box">
    <h3>Betalningsinformation</h3>
    <div class="payment-grid">
      ${paymentMethods.map(pm => `
        <div class="payment-item"><label>${pm.label}</label><span>${escapeHtml(pm.value)}</span></div>
      `).join('')}
      <div class="payment-item"><label>Att betala</label><span>${formatSEK(hasRotRut ? invoice.customer_pays : invoice.total)}</span></div>
      <div class="payment-item"><label>OCR-nummer</label><span style="font-family:monospace;">${ocrNumber}</span></div>
    </div>
  </div>

  <div class="footer">
    <p>${[
      escapeHtml(businessConfig?.business_name || ''),
      `Org.nr: ${escapeHtml(businessConfig?.org_number || '')}`,
      escapeHtml(businessConfig?.contact_email || ''),
      businessConfig?.f_skatt_registered ? 'Godkänd för F-skatt' : '',
    ].filter(Boolean).join(' | ')}</p>
    ${(businessConfig?.penalty_interest || businessConfig?.late_fee_percent) ? `<p>Vid försenad betalning debiteras dröjsmålsränta om ${businessConfig?.penalty_interest || businessConfig?.late_fee_percent}%.</p>` : ''}
    ${businessConfig?.invoice_footer_text ? `<p>${escapeHtml(businessConfig.invoice_footer_text)}</p>` : '<p>Tack för att du anlitar oss!</p>'}
  </div>

  <div class="no-print" style="text-align:center;margin-top:30px;">
    <button onclick="window.print()" style="background:${accentColor};color:white;border:none;padding:12px 32px;border-radius:8px;font-size:16px;cursor:pointer;">Skriv ut / Spara som PDF</button>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })

  } catch (error: any) {
    console.error('Generate invoice PDF error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
