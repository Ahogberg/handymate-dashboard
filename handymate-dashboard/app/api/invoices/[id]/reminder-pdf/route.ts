import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'

/**
 * GET - Generate reminder PDF (HTML preview) for an overdue invoice
 * Shows original amount, reminder fee, penalty interest, and new total
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

    // Get business config
    const { data: config } = await supabase
      .from('business_config')
      .select('business_name, display_name, org_number, contact_email, contact_phone, phone_number, address, service_area, bankgiro, plusgiro, swish_number, f_skatt_registered, penalty_interest, late_fee_percent, reminder_fee, accent_color, invoice_footer_text')
      .eq('business_id', business.business_id)
      .single()

    // Get reminder history
    const { data: reminders } = await supabase
      .from('invoice_reminders')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('reminder_number', { ascending: true })

    const businessName = config?.display_name || config?.business_name || 'Företag'
    const penaltyInterest = config?.penalty_interest || config?.late_fee_percent || 8
    const reminderFee = config?.reminder_fee || 60
    const accentColor = config?.accent_color || '#0F766E'
    const currentCount = invoice.reminder_count || 0

    // Calculate
    const dueDate = new Date(invoice.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))

    const amountToPay = invoice.customer_pays || invoice.total || 0
    const penaltyInterestAmount = Math.round(amountToPay * (penaltyInterest / 100) * (daysOverdue / 365) * 100) / 100
    const feeAmount = currentCount > 0 ? reminderFee : 0
    const totalWithFees = amountToPay + feeAmount + penaltyInterestAmount

    const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
    const newDueDate = new Date()
    newDueDate.setDate(newDueDate.getDate() + 10)

    const escapeHtml = (str: string): string => {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }

    const formatSEK = (amount: number | null | undefined): string => {
      if (amount == null) return '0 kr'
      return amount.toLocaleString('sv-SE') + ' kr'
    }

    // Build payment methods
    const payMethods: string[] = []
    if (config?.bankgiro) payMethods.push(`<div><span class="label">Bankgiro</span><span class="value">${escapeHtml(config.bankgiro)}</span></div>`)
    if (config?.plusgiro) payMethods.push(`<div><span class="label">Plusgiro</span><span class="value">${escapeHtml(config.plusgiro)}</span></div>`)
    if (config?.swish_number) payMethods.push(`<div><span class="label">Swish</span><span class="value">${escapeHtml(config.swish_number)}</span></div>`)

    // Reminder history rows
    const reminderRows = (reminders || []).map((r: any) => `
      <tr>
        <td>Påminnelse ${r.reminder_number}</td>
        <td>${new Date(r.sent_at).toLocaleDateString('sv-SE')}</td>
        <td style="text-align:right">${formatSEK(r.fee_amount)}</td>
        <td style="text-align:right">${formatSEK(r.penalty_interest_amount)}</td>
        <td style="text-align:right">${formatSEK(r.total_with_fees)}</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Betalningspåminnelse - ${escapeHtml(invoice.invoice_number || '')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; background: #f8f9fa; padding: 40px 20px; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: ${accentColor}; color: white; padding: 32px 40px; }
    .header h1 { font-size: 28px; margin-bottom: 4px; }
    .header .subtitle { opacity: 0.85; font-size: 14px; }
    .content { padding: 32px 40px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .party h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
    .party p { font-size: 13px; color: #333; line-height: 1.6; }
    .party .name { font-weight: 600; font-size: 14px; color: #1a1a1a; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
    .alert-box h3 { color: #dc2626; font-size: 14px; margin-bottom: 4px; }
    .alert-box p { color: #991b1b; font-size: 13px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; background: #f8f5ff; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .meta-grid .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; display: block; }
    .meta-grid .value { font-size: 14px; color: #1a1a1a; font-weight: 500; margin-top: 4px; display: block; }
    .breakdown { margin-bottom: 24px; }
    .breakdown h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333; }
    .breakdown table { width: 100%; border-collapse: collapse; }
    .breakdown th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; padding: 8px 12px; border-bottom: 2px solid #eee; }
    .breakdown th:last-child { text-align: right; }
    .breakdown td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .total-row { background: #fef2f2; }
    .total-row td { font-weight: 700; font-size: 15px; color: #dc2626; padding: 14px 12px; }
    .history { margin-bottom: 24px; }
    .history h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333; }
    .history table { width: 100%; border-collapse: collapse; }
    .history th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; padding: 8px 12px; border-bottom: 2px solid #eee; }
    .history td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
    .payment-box { background: #1a1a1a; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px; color: white; }
    .payment-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 12px; }
    .payment-box .methods { display: flex; gap: 32px; flex-wrap: wrap; }
    .payment-box .methods > div { }
    .payment-box .methods .label { font-size: 10px; color: #999; display: block; }
    .payment-box .methods .value { font-size: 16px; color: ${accentColor}; font-weight: 600; margin-top: 2px; display: block; }
    .footer { padding: 20px 40px; border-top: 1px solid #eee; text-align: center; }
    .footer p { font-size: 11px; color: #999; line-height: 1.6; }
    @media (max-width: 600px) {
      .parties, .meta-grid { grid-template-columns: 1fr; }
      .payment-box .methods { flex-direction: column; gap: 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BETALNINGSPÅMINNELSE</h1>
      <div class="subtitle">Faktura #${escapeHtml(invoice.invoice_number || '')} | Påminnelse ${currentCount + 1}</div>
    </div>

    <div class="content">
      <div class="parties">
        <div class="party">
          <h3>Avsändare</h3>
          <p class="name">${escapeHtml(businessName)}</p>
          <p>${escapeHtml(config?.address || config?.service_area || '')}</p>
          <p>${escapeHtml(config?.contact_email || '')}</p>
        </div>
        <div class="party">
          <h3>Mottagare</h3>
          <p class="name">${escapeHtml(invoice.customer?.name || 'Kund')}</p>
          <p>${escapeHtml(invoice.customer?.address_line || '')}</p>
          <p>${escapeHtml(invoice.customer?.email || '')}</p>
        </div>
      </div>

      <div class="alert-box">
        <h3>Fakturan är ${daysOverdue} dagar förfallen</h3>
        <p>Originalfakturan förföll ${dueDate.toLocaleDateString('sv-SE')}. Vänligen betala snarast för att undvika ytterligare avgifter.</p>
      </div>

      <div class="meta-grid">
        <div>
          <span class="label">Fakturanummer</span>
          <span class="value">#${escapeHtml(invoice.invoice_number || '')}</span>
        </div>
        <div>
          <span class="label">Förfallodatum</span>
          <span class="value">${dueDate.toLocaleDateString('sv-SE')}</span>
        </div>
        <div>
          <span class="label">OCR-nummer</span>
          <span class="value">${escapeHtml(ocrNumber)}</span>
        </div>
        <div>
          <span class="label">Ny betaldag</span>
          <span class="value">${newDueDate.toLocaleDateString('sv-SE')}</span>
        </div>
      </div>

      <div class="breakdown">
        <h3>Beloppsspecifikation</h3>
        <table>
          <thead>
            <tr>
              <th>Beskrivning</th>
              <th style="text-align:right">Belopp</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Originalbelopp${invoice.rot_rut_type ? ` (efter ${invoice.rot_rut_type.toUpperCase()}-avdrag)` : ''}</td>
              <td style="text-align:right">${formatSEK(amountToPay)}</td>
            </tr>
            ${feeAmount > 0 ? `
            <tr>
              <td>Påminnelseavgift</td>
              <td style="text-align:right">${formatSEK(feeAmount)}</td>
            </tr>` : ''}
            <tr>
              <td>Dröjsmålsränta (${penaltyInterest}%, ${daysOverdue} dagar)</td>
              <td style="text-align:right">${formatSEK(penaltyInterestAmount)}</td>
            </tr>
            <tr class="total-row">
              <td>Att betala</td>
              <td style="text-align:right">${formatSEK(totalWithFees)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${reminderRows ? `
      <div class="history">
        <h3>Påminnelsehistorik</h3>
        <table>
          <thead>
            <tr>
              <th>Påminnelse</th>
              <th>Datum</th>
              <th style="text-align:right">Avgift</th>
              <th style="text-align:right">Ränta</th>
              <th style="text-align:right">Totalt</th>
            </tr>
          </thead>
          <tbody>
            ${reminderRows}
          </tbody>
        </table>
      </div>` : ''}

      <div class="payment-box">
        <h3>Betalningsinformation</h3>
        <div class="methods">
          ${payMethods.join('\n          ')}
          <div>
            <span class="label">OCR-nummer</span>
            <span class="value">${escapeHtml(ocrNumber)}</span>
          </div>
          <div>
            <span class="label">Att betala</span>
            <span class="value">${formatSEK(totalWithFees)}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>
        ${escapeHtml(businessName)} | Org.nr: ${escapeHtml(config?.org_number || '')}
        ${config?.f_skatt_registered ? ' | Godkänd för F-skatt' : ''}
      </p>
      <p>Dröjsmålsränta: ${penaltyInterest}% per år vid försenad betalning</p>
      <p>${escapeHtml(config?.invoice_footer_text || 'Tack för att du anlitar oss!')}</p>
    </div>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: any) {
    console.error('Reminder PDF error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
