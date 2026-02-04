import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { quoteId } = await request.json()

    // Hämta offert med kundinfo och företagsinfo
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

    // Använd en HTML-to-PDF tjänst eller returnera HTML
    // För nu returnerar vi HTML som kan skrivas ut som PDF
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="Offert-${quoteId}.html"`
      }
    })

  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateQuoteHTML(quote: any, business: any): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const laborItems = quote.items.filter((i: any) => i.type === 'labor')
  const materialItems = quote.items.filter((i: any) => i.type === 'material')
  const serviceItems = quote.items.filter((i: any) => i.type === 'service')

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offert ${quote.quote_id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      line-height: 1.5;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #8b5cf6;
    }
    .logo { 
      font-size: 24px; 
      font-weight: bold; 
      color: #8b5cf6;
    }
    .quote-info { text-align: right; }
    .quote-number { font-size: 20px; font-weight: bold; }
    .quote-date { color: #666; font-size: 14px; }
    
    .parties { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 40px;
      margin-bottom: 40px;
    }
    .party h3 { 
      font-size: 12px; 
      text-transform: uppercase; 
      color: #666;
      margin-bottom: 8px;
    }
    .party-name { font-weight: bold; font-size: 16px; }
    .party-details { font-size: 14px; color: #444; }
    
    .description {
      background: #f8f8f8;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .description h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 30px;
    }
    th { 
      text-align: left; 
      padding: 12px 8px;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      border-bottom: 2px solid #e5e5e5;
    }
    td { 
      padding: 12px 8px;
      border-bottom: 1px solid #e5e5e5;
      font-size: 14px;
    }
    .section-header {
      background: #f0f0f0;
      font-weight: 600;
      color: #8b5cf6;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    
    .summary {
      margin-left: auto;
      width: 300px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .summary-row.total {
      border-top: 2px solid #1a1a1a;
      font-size: 18px;
      font-weight: bold;
      margin-top: 8px;
      padding-top: 12px;
    }
    
    .rot-box {
      background: linear-gradient(135deg, #d1fae5, #a7f3d0);
      padding: 20px;
      border-radius: 8px;
      margin-top: 20px;
    }
    .rot-box h4 {
      color: #047857;
      margin-bottom: 10px;
    }
    .rot-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: #065f46;
    }
    .rot-total {
      font-size: 20px;
      font-weight: bold;
      color: #047857;
      border-top: 1px solid #065f46;
      margin-top: 10px;
      padding-top: 10px;
    }
    
    .terms {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e5;
    }
    .terms h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .terms ul {
      list-style: none;
      font-size: 13px;
      color: #666;
    }
    .terms li {
      padding: 4px 0;
      padding-left: 16px;
      position: relative;
    }
    .terms li:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #8b5cf6;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #8b5cf6;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    
    .signature-section {
      margin-top: 60px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
    }
    .signature-box {
      border-top: 1px solid #1a1a1a;
      padding-top: 8px;
    }
    .signature-label {
      font-size: 12px;
      color: #666;
    }
    
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">${business?.business_name || 'Företag'}</div>
      <div style="font-size: 13px; color: #666; margin-top: 4px;">
        ${business?.phone_number || ''}<br>
        ${business?.contact_email || ''}
      </div>
    </div>
    <div class="quote-info">
      <div class="quote-number">OFFERT</div>
      <div class="quote-date">
        Datum: ${formatDate(quote.created_at)}<br>
        Giltig till: ${formatDate(quote.valid_until)}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Från</h3>
      <div class="party-name">${business?.business_name || ''}</div>
      <div class="party-details">
        ${business?.service_area || ''}<br>
        ${business?.phone_number || ''}<br>
        ${business?.contact_email || ''}
      </div>
    </div>
    <div class="party">
      <h3>Till</h3>
      <div class="party-name">${quote.customer?.name || ''}</div>
      <div class="party-details">
        ${quote.customer?.address_line || ''}<br>
        ${quote.customer?.phone_number || ''}<br>
        ${quote.customer?.email || ''}
      </div>
    </div>
  </div>

  ${quote.description ? `
  <div class="description">
    <h3>${quote.title || 'Beskrivning'}</h3>
    <p>${quote.description}</p>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>Beskrivning</th>
        <th class="text-center">Antal</th>
        <th class="text-right">À-pris</th>
        <th class="text-right">Summa</th>
      </tr>
    </thead>
    <tbody>
      ${laborItems.length > 0 ? `
        <tr class="section-header">
          <td colspan="4">Arbete</td>
        </tr>
        ${laborItems.map((item: any) => `
          <tr>
            <td>${item.name}</td>
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
            <td>${item.name}</td>
            <td class="text-center">${item.quantity} st</td>
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
            <td>${item.name}</td>
            <td class="text-center">1 st</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-right">${formatCurrency(item.total)}</td>
          </tr>
        `).join('')}
      ` : ''}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span>Summa arbete</span>
      <span>${formatCurrency(quote.labor_total)}</span>
    </div>
    <div class="summary-row">
      <span>Summa material</span>
      <span>${formatCurrency(quote.material_total)}</span>
    </div>
    ${quote.discount_amount > 0 ? `
    <div class="summary-row" style="color: #059669;">
      <span>Rabatt (${quote.discount_percent}%)</span>
      <span>-${formatCurrency(quote.discount_amount)}</span>
    </div>
    ` : ''}
    <div class="summary-row">
      <span>Moms (${quote.vat_rate}%)</span>
      <span>${formatCurrency(quote.vat_amount)}</span>
    </div>
    <div class="summary-row total">
      <span>Totalt</span>
      <span>${formatCurrency(quote.total)}</span>
    </div>
    
    ${quote.rot_rut_type ? `
    <div class="rot-box">
      <h4>💰 ${quote.rot_rut_type.toUpperCase()}-avdrag</h4>
      <div class="rot-row">
        <span>Arbetskostnad</span>
        <span>${formatCurrency(quote.rot_rut_eligible)}</span>
      </div>
      <div class="rot-row">
        <span>Avdrag (${quote.rot_rut_type === 'rot' ? '30' : '50'}%)</span>
        <span>-${formatCurrency(quote.rot_rut_deduction)}</span>
      </div>
      <div class="rot-row rot-total">
        <span>Du betalar</span>
        <span>${formatCurrency(quote.customer_pays)}</span>
      </div>
    </div>
    ` : ''}
  </div>

  <div class="terms">
    <h3>Villkor</h3>
    <ul>
      <li>Offerten är giltig till ${formatDate(quote.valid_until)}</li>
      <li>Betalningsvillkor: 30 dagar netto</li>
      <li>Vi hjälper dig att ansöka om eventuellt ROT/RUT-avdrag</li>
      <li>2 års garanti på utfört arbete</li>
    </ul>
  </div>

  <div class="signature-section">
    <div>
      <div class="signature-box">
        <div class="signature-label">Kundens underskrift</div>
      </div>
      <div style="margin-top: 20px;">
        <div class="signature-box">
          <div class="signature-label">Datum</div>
        </div>
      </div>
    </div>
    <div>
      <div class="signature-box">
        <div class="signature-label">Namnförtydligande</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <strong>${business?.business_name || ''}</strong><br>
    ${business?.phone_number || ''} | ${business?.contact_email || ''}
  </div>
</body>
</html>
  `
}
