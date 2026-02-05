import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { quoteId } = await request.json()

    // Hämta offert med kundinfo
    const { data: quote } = await supabase
      .from('quotes')
      .select('*, customer(*)')
      .eq('quote_id', quoteId)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: business } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', quote.business_id)
      .single()

    // Generera HTML för PDF
    const html = generateQuoteHTML(quote, business)

    // Returnera HTML som kan skrivas ut som PDF i webbläsaren
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Offert-${quoteId}.html"`
      }
    })

  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET method för att öppna i ny flik
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const quoteId = request.nextUrl.searchParams.get('id')

  if (!quoteId) {
    return NextResponse.json({ error: 'Missing quote ID' }, { status: 400 })
  }

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, customer(*)')
    .eq('quote_id', quoteId)
    .single()

  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  }

  const { data: business } = await supabase
    .from('business_config')
    .select('*')
    .eq('business_id', quote.business_id)
    .single()

  const html = generateQuoteHTML(quote, business)

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    }
  })
}

function generateQuoteHTML(quote: any, business: any): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' kr'
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const items = quote.items || []
  const laborItems = items.filter((i: any) => i.type === 'labor')
  const materialItems = items.filter((i: any) => i.type === 'material')
  const serviceItems = items.filter((i: any) => i.type === 'service')

  const quoteNumber = quote.quote_id?.substring(0, 8).toUpperCase() || 'OFFERT'

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offert ${quoteNumber} - ${business?.business_name || 'Handymate'}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      color: #1a1a1a;
      line-height: 1.5;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      font-size: 14px;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #8b5cf6;
    }
    .company-info {
      max-width: 60%;
    }
    .logo {
      font-size: 28px;
      font-weight: 700;
      color: #8b5cf6;
      margin-bottom: 8px;
    }
    .company-details {
      font-size: 12px;
      color: #666;
      line-height: 1.6;
    }
    .quote-badge {
      text-align: right;
    }
    .quote-title {
      font-size: 32px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -1px;
    }
    .quote-number {
      font-size: 14px;
      color: #666;
      margin-top: 4px;
    }
    .quote-dates {
      font-size: 13px;
      color: #444;
      margin-top: 12px;
      text-align: right;
    }
    .quote-dates strong {
      color: #1a1a1a;
    }

    /* Parties */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 30px;
    }
    .party {
      padding: 20px;
      background: #f8f8f8;
      border-radius: 8px;
    }
    .party h3 {
      font-size: 11px;
      text-transform: uppercase;
      color: #8b5cf6;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    .party-name {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 6px;
    }
    .party-details {
      font-size: 13px;
      color: #444;
      line-height: 1.6;
    }

    /* Description */
    .description {
      background: linear-gradient(135deg, #f8f4ff, #fdf4ff);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 25px;
      border-left: 4px solid #8b5cf6;
    }
    .description h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #1a1a1a;
    }
    .description p {
      color: #444;
      font-size: 14px;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    th {
      text-align: left;
      padding: 12px 10px;
      font-size: 11px;
      text-transform: uppercase;
      color: #666;
      font-weight: 600;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #e5e5e5;
      background: #fafafa;
    }
    th:last-child { text-align: right; }
    td {
      padding: 12px 10px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
      vertical-align: top;
    }
    .section-header td {
      background: #f5f3ff;
      font-weight: 600;
      color: #6d28d9;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px;
    }
    .item-name {
      font-weight: 500;
    }
    .item-desc {
      font-size: 12px;
      color: #666;
      margin-top: 2px;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }

    /* Summary */
    .summary-section {
      display: flex;
      justify-content: flex-end;
    }
    .summary {
      width: 320px;
      background: #fafafa;
      padding: 20px;
      border-radius: 8px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 13px;
    }
    .summary-row.subtotal {
      border-bottom: 1px solid #e5e5e5;
      margin-bottom: 8px;
      padding-bottom: 12px;
    }
    .summary-row.total {
      border-top: 2px solid #1a1a1a;
      font-size: 18px;
      font-weight: 700;
      margin-top: 8px;
      padding-top: 12px;
    }
    .summary-row.discount {
      color: #059669;
    }

    /* ROT/RUT Box */
    .rot-box {
      background: linear-gradient(135deg, #d1fae5, #a7f3d0);
      padding: 20px;
      border-radius: 8px;
      margin-top: 15px;
      border: 1px solid #6ee7b7;
    }
    .rot-box h4 {
      color: #047857;
      margin-bottom: 12px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .rot-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: #065f46;
      padding: 4px 0;
    }
    .rot-total {
      font-size: 20px;
      font-weight: 700;
      color: #047857;
      border-top: 2px solid #059669;
      margin-top: 10px;
      padding-top: 12px;
    }

    /* Terms */
    .terms {
      margin-top: 30px;
      padding: 20px;
      background: #fafafa;
      border-radius: 8px;
    }
    .terms h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #1a1a1a;
    }
    .terms-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px 20px;
    }
    .term-item {
      font-size: 12px;
      color: #444;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .term-item:before {
      content: "✓";
      color: #8b5cf6;
      font-weight: 600;
    }

    /* Signature */
    .signature-section {
      margin-top: 50px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
    }
    .signature-group h4 {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 40px;
    }
    .signature-line {
      border-top: 1px solid #1a1a1a;
      padding-top: 8px;
      margin-bottom: 20px;
    }
    .signature-label {
      font-size: 11px;
      color: #666;
    }

    /* Footer */
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #8b5cf6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #666;
    }
    .footer-left {
      font-weight: 600;
      color: #8b5cf6;
    }
    .footer-right {
      text-align: right;
    }

    /* Print button (hidden in print) */
    .print-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #8b5cf6, #d946ef);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .print-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4);
    }

    @media print {
      body {
        padding: 0;
        font-size: 12px;
      }
      .print-button { display: none; }
      .parties { gap: 20px; }
      .signature-section { margin-top: 30px; }
    }
  </style>
