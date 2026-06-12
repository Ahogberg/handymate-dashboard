/**
 * sendInvoice — service-role-kapabel faktura-sändning.
 *
 * Extraherad ur app/api/invoices/send/route.ts (Steg 1, execution-chain).
 * HTTP-routen är nu en tunn wrapper (auth → permission → rate-limit → denna).
 * execute.ts (Steg 2/3) anropar samma funktion direkt → en sanning, ingen
 * dubbel-väg.
 *
 * Beteende EXAKT som den gamla route-bodyn: samma fetch, portal-auto-skapande,
 * email (Resend + PDF), SMS (46elks), status→sent, och ALLA sidoeffekter
 * (activity-logg, pipeline moveDeal, project-stage, smart-communication,
 * portal-notifikation). Inga sidoeffekter tappade.
 *
 * Auth + permission + rate-limit ligger kvar i routen (request-/user-concern),
 * inte här — så systemvägen (execute.ts) inte rate-limitas som en användare.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { generateOCR } from '@/lib/ocr'
import { generateInvoicePDF } from '@/lib/pdf-generator'
import { randomUUID } from 'crypto'
import { sanitizeSenderId } from '@/lib/sms/sender-id'

export interface SendInvoiceParams {
  invoiceId: string
  sendSms?: boolean
  sendEmail?: boolean
}

/**
 * Returshape matchar route-bodyns `results`. `notFound` används av wrappern
 * för att returnera 404. `sent = !!(email || sms)` — wrappern beräknar
 * response-`success` på exakt samma sätt som tidigare (`email || sms`).
 */
export interface SendInvoiceResult {
  sms?: boolean
  email?: boolean
  errors: string[]
  notFound?: boolean
}

