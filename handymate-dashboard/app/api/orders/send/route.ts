import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

interface OrderItem {
  name: string
  sku?: string
  quantity: number
  unit: string
  unit_price: number
  total: number
}

/**
 * POST - Skicka beställning till leverantör via email
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const resend = getResend()
    const body = await request.json()
    const { order_id } = body

    if (!order_id) {
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })
    }

    // Hämta beställning med leverantör och företagsinfo
    const { data: order, error: orderError } = await supabase
      .from('material_order')
      .select(`
        *,
        supplier:supplier_id (
          supplier_id,
          name,
          customer_number,
          contact_email,
          contact_phone
        )
      `)
      .eq('order_id', order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const { data: business } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', order.business_id)
      .single()

    const items = (order.items || []) as OrderItem[]

    if (!order.supplier?.contact_email) {
      return NextResponse.json({ error: 'Supplier has no email address' }, { status: 400 })
    }

    // Skicka beställning via email
    try {
      await resend.emails.send({
        from: `${business?.business_name || 'Handymate'} <bestallning@${process.env.RESEND_DOMAIN || 'handymate.se'}>`,
        to: order.supplier.contact_email,
        subject: `Materialbeställning från ${business?.business_name || 'oss'}${order.supplier.customer_number ? ` - Kundnr: ${order.supplier.customer_number}` : ''}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #7c3aed, #a855f7); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .content { padding: 32px; }
    .info-box { background: #f8f5ff; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .info-label { color: #666; }
    .info-value { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th { background: #7c3aed; color: white; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    .total-row td { font-weight: bold; background: #f8f5ff; }
    .footer { padding: 24px; text-align: center; font-size: 12px; color: #666; background: #f5f5f5; }
    .notes { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Materialbeställning</h1>
    </div>
    <div class="content">
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Från:</span>
          <span class="info-value">${business?.business_name || 'Okänt företag'}</span>
        </div>
        ${order.supplier.customer_number ? `
        <div class="info-row">
          <span class="info-label">Kundnummer:</span>
          <span class="info-value">${order.supplier.customer_number}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">Kontakt:</span>
          <span class="info-value">${business?.contact_name || ''} - ${business?.contact_phone || ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${business?.contact_email || ''}</span>
        </div>
      </div>

      ${order.delivery_address ? `
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Leveransadress:</span>
          <span class="info-value">${order.delivery_address}</span>
        </div>
      </div>
      ` : ''}

      <table>
        <thead>
          <tr>
            <th>Art.nr</th>
            <th>Produkt</th>
            <th>Antal</th>
            <th>Enhet</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: OrderItem) => `
            <tr>
              <td>${item.sku || '-'}</td>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>${item.unit || 'st'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${order.notes ? `
      <div class="notes">
        <strong>Meddelande:</strong><br>
        ${order.notes}
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>Beställning skickad via Handymate</p>
      <p>${business?.business_name || ''} | ${business?.contact_email || ''} | ${business?.contact_phone || ''}</p>
    </div>
  </div>
</body>
</html>
        `
      })

      // Uppdatera beställningsstatus
      await supabase
        .from('material_order')
        .update({
          status: 'ordered',
          ordered_at: new Date().toISOString()
        })
        .eq('order_id', order_id)

      return NextResponse.json({ success: true })

    } catch (emailError: any) {
      console.error('Email send error:', emailError)
      return NextResponse.json({ error: `Email failed: ${emailError.message}` }, { status: 500 })
    }

  } catch (error: any) {
    console.error('Send order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
