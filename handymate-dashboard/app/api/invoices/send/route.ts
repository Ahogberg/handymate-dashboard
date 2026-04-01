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
          html: buildInvoiceEmailHtml({
            customerName: invoice.customer?.name || '',
            businessName: business?.business_name || '',
            invoiceNumber: invoice.invoice_number,
            dueDate: invoice.due_date,
            subtotal: invoice.subtotal,
            vatRate: invoice.vat_rate,
            vatAmount: invoice.vat_amount,
            amountToPay: amountToPay || 0,
            rotRutType: invoice.rot_rut_type,
            rotRutDeduction: invoice.rot_rut_deduction,
            bankgiro: business?.bankgiro,
            ocrNumber: generateOCR(invoice.invoice_number || ''),
            swishNumber: businessConfig?.swish_number,
            orgNumber: business?.org_number,
            contactEmail: business?.contact_email,
            contactPhone: business?.contact_phone,
            pdfUrl,
          }),
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

// ── Faktura-mailmall (teal, matchar offertmall) ─────────────────────

function buildInvoiceEmailHtml(opts: {
  customerName: string
  businessName: string
  invoiceNumber: string
  dueDate: string
  subtotal: number
  vatRate: number
  vatAmount: number
  amountToPay: number
  rotRutType?: string | null
  rotRutDeduction?: number | null
  bankgiro?: string | null
  ocrNumber: string
  swishNumber?: string | null
  orgNumber?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  pdfUrl: string
}): string {
  const firstName = opts.customerName.split(' ')[0] || 'Kund'

  const rotSection = opts.rotRutType ? `
    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 4px; font-weight: 600; color: #166534;">🏠 ${opts.rotRutType.toUpperCase()}-avdrag tillämpas</p>
      <p style="margin: 0; color: #374151; font-size: 14px;">
        Avdraget på <strong>${opts.rotRutDeduction?.toLocaleString('sv-SE')} kr</strong> dras automatiskt via Skatteverket.
      </p>
    </div>` : ''

  const rotRow = opts.rotRutType ? `
    <tr>
      <td style="padding: 12px 16px; color: #374151; font-size: 14px;">${opts.rotRutType.toUpperCase()}-avdrag</td>
      <td style="padding: 12px 16px; text-align: right; color: #059669; font-size: 14px; font-weight: 600;">-${opts.rotRutDeduction?.toLocaleString('sv-SE')} kr</td>
    </tr>` : ''

  const swishSection = opts.swishNumber ? (() => {
    const swishData = JSON.stringify({
      version: 1,
      payee: { value: (opts.swishNumber as string).replace(/\D/g, '') },
      amount: { value: Math.round(opts.amountToPay) },
      message: { value: opts.invoiceNumber },
    })
    const swishLink = 'swish://payment?data=' + encodeURIComponent(swishData)
    return `
    <div style="text-align: center; margin: 24px 0; padding: 20px; background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 8px;">
      <p style="font-size: 13px; color: #6B7280; margin: 0 0 12px;">Betala enkelt med Swish</p>
      <a href="${swishLink}"
         style="display: inline-block; background: #0F766E; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
        Betala ${opts.amountToPay.toLocaleString('sv-SE')} kr med Swish
      </a>
      <p style="font-size: 13px; color: #374151; margin: 12px 0 0;">
        Swish-nummer: <strong>${opts.swishNumber}</strong>
      </p>
      <p style="font-size: 12px; color: #9CA3AF; margin: 4px 0 0;">
        Märk betalningen: <strong>${opts.invoiceNumber}</strong>
      </p>
    </div>`
  })() : ''

  const paymentInfo = [
    opts.bankgiro ? `Bankgiro: <strong>${opts.bankgiro}</strong>` : '',
    `OCR-nummer: <strong>${opts.ocrNumber}</strong>`,
  ].filter(Boolean).join('<br>')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; color: #1F2937;">
  <div style="max-width: 600px; margin: 0 auto;">

    <div style="background: #0F766E; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700;">${opts.businessName}</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">Faktura ${opts.invoiceNumber}</p>
    </div>

    <div style="background: white; padding: 28px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px;">

      <h2 style="color: #111827; font-size: 18px; margin: 0 0 8px;">Hej ${firstName}!</h2>
      <p style="color: #374151; line-height: 1.6; margin: 0 0 20px;">
        Här kommer din faktura. Nedan hittar du en sammanfattning — fullständig faktura finns bifogad som PDF.
      </p>

      ${rotSection}

      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <tr style="background: #F9FAFB;">
          <td style="padding: 12px 16px; color: #6B7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Beskrivning</td>
          <td style="padding: 12px 16px; text-align: right; color: #6B7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Belopp</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; color: #374151; font-size: 14px; border-top: 1px solid #E5E7EB;">Delsumma</td>
          <td style="padding: 12px 16px; text-align: right; color: #374151; font-size: 14px; border-top: 1px solid #E5E7EB;">${opts.subtotal?.toLocaleString('sv-SE')} kr</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; color: #374151; font-size: 14px; border-top: 1px solid #F3F4F6;">Moms (${opts.vatRate}%)</td>
          <td style="padding: 12px 16px; text-align: right; color: #374151; font-size: 14px; border-top: 1px solid #F3F4F6;">${opts.vatAmount?.toLocaleString('sv-SE')} kr</td>
        </tr>
        ${rotRow}
        <tr style="background: #F0FDFA;">
          <td style="padding: 14px 16px; color: #0F766E; font-size: 16px; font-weight: 700; border-top: 2px solid #0F766E;">Att betala</td>
          <td style="padding: 14px 16px; text-align: right; color: #0F766E; font-size: 16px; font-weight: 700; border-top: 2px solid #0F766E;">${opts.amountToPay.toLocaleString('sv-SE')} kr</td>
        </tr>
      </table>

      <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 4px; font-weight: 600; color: #111827; font-size: 14px;">Betalningsinformation</p>
        <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">${paymentInfo}</p>
        <p style="margin: 8px 0 0; color: #6B7280; font-size: 13px;">Förfallodatum: <strong>${new Date(opts.dueDate).toLocaleDateString('sv-SE')}</strong></p>
      </div>

      ${swishSection}

      <div style="text-align: center; margin: 24px 0 8px;">
        <a href="${opts.pdfUrl}" style="display: inline-block; background: #0F766E; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Visa faktura som PDF
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />

      <p style="color: #6B7280; font-size: 13px; text-align: center; margin: 0; line-height: 1.5;">
        ${opts.businessName}${opts.orgNumber ? ` · Org.nr: ${opts.orgNumber}` : ''}<br>
        ${[opts.contactEmail, opts.contactPhone].filter(Boolean).join(' · ')}
      </p>
    </div>
  </div>
</body>
</html>`
}
