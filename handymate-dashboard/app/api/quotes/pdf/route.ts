import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { quoteId } = await request.json()

    // Fetch quote + customer separately (no FK join)
    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Fetch customer
    if (quote.customer_id) {
      const { data: customer } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', quote.customer_id)
        .single()
      quote.customer = customer
    }

    // Fetch business config for accent color, logo, bank info
    const { data: config } = await supabase
      .from('business_config')
      .select('accent_color, logo_url, bankgiro, plusgiro, default_quote_terms')
      .eq('business_id', business.business_id)
      .single()

    const html = generateQuoteHTML(quote, business, config)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Offert-${quote.quote_number || quoteId}.html"`
      }
    })
  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const quoteId = request.nextUrl.searchParams.get('id')

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quote ID' }, { status: 400 })
    }

    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (quote.customer_id) {
      const { data: customer } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', quote.customer_id)
        .single()
      quote.customer = customer
    }

    const { data: config } = await supabase
      .from('business_config')
      .select('accent_color, logo_url, bankgiro, plusgiro, default_quote_terms')
      .eq('business_id', business.business_id)
      .single()

    const html = generateQuoteHTML(quote, business, config)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function getUnitLabel(unit: string): string {
  switch (unit) {
    case 'hour': return 'tim'
    case 'piece': return 'st'
    case 'm2': return 'm²'
    case 'm': return 'm'
    case 'lm': return 'lm'
    case 'pauschal': return 'pauschal'
    default: return unit || 'st'
  }
}

