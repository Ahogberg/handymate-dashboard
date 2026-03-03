import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { Resend } from 'resend'
import { getAuthenticatedBusiness, checkSmsRateLimit, checkEmailRateLimit } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { generateOCR } from '@/lib/ocr'
import { generateInvoicePDF } from '@/lib/pdf-generator'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * POST - Skicka faktura via SMS och/eller email
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const resend = getResend()
    const body = await request.json()
    const { invoice_id, send_sms = false, send_email = true } = body

    if (!invoice_id) {
      return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 })
    }

    // Rate limit check
    if (send_sms) {
      const smsLimit = checkSmsRateLimit(business.business_id)
      if (!smsLimit.allowed) {
        return NextResponse.json({ error: smsLimit.error }, { status: 429 })
      }
    }
    if (send_email) {
      const emailLimit = checkEmailRateLimit(business.business_id)
      if (!emailLimit.allowed) {
        return NextResponse.json({ error: emailLimit.error }, { status: 429 })
      }
    }

    // Hämta faktura med kundinfo och verifiera ägarskap
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          name,
          phone_number,
          email
        )
      `)
      .eq('invoice_id', invoice_id)
      .eq('business_id', business.business_id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Hämta företagsconfig för PDF-generering
    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    const results: { sms?: boolean; email?: boolean; errors: string[] } = { errors: [] }

    // Skicka email
    if (send_email && invoice.customer?.email) {
      try {
        const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://handymate.se'}/api/invoices/pdf?invoiceId=${invoice_id}`
        const amountToPay = invoice.rot_rut_type ? invoice.customer_pays : invoice.total

        // Generera PDF-bilaga
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
            customer: invoice.customer,
          },
          {
            business_name: businessConfig?.business_name || business?.business_name,
            org_number: businessConfig?.org_number,
            contact_email: businessConfig?.contact_email,
            contact_phone: businessConfig?.contact_phone,
            address: businessConfig?.address,
            bankgiro: businessConfig?.bankgiro,
            f_skatt_registered: businessConfig?.f_skatt_registered,
          }
        )

        await resend.emails.send({
          from: `${business?.business_name || 'Handymate'} <faktura@${process.env.RESEND_DOMAIN || 'handymate.se'}>`,
          to: invoice.customer.email,
          subject: `Faktura ${invoice.invoice_number} från ${business?.business_name || 'oss'}`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #7c3aed, #a855f7); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 28px; }
    .content { padding: 32px; }
    .invoice-box { background: #f8f5ff; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .invoice-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e5e5; }
    .invoice-row:last-child { border-bottom: none; font-weight: bold; color: #7c3aed; font-size: 18px; }
    .btn { display: inline-block; background: #7c3aed; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 16px; }
    .footer { padding: 24px; text-align: center; font-size: 12px; color: #666; background: #f5f5f5; }
    ${invoice.rot_rut_type ? `
    .rot-notice { background: #d4edda; border: 1px solid #059669; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #065f46; }
    ` : ''}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Faktura</h1>
    </div>
    <div class="content">
      <p>Hej ${invoice.customer?.name || ''}!</p>
      <p>Här kommer din faktura från ${business?.business_name || 'oss'}.</p>

      ${invoice.rot_rut_type ? `
      <div class="rot-notice">
        <strong>${invoice.rot_rut_type.toUpperCase()}-avdrag tillämpas!</strong><br>
        Avdraget på ${invoice.rot_rut_deduction?.toLocaleString('sv-SE')} kr dras automatiskt via Skatteverket.
      </div>
      ` : ''}

      <div class="invoice-box">
        <div class="invoice-row">
          <span>Fakturanummer</span>
          <span>${invoice.invoice_number}</span>
        </div>
        <div class="invoice-row">
          <span>Förfallodatum</span>
          <span>${new Date(invoice.due_date).toLocaleDateString('sv-SE')}</span>
        </div>
        <div class="invoice-row">
          <span>Delsumma</span>
          <span>${invoice.subtotal?.toLocaleString('sv-SE')} kr</span>
        </div>
        <div class="invoice-row">
          <span>Moms (${invoice.vat_rate}%)</span>
          <span>${invoice.vat_amount?.toLocaleString('sv-SE')} kr</span>
        </div>
        ${invoice.rot_rut_type ? `
        <div class="invoice-row">
          <span>${invoice.rot_rut_type.toUpperCase()}-avdrag</span>
          <span style="color: #059669;">-${invoice.rot_rut_deduction?.toLocaleString('sv-SE')} kr</span>
        </div>
        ` : ''}
        <div class="invoice-row">
          <span>Att betala</span>
          <span>${amountToPay?.toLocaleString('sv-SE')} kr</span>
        </div>
      </div>

      <p><strong>Betalningsinformation:</strong></p>
      <p>
        Bankgiro: ${business?.bankgiro || 'Ej angivet'}<br>
        OCR: ${generateOCR(invoice.invoice_number || '')}
      </p>

      <center>
        <a href="${pdfUrl}" class="btn">Visa fullständig faktura</a>
      </center>
    </div>
    <div class="footer">
      <p>${business?.business_name || ''} | Org.nr: ${business?.org_number || ''}</p>
      <p>${business?.contact_email || ''} | ${business?.contact_phone || ''}</p>
    </div>
  </div>
</body>
</html>
          `,
          attachments: [
            {
              filename: `faktura-${invoice.invoice_number}.pdf`,
              content: pdfBuffer,
            }
          ]
        })

        results.email = true
      } catch (emailError: any) {
        console.error('Email send error:', emailError)
        results.errors.push(`Email: ${emailError.message}`)
      }
    }

    // Skicka SMS
    if (send_sms && invoice.customer?.phone_number) {
      try {
        const amountToPay = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
        const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://handymate.se'}/api/invoices/pdf?invoiceId=${invoice_id}`

        const smsResponse = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${process.env.ELKS_API_USER}:${process.env.ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: business?.business_name?.substring(0, 11) || 'Handymate',
            to: invoice.customer.phone_number,
            message: `Faktura ${invoice.invoice_number} från ${business?.business_name || 'oss'}.\n\nAtt betala: ${amountToPay?.toLocaleString('sv-SE')} kr\nFörfaller: ${new Date(invoice.due_date).toLocaleDateString('sv-SE')}\n\nSe faktura: ${pdfUrl}`
          }).toString()
        })

        if (smsResponse.ok) {
          results.sms = true
        } else {
          const smsError = await smsResponse.text()
          results.errors.push(`SMS: ${smsError}`)
        }
      } catch (smsError: any) {
        console.error('SMS send error:', smsError)
        results.errors.push(`SMS: ${smsError.message}`)
      }
    }

    // Uppdatera fakturastatus
    if (results.email || results.sms) {
      await supabase
        .from('invoice')
        .update({ status: 'sent' })
        .eq('invoice_id', invoice_id)

      // Logga aktivitet
      await supabase
        .from('activity')
        .insert({
          business_id: invoice.business_id,
          customer_id: invoice.customer_id,
          activity_type: 'invoice_sent',
          description: `Faktura ${invoice.invoice_number} skickad${results.email ? ' via email' : ''}${results.sms ? ' via SMS' : ''}`,
          metadata: { invoice_id, ...results }
        })

      // Pipeline: move deal to invoiced
      try {
        const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
        const settings = await getAutomationSettings(business.business_id)
        if (settings?.auto_move_on_payment) {
          const deal = await findDealByInvoice(business.business_id, invoice_id)
          if (deal) {
            await moveDeal({
              dealId: deal.id,
              businessId: business.business_id,
              toStageSlug: 'invoiced',
              triggeredBy: 'system',
            })
          }
        }
      } catch (pipelineErr) {
        console.error('Pipeline trigger error (non-blocking):', pipelineErr)
      }

      // Smart communication: trigger invoice_sent event
      try {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: business.business_id,
          event: 'invoice_sent',
          customerId: invoice.customer_id,
          context: { invoiceId: invoice_id },
        })
      } catch (commErr) {
        console.error('Communication trigger error (non-blocking):', commErr)
      }
    }

    return NextResponse.json({
      success: results.email || results.sms,
      ...results
    })

  } catch (error: any) {
    console.error('Send invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
