import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface InvoiceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: string
}

/**
 * GET - Generera faktura-PDF
 */
export async function GET(request: NextRequest) {
  try {
    const invoiceId = request.nextUrl.searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
    }

    // Hämta faktura med kundinfo
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .eq('invoice_id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Hämta företagsinfo
    const { data: business } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', invoice.business_id)
      .single()

    const items = (invoice.items || []) as InvoiceItem[]

    // Generera OCR-nummer (baserat på fakturanummer)
    const ocrNumber = invoice.invoice_number?.replace('-', '') + '0' // Enkel checksumma

    // Skapa HTML för PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Faktura ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #1a1a1a;
      line-height: 1.6;
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
      border-bottom: 2px solid #7c3aed;
    }

    .company-name {
      font-size: 28px;
      font-weight: 700;
      color: #7c3aed;
    }

    .company-info {
      font-size: 12px;
      color: #666;
      margin-top: 8px;
    }

    .invoice-title {
      text-align: right;
    }

    .invoice-title h1 {
      font-size: 36px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 8px;
    }

    .invoice-number {
      font-size: 16px;
      color: #7c3aed;
      font-weight: 600;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }

    .meta-section h3 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #999;
      margin-bottom: 8px;
    }

    .meta-section p {
      font-size: 14px;
      margin-bottom: 4px;
    }

    .dates-box {
      background: #f8f5ff;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    }

    .dates-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .date-item label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #999;
      display: block;
      margin-bottom: 4px;
    }

    .date-item span {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }

    .items-table th {
      text-align: left;
      padding: 12px 16px;
      background: #7c3aed;
      color: white;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .items-table th:first-child { border-radius: 8px 0 0 0; }
    .items-table th:last-child { border-radius: 0 8px 0 0; text-align: right; }

    .items-table td {
      padding: 14px 16px;
      border-bottom: 1px solid #eee;
      font-size: 14px;
    }

    .items-table td:last-child { text-align: right; }

    .items-table tr:nth-child(even) { background: #fafafa; }

    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }

    .totals-box {
      width: 300px;
      background: #f8f5ff;
      border-radius: 12px;
      padding: 20px;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }

    .totals-row.subtotal {
      border-bottom: 1px solid #e5e5e5;
      margin-bottom: 8px;
      padding-bottom: 12px;
    }

    .totals-row.total {
      font-size: 20px;
      font-weight: 700;
      color: #7c3aed;
      border-top: 2px solid #7c3aed;
      margin-top: 8px;
      padding-top: 12px;
    }

    .totals-row.deduction {
      color: #059669;
    }

    .totals-row.customer-pays {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      background: #d4edda;
      margin: 12px -20px -20px;
      padding: 16px 20px;
      border-radius: 0 0 12px 12px;
    }

    .payment-box {
      background: #1a1a1a;
      color: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 30px;
    }

    .payment-box h3 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #999;
      margin-bottom: 16px;
    }

    .payment-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .payment-item label {
      font-size: 11px;
      color: #999;
      display: block;
      margin-bottom: 4px;
    }

    .payment-item span {
      font-size: 18px;
      font-weight: 600;
      color: #7c3aed;
    }

    .footer {
      text-align: center;
      font-size: 11px;
      color: #999;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }

    ${invoice.rot_rut_type ? `
    .rot-rut-notice {
      background: #d4edda;
      border: 1px solid #059669;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #065f46;
    }
    ` : ''}

    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${business?.business_name || 'Företag'}</div>
      <div class="company-info">
        ${business?.address || ''}<br>
        ${business?.contact_email || ''} | ${business?.contact_phone || ''}<br>
        Org.nr: ${business?.org_number || 'Ej angivet'}
      </div>
    </div>
    <div class="invoice-title">
      <h1>FAKTURA</h1>
      <div class="invoice-number">#${invoice.invoice_number}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-section">
      <h3>Faktureras till</h3>
      <p><strong>${invoice.customer?.name || 'Kund'}</strong></p>
      <p>${invoice.customer?.address_line || ''}</p>
      <p>${invoice.customer?.email || ''}</p>
      <p>${invoice.customer?.phone_number || ''}</p>
    </div>
  </div>

  <div class="dates-box">
    <div class="dates-grid">
      <div class="date-item">
        <label>Fakturadatum</label>
        <span>${new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}</span>
      </div>
      <div class="date-item">
        <label>Förfallodatum</label>
        <span>${new Date(invoice.due_date).toLocaleDateString('sv-SE')}</span>
      </div>
      <div class="date-item">
        <label>OCR-nummer</label>
        <span>${ocrNumber}</span>
      </div>
    </div>
  </div>

  ${invoice.rot_rut_type ? `
  <div class="rot-rut-notice">
    <strong>${invoice.rot_rut_type.toUpperCase()}-avdrag tillämpas.</strong>
    Avdraget på ${invoice.rot_rut_deduction?.toLocaleString('sv-SE')} kr dras automatiskt via Skatteverket.
    Du betalar endast ${invoice.customer_pays?.toLocaleString('sv-SE')} kr.
  </div>
  ` : ''}

  <table class="items-table">
    <thead>
      <tr>
        <th>Beskrivning</th>
        <th>Antal</th>
        <th>Enhet</th>
        <th>á-pris</th>
        <th>Summa</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item: InvoiceItem) => `
        <tr>
          <td>${item.description}</td>
          <td>${item.quantity}</td>
          <td>${item.unit}</td>
          <td>${item.unit_price?.toLocaleString('sv-SE')} kr</td>
          <td>${item.total?.toLocaleString('sv-SE')} kr</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row subtotal">
        <span>Delsumma</span>
        <span>${invoice.subtotal?.toLocaleString('sv-SE')} kr</span>
      </div>
      <div class="totals-row">
        <span>Moms (${invoice.vat_rate}%)</span>
        <span>${invoice.vat_amount?.toLocaleString('sv-SE')} kr</span>
      </div>
      <div class="totals-row total">
        <span>Totalt</span>
        <span>${invoice.total?.toLocaleString('sv-SE')} kr</span>
      </div>
      ${invoice.rot_rut_type ? `
        <div class="totals-row deduction">
          <span>${invoice.rot_rut_type.toUpperCase()}-avdrag</span>
          <span>-${invoice.rot_rut_deduction?.toLocaleString('sv-SE')} kr</span>
        </div>
        <div class="totals-row customer-pays">
          <span>Att betala</span>
          <span>${invoice.customer_pays?.toLocaleString('sv-SE')} kr</span>
        </div>
      ` : ''}
    </div>
  </div>

  <div class="payment-box">
    <h3>Betalningsinformation</h3>
    <div class="payment-grid">
      <div class="payment-item">
        <label>Bankgiro</label>
        <span>${business?.bankgiro || 'Ej angivet'}</span>
      </div>
      <div class="payment-item">
        <label>Att betala</label>
        <span>${(invoice.rot_rut_type ? invoice.customer_pays : invoice.total)?.toLocaleString('sv-SE')} kr</span>
      </div>
      <div class="payment-item">
        <label>OCR-nummer</label>
        <span>${ocrNumber}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>${business?.business_name || ''} | Org.nr: ${business?.org_number || ''} | ${business?.contact_email || ''}</p>
    <p style="margin-top: 8px;">Tack för att du anlitar oss!</p>
  </div>

  <div class="no-print" style="text-align: center; margin-top: 30px;">
    <button onclick="window.print()" style="
      background: #7c3aed;
      color: white;
      border: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
    ">Skriv ut / Spara som PDF</button>
  </div>
</body>
</html>
`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })

  } catch (error: any) {
    console.error('Generate invoice PDF error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