export async function sendInvoice(
  supabase: SupabaseClient,
  businessId: string,
  params: SendInvoiceParams,
): Promise<SendInvoiceResult> {
  const { invoiceId, sendSms = false, sendEmail = true } = params
  const resend = new Resend(process.env.RESEND_API_KEY)

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
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (invoiceError || !invoice) {
    return { errors: ['Invoice not found'], notFound: true }
  }

  // Hämta företagsconfig — ersätter BÅDE `businessConfig` och `business`-
  // fälten i gamla routen (getAuthenticatedBusiness returnerar samma
  // business_config-rad, så detta är behavior-identiskt).
  const { data: businessConfig } = await supabase
    .from('business_config')
    .select('*')
    .eq('business_id', businessId)
    .single()

  const results: SendInvoiceResult = { errors: [] }

  // Säkerställ kundportal aktiverad
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  let portalUrl = ''
  if (invoice.customer_id) {
    const { data: cust } = await supabase
      .from('customer')
      .select('portal_token, portal_enabled')
      .eq('customer_id', invoice.customer_id)
      .single()

    if (cust?.portal_token && cust?.portal_enabled) {
      portalUrl = `${APP_URL}/portal/${cust.portal_token}?tab=invoices`
    } else {
      // Auto-skapa kundportal
      const newToken = randomUUID()
      await supabase
        .from('customer')
        .update({
          portal_token: newToken,
          portal_token_created_at: new Date().toISOString(),
          portal_enabled: true,
        })
        .eq('customer_id', invoice.customer_id)
      portalUrl = `${APP_URL}/portal/${newToken}?tab=invoices`
    }
  }

  // Skicka email
  if (sendEmail && invoice.customer?.email) {
    try {
      const pdfUrl = `${APP_URL}/api/invoices/pdf?invoiceId=${invoiceId}`
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
          business_name: businessConfig?.business_name,
          org_number: businessConfig?.org_number,
          contact_email: businessConfig?.contact_email,
          contact_phone: businessConfig?.contact_phone,
          address: businessConfig?.address,
          bankgiro: businessConfig?.bankgiro,
          f_skatt_registered: businessConfig?.f_skatt_registered,
        }
      )

      await resend.emails.send({
        from: `${businessConfig?.business_name || 'Handymate'} <faktura@${process.env.RESEND_DOMAIN || 'handymate.se'}>`,
        to: invoice.customer.email,
        subject: `Faktura ${invoice.invoice_number} från ${businessConfig?.business_name || 'oss'}`,
        html: buildInvoiceEmailHtml({
          customerName: invoice.customer?.name || '',
          businessName: businessConfig?.business_name || '',
          invoiceNumber: invoice.invoice_number,
          dueDate: invoice.due_date,
          subtotal: invoice.subtotal,
          vatRate: invoice.vat_rate,
          vatAmount: invoice.vat_amount,
          amountToPay: amountToPay || 0,
          rotRutType: invoice.rot_rut_type,
          rotRutDeduction: invoice.rot_rut_deduction,
          bankgiro: businessConfig?.bankgiro,
          ocrNumber: generateOCR(invoice.invoice_number || ''),
          swishNumber: businessConfig?.swish_number,
          orgNumber: businessConfig?.org_number,
          contactEmail: businessConfig?.contact_email,
          contactPhone: businessConfig?.contact_phone,
          portalUrl: portalUrl || pdfUrl,
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
  if (sendSms && invoice.customer?.phone_number) {
    try {
      const amountToPay = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
      const smsLink = portalUrl || `${APP_URL}/api/invoices/pdf?invoiceId=${invoiceId}`

      const smsResponse = await fetch('https://api.46elks.com/a1/sms', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.ELKS_API_USER}:${process.env.ELKS_API_PASSWORD}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: sanitizeSenderId(businessConfig?.business_name),
          to: invoice.customer.phone_number,
          message: `Faktura ${invoice.invoice_number} från ${businessConfig?.business_name || 'oss'}.\n\nAtt betala: ${amountToPay?.toLocaleString('sv-SE')} kr\nFörfaller: ${new Date(invoice.due_date).toLocaleDateString('sv-SE')}\n\nSe faktura: ${smsLink}`
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
    const { error: statusErr } = await supabase
      .from('invoice')
      .update({ status: 'sent' })
      .eq('invoice_id', invoiceId)

    if (statusErr) {
      console.error('[invoices/send] Status update failed after send:', statusErr)
      results.errors.push(`Status: ${statusErr.message}`)
    }

    // Logga aktivitet
    await supabase
      .from('activity')
      .insert({
        business_id: invoice.business_id,
        customer_id: invoice.customer_id,
        activity_type: 'invoice_sent',
        description: `Faktura ${invoice.invoice_number} skickad${results.email ? ' via email' : ''}${results.sms ? ' via SMS' : ''}`,
        metadata: { invoice_id: invoiceId, ...results }
      })

    // Pipeline: move deal to invoiced
    try {
      const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
      const settings = await getAutomationSettings(businessId)
      if (settings?.auto_move_on_payment) {
        const deal = await findDealByInvoice(businessId, invoiceId)
        if (deal) {
          await moveDeal({
            dealId: deal.id,
            businessId: businessId,
            toStageSlug: 'invoiced',
            triggeredBy: 'system',
          })
        }
      }
    } catch (pipelineErr) {
      console.error('Pipeline trigger error (non-blocking):', pipelineErr)
    }

    // Project workflow stage: 'Faktura skickad' (non-blocking)
    try {
      const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
      const project = await findProjectForEntity({
        businessId: businessId,
        invoiceId: invoiceId,
      })
      if (project) {
        await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_SENT, businessId)
      }
    } catch (err) {
      console.error('[invoices/send] advanceProjectStage failed:', err)
    }

    // Smart communication: trigger invoice_sent event
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId: businessId,
        event: 'invoice_sent',
        customerId: invoice.customer_id,
        context: { invoiceId: invoiceId },
      })
    } catch (commErr) {
      console.error('Communication trigger error (non-blocking):', commErr)
    }

    // Portal-notifikation
    try {
      const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
      await sendPortalNotification(businessId, invoice.customer_id, 'invoice_sent', {
        context: {
          amount: invoice.total_amount || invoice.total || invoice.amount,
          due_date: invoice.due_date || null,
          invoice_number: invoice.invoice_number,
        },
      })
    } catch (notifErr) {
      console.error('Portal notification invoice_sent error (non-blocking):', notifErr)
    }
  }

  return results
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
  portalUrl: string
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
        Här kommer din faktura. Nedan hittar du en sammanfattning — du kan se alla detaljer i din kundportal eller i bifogad PDF.
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
        <a href="${opts.portalUrl}" style="display: inline-block; background: #0F766E; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Visa i kundportalen
        </a>
        <p style="margin: 12px 0 0; font-size: 13px;">
          <a href="${opts.pdfUrl}" style="color: #0F766E; text-decoration: underline;">Ladda ner som PDF</a>
        </p>
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