function generateQuoteHTML(quote: any, business: any, config: any): string {
  const accent = config?.accent_color || '#0891b2'
  const accentLight = accent + '18' // ~10% opacity hex

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' kr'
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  }

  const items = quote.items || []
  const laborItems = items.filter((i: any) => i.type === 'labor')
  const materialItems = items.filter((i: any) => i.type === 'material')
  const serviceItems = items.filter((i: any) => i.type === 'service')
  const quoteNumber = quote.quote_number || quote.quote_id?.substring(0, 8).toUpperCase()
  const terms = quote.terms || {}
  const images = quote.images || []

  const logoHtml = config?.logo_url
    ? `<img src="${config.logo_url}" alt="${business?.business_name}" style="max-height: 60px; max-width: 200px; object-fit: contain;" />`
    : `<div class="logo-text">${business?.business_name || 'Företag'}</div>`

  // Row number counter
  let rowNum = 0

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offert ${quoteNumber} - ${business?.business_name || 'Handymate'}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      color: #1a1a1a;
      line-height: 1.5;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      font-size: 13px;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
      padding-bottom: 18px;
      border-bottom: 3px solid ${accent};
    }
    .company-info { max-width: 55%; }
    .logo-text {
      font-size: 26px;
      font-weight: 700;
      color: ${accent};
      margin-bottom: 6px;
    }
    .company-details {
      font-size: 11px;
      color: #666;
      line-height: 1.6;
    }
    .quote-badge { text-align: right; }
    .quote-title {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -0.5px;
    }
    .quote-number {
      font-size: 13px;
      color: ${accent};
      font-weight: 600;
      margin-top: 2px;
    }
    .quote-dates {
      font-size: 12px;
      color: #555;
      margin-top: 10px;
      text-align: right;
      line-height: 1.7;
    }
    .quote-dates strong { color: #1a1a1a; }

    /* Parties */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }
    .party {
      padding: 16px 18px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .party h3 {
      font-size: 10px;
      text-transform: uppercase;
      color: ${accent};
      font-weight: 600;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
    }
    .party-name {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 4px;
    }
    .party-details {
      font-size: 12px;
      color: #555;
      line-height: 1.6;
    }

    /* Description */
    .description {
      background: #f9fafb;
      padding: 16px 18px;
      border-radius: 8px;
      margin-bottom: 22px;
      border-left: 4px solid ${accent};
    }
    .description h3 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 6px;
      color: #1a1a1a;
    }
    .description p {
      color: #555;
      font-size: 13px;
      white-space: pre-wrap;
    }

    /* Images */
    .images {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 22px;
    }
    .images img {
      width: 100%;
      height: 150px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 22px;
    }
    th {
      text-align: left;
      padding: 10px 8px;
      font-size: 10px;
      text-transform: uppercase;
      color: #666;
      font-weight: 600;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #e5e7eb;
      background: #f9fafb;
    }
    th:last-child { text-align: right; }
    th.text-center { text-align: center; }
    th.text-right { text-align: right; }
    td {
      padding: 10px 8px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 12px;
      vertical-align: top;
    }
    .section-header td {
      background: ${accentLight};
      font-weight: 600;
      color: ${accent};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px;
    }
    .row-num {
      color: #999;
      font-size: 11px;
      width: 30px;
    }
    .item-name { font-weight: 500; }
    .item-desc {
      font-size: 11px;
      color: #888;
      margin-top: 1px;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }

    /* Summary */
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 24px;
    }
    .summary {
      width: 320px;
      background: #f9fafb;
      padding: 18px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 12px;
    }
    .summary-row span:first-child { color: #666; }
    .summary-row span:last-child { font-weight: 500; }
    .summary-row.subtotal {
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 6px;
      padding-bottom: 10px;
    }
    .summary-row.total {
      border-top: 2px solid #1a1a1a;
      font-size: 16px;
      font-weight: 700;
      margin-top: 6px;
      padding-top: 10px;
    }
    .summary-row.total span { color: #1a1a1a; }
    .summary-row.discount span { color: #059669; }

    /* ROT/RUT */
    .rot-box {
      background: linear-gradient(135deg, #d1fae5, #a7f3d0);
      padding: 16px;
      border-radius: 8px;
      margin-top: 12px;
      border: 1px solid #6ee7b7;
    }
    .rot-box h4 {
      color: #047857;
      margin-bottom: 10px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rot-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #065f46;
      padding: 3px 0;
    }
    .rot-total {
      font-size: 18px;
      font-weight: 700;
      color: #047857;
      border-top: 2px solid #059669;
      margin-top: 8px;
      padding-top: 10px;
    }

    /* Terms */
    .terms {
      padding: 16px 18px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      margin-bottom: 24px;
    }
    .terms h3 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 10px;
      color: #1a1a1a;
    }
    .terms-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px 16px;
    }
    .term-item {
      font-size: 11px;
      color: #555;
      display: flex;
      align-items: flex-start;
      gap: 6px;
      line-height: 1.4;
    }
    .term-check {
      color: ${accent};
      font-weight: 700;
      flex-shrink: 0;
    }
    .terms-freetext {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #555;
      white-space: pre-wrap;
    }

    /* Signature */
    .signature-section {
      margin-top: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 50px;
      page-break-inside: avoid;
    }
    .signature-group h4 {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 35px;
    }
    .signature-line {
      border-top: 1px solid #1a1a1a;
      padding-top: 6px;
      margin-bottom: 18px;
    }
    .signature-label { font-size: 10px; color: #888; }
    .signed-img {
      max-height: 50px;
      margin-bottom: 8px;
    }
    .signed-badge {
      display: inline-block;
      background: #d1fae5;
      color: #047857;
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }

    /* Footer */
    .footer {
      margin-top: 30px;
      padding-top: 16px;
      border-top: 2px solid ${accent};
      font-size: 10px;
      color: #888;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }
    .footer-section { line-height: 1.6; }
    .footer-section:last-child { text-align: right; }
    .footer-section strong { color: #555; }
    .footer-brand {
      font-weight: 700;
      color: ${accent};
      font-size: 11px;
    }

    /* Print */
    .print-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #fff;
      border-top: 1px solid #e5e7eb;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 100;
    }
    .print-btn {
      background: ${accent};
      color: #fff;
      border: none;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { opacity: 0.9; }
    .print-btn.secondary {
      background: #f3f4f6;
      color: #374151;
    }
    .print-btn.secondary:hover { background: #e5e7eb; }

    @media print {
      body { padding: 0; font-size: 11px; }
      .print-bar { display: none; }
      .parties { gap: 16px; }
      .signature-section { margin-top: 24px; gap: 30px; }
      .footer { margin-top: 20px; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn secondary" onclick="window.close()">Stäng</button>
    <button class="print-btn" onclick="window.print()">Skriv ut / Spara som PDF</button>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="company-info">
      ${logoHtml}
      <div class="company-details">
        ${business?.contact_name ? `${business.contact_name}<br>` : ''}
        ${business?.address || business?.service_area || ''}<br>
        ${business?.phone_number || ''}<br>
        ${business?.contact_email || ''}
        ${business?.org_number ? `<br>Org.nr: ${business.org_number}` : ''}
      </div>
    </div>
    <div class="quote-badge">
      <div class="quote-title">OFFERT</div>
      <div class="quote-number">${quoteNumber}</div>
      <div class="quote-dates">
        <div><strong>Datum:</strong> ${formatDate(quote.created_at)}</div>
        <div><strong>Giltig till:</strong> ${formatDate(quote.valid_until)}</div>
      </div>
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party">
      <h3>Avsändare</h3>
      <div class="party-name">${business?.business_name || ''}</div>
      <div class="party-details">
        ${business?.address || business?.service_area || ''}<br>
        Tel: ${business?.phone_number || ''}<br>
        ${business?.contact_email || ''}
      </div>
    </div>
    <div class="party">
      <h3>Mottagare</h3>
      <div class="party-name">${quote.customer?.name || 'Kund'}</div>
      <div class="party-details">
        ${quote.customer?.address_line ? `${quote.customer.address_line}<br>` : ''}
        ${quote.customer?.phone_number ? `Tel: ${quote.customer.phone_number}<br>` : ''}
        ${quote.customer?.email || ''}
        ${quote.personnummer ? `<br>Personnr: ${quote.personnummer}` : ''}
        ${quote.fastighetsbeteckning ? `<br>Fastighet: ${quote.fastighetsbeteckning}` : ''}
      </div>
    </div>
  </div>

  <!-- Description -->
  ${quote.description ? `
  <div class="description">
    <h3>${quote.title || 'Projektbeskrivning'}</h3>
    <p>${quote.description}</p>
  </div>
  ` : (quote.title ? `
  <div class="description">
    <h3>${quote.title}</h3>
  </div>
  ` : '')}

  <!-- Project images -->
  ${images.length > 0 ? `
  <div class="images">
    ${images.slice(0, 3).map((img: string) => `<img src="${img}" alt="Projektbild" />`).join('')}
  </div>
  ` : ''}

  <!-- Items Table -->
  <table>
    <thead>
      <tr>
        <th style="width: 5%">#</th>
        <th style="width: 35%">Post</th>
        <th class="text-center" style="width: 10%">Antal</th>
        <th class="text-center" style="width: 10%">Enhet</th>
        <th class="text-right" style="width: 18%">À-pris</th>
        <th class="text-right" style="width: 22%">Summa</th>
      </tr>
    </thead>
    <tbody>
      ${laborItems.length > 0 ? `
        <tr class="section-header">
          <td colspan="6">Arbete</td>
        </tr>
        ${laborItems.map((item: any) => {
          rowNum++
          return `
          <tr>
            <td class="row-num">${rowNum}</td>
            <td>
              <div class="item-name">${item.name}</div>
              ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-center">${getUnitLabel(item.unit)}</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total)}</td>
          </tr>`
        }).join('')}
      ` : ''}

      ${materialItems.length > 0 ? `
        <tr class="section-header">
          <td colspan="6">Material</td>
        </tr>
        ${materialItems.map((item: any) => {
          rowNum++
          return `
          <tr>
            <td class="row-num">${rowNum}</td>
            <td>
              <div class="item-name">${item.name}</div>
              ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-center">${getUnitLabel(item.unit)}</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total)}</td>
          </tr>`
        }).join('')}
      ` : ''}

      ${serviceItems.length > 0 ? `
        <tr class="section-header">
          <td colspan="6">Tjänster</td>
        </tr>
        ${serviceItems.map((item: any) => {
          rowNum++
          return `
          <tr>
            <td class="row-num">${rowNum}</td>
            <td>
              <div class="item-name">${item.name}</div>
              ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
            <td class="text-center">${item.quantity || 1}</td>
            <td class="text-center">${getUnitLabel(item.unit)}</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total)}</td>
          </tr>`
        }).join('')}
      ` : ''}
    </tbody>
  </table>

  <!-- Summary -->
  <div class="summary-section">
    <div class="summary">
      ${laborItems.length > 0 ? `
      <div class="summary-row">
        <span>Summa arbete</span>
        <span>${formatCurrency(quote.labor_total || 0)}</span>
      </div>
      ` : ''}
      ${materialItems.length > 0 ? `
      <div class="summary-row">
        <span>Summa material</span>
        <span>${formatCurrency(quote.material_total || 0)}</span>
      </div>
      ` : ''}
      ${serviceItems.length > 0 ? `
      <div class="summary-row">
        <span>Summa tjänster</span>
        <span>${formatCurrency(serviceItems.reduce((s: number, i: any) => s + (i.total || 0), 0))}</span>
      </div>
      ` : ''}
      <div class="summary-row subtotal">
        <span>Netto</span>
        <span>${formatCurrency(quote.subtotal || (quote.total / 1.25))}</span>
      </div>
      ${quote.discount_amount > 0 ? `
      <div class="summary-row discount">
        <span>Rabatt (${quote.discount_percent || 0}%)</span>
        <span>-${formatCurrency(quote.discount_amount)}</span>
      </div>
      ` : ''}
      <div class="summary-row">
        <span>Moms (${quote.vat_rate || 25}%)</span>
        <span>${formatCurrency(quote.vat_amount || (quote.total * 0.2))}</span>
      </div>
      <div class="summary-row total">
        <span>Totalt inkl. moms</span>
        <span>${formatCurrency(quote.total || 0)}</span>
      </div>

      ${quote.rot_rut_type ? `
      <div class="rot-box">
        <h4>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          ${quote.rot_rut_type.toUpperCase()}-avdrag
        </h4>
        <div class="rot-row">
          <span>Arbetskostnad (berättigad)</span>
          <span>${formatCurrency(quote.rot_rut_eligible || 0)}</span>
        </div>
        <div class="rot-row">
          <span>Skatteavdrag (${quote.rot_rut_type === 'rot' ? '30' : '50'}%)</span>
          <span>-${formatCurrency(quote.rot_rut_deduction || 0)}</span>
        </div>
        <div class="rot-row rot-total">
          <span>Du betalar</span>
          <span>${formatCurrency(quote.customer_pays || quote.total)}</span>
        </div>
      </div>
      ` : ''}
    </div>
  </div>

  <!-- Terms -->
  <div class="terms">
    <h3>Villkor</h3>
    <div class="terms-grid">
      <div class="term-item"><span class="term-check">✓</span> Offerten giltig till ${formatDate(quote.valid_until)}</div>
      <div class="term-item"><span class="term-check">✓</span> Betalningsvillkor: ${terms.payment_terms || 30} dagar netto</div>
      <div class="term-item"><span class="term-check">✓</span> ${terms.warranty_years || 2} års garanti på utfört arbete</div>
      ${quote.rot_rut_type ? `<div class="term-item"><span class="term-check">✓</span> Vi hjälper dig ansöka om ${quote.rot_rut_type.toUpperCase()}-avdrag</div>` : ''}
      <div class="term-item"><span class="term-check">✓</span> Priset inkluderar moms</div>
      <div class="term-item"><span class="term-check">✓</span> Eventuella tilläggsarbeten debiteras separat</div>
      ${terms.start_date ? `<div class="term-item"><span class="term-check">✓</span> Beräknad start: ${terms.start_date}</div>` : ''}
      ${terms.end_date ? `<div class="term-item"><span class="term-check">✓</span> Beräknat klart: ${terms.end_date}</div>` : ''}
    </div>
    ${terms.free_text ? `<div class="terms-freetext">${terms.free_text}</div>` : ''}
  </div>

  <!-- Signature -->
  <div class="signature-section">
    <div class="signature-group">
      <h4>Godkännande av kund</h4>
      ${quote.signature_data ? `
        <div class="signed-badge">E-signerad</div>
        <img class="signed-img" src="${quote.signature_data}" alt="Kundens signatur" />
        <div class="signature-line">
          <div class="signature-label">${quote.signed_by_name || quote.customer?.name || ''} — ${quote.signed_at ? formatDate(quote.signed_at) : ''}</div>
        </div>
      ` : `
        <div class="signature-line">
          <div class="signature-label">Underskrift</div>
        </div>
        <div class="signature-line">
          <div class="signature-label">Namnförtydligande</div>
        </div>
        <div class="signature-line">
          <div class="signature-label">Datum</div>
        </div>
      `}
    </div>
    <div class="signature-group">
      <h4>Utförare</h4>
      <div class="signature-line">
        <div class="signature-label">Underskrift</div>
      </div>
      <div class="signature-line">
        <div class="signature-label">${business?.contact_name || business?.business_name || ''}</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-section">
      <div class="footer-brand">${business?.business_name || 'Handymate'}</div>
      ${business?.org_number ? `Org.nr: ${business.org_number}` : ''}
      ${business?.f_skatt_registered ? '<br>Godkänd för F-skatt' : ''}
    </div>
    <div class="footer-section">
      ${config?.bankgiro ? `<strong>Bankgiro:</strong> ${config.bankgiro}<br>` : ''}
      ${config?.plusgiro ? `<strong>Plusgiro:</strong> ${config.plusgiro}<br>` : ''}
      ${business?.phone_number ? `<strong>Tel:</strong> ${business.phone_number}` : ''}
    </div>
    <div class="footer-section">
      ${business?.contact_email || ''}<br>
      ${business?.address || business?.service_area || ''}
    </div>
  </div>
</body>
</html>
  `
}