</head>
<body>
  <button class="print-button" onclick="window.print()">
    Skriv ut / Spara PDF
  </button>

  <div class="header">
    <div class="company-info">
      <div class="logo">${business?.business_name || 'Företag'}</div>
      <div class="company-details">
        ${business?.address || business?.service_area || ''}<br>
        ${business?.phone_number || ''}<br>
        ${business?.contact_email || ''}
        ${business?.org_number ? `<br>Org.nr: ${business.org_number}` : ''}
      </div>
    </div>
    <div class="quote-badge">
      <div class="quote-title">OFFERT</div>
      <div class="quote-number">#${quoteNumber}</div>
      <div class="quote-dates">
        <div><strong>Datum:</strong> ${formatDate(quote.created_at)}</div>
        <div><strong>Giltig till:</strong> ${formatDate(quote.valid_until)}</div>
      </div>
    </div>
  </div>

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
        ${quote.customer?.address_line || ''}<br>
        Tel: ${quote.customer?.phone_number || ''}<br>
        ${quote.customer?.email || ''}
      </div>
    </div>
  </div>

  ${quote.description ? `
  <div class="description">
    <h3>${quote.title || 'Jobbeskrivning'}</h3>
    <p>${quote.description}</p>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th style="width: 45%">Beskrivning</th>
        <th class="text-center" style="width: 15%">Antal</th>
        <th class="text-right" style="width: 20%">À-pris</th>
        <th class="text-right" style="width: 20%">Summa</th>
      </tr>
    </thead>
    <tbody>
      ${laborItems.length > 0 ? `
        <tr class="section-header">
          <td colspan="4">Arbete</td>
        </tr>
        ${laborItems.map((item: any) => `
          <tr>
            <td>
              <div class="item-name">${item.name}</div>
              ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
            <td class="text-center">${item.quantity} ${item.unit === 'hour' ? 'tim' : 'st'}</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total)}</td>
          </tr>
        `).join('')}
      ` : ''}

      ${materialItems.length > 0 ? `
        <tr class="section-header">
          <td colspan="4">Material</td>
        </tr>
        ${materialItems.map((item: any) => `
          <tr>
            <td>
              <div class="item-name">${item.name}</div>
              ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
            <td class="text-center">${item.quantity} ${item.unit || 'st'}</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total)}</td>
          </tr>
        `).join('')}
      ` : ''}

      ${serviceItems.length > 0 ? `
        <tr class="section-header">
          <td colspan="4">Tjänster</td>
        </tr>
        ${serviceItems.map((item: any) => `
          <tr>
            <td>
              <div class="item-name">${item.name}</div>
              ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
            <td class="text-center">1 st</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total)}</td>
          </tr>
        `).join('')}
      ` : ''}
    </tbody>
  </table>

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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2">
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

  <div class="terms">
    <h3>Villkor</h3>
    <div class="terms-grid">
      <div class="term-item">Offerten är giltig till ${formatDate(quote.valid_until)}</div>
      <div class="term-item">Betalningsvillkor: 30 dagar netto</div>
      <div class="term-item">2 års garanti på utfört arbete</div>
      ${quote.rot_rut_type ? `<div class="term-item">Vi hjälper dig ansöka om ${quote.rot_rut_type.toUpperCase()}-avdrag</div>` : ''}
      <div class="term-item">Priset inkluderar moms</div>
      <div class="term-item">Eventuella tilläggsarbeten debiteras separat</div>
    </div>
  </div>

  <div class="signature-section">
    <div class="signature-group">
      <h4>Godkännande av kund</h4>
      <div class="signature-line">
        <div class="signature-label">Underskrift</div>
      </div>
      <div class="signature-line">
        <div class="signature-label">Namnförtydligande</div>
      </div>
      <div class="signature-line">
        <div class="signature-label">Datum</div>
      </div>
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

  <div class="footer">
    <div class="footer-left">
      ${business?.business_name || 'Handymate'}
    </div>
    <div class="footer-right">
      ${business?.phone_number || ''} | ${business?.contact_email || ''}
      ${business?.org_number ? ` | Org.nr: ${business.org_number}` : ''}
    </div>
  </div>
</body>
</html>
  `
}
