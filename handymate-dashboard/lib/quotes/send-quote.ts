/**
 * sendQuote — service-role-kapabel offert-sändning.
 *
 * Extraherad ur app/api/quotes/send/route.ts (Steg 1, execution-chain).
 * Routen är nu en tunn wrapper som gör auth → permission → rate-limit →
 * ägarskaps-verifiering → four-eyes-check, och anropar sedan denna för
 * SJÄLVA sändningen. execute.ts (Steg 3) anropar samma funktion direkt.
 *
 * GRÄNSDRAGNING (medveten, för behavior-identisk Steg 1):
 *   - four-eyes + ägarskap ligger kvar i routen (beror på currentUser.role
 *     och business.user_id — request-/security-concerns). När four-eyes
 *     triggar returnerar routen `requires_approval` UTAN att anropa denna.
 *   - denna funktion = "skicka en offert som redan är klar att skickas".
 *
 * Tar `business` (business_config-raden, samma som getAuthenticatedBusiness
 * returnerar) + den redan hämtade `quote` (samma objekt routen verifierade
 * ägarskap/four-eyes på → en fetch, exakt som originalet). Returnerar
 * { status, body } så wrappern mappar varje gren till identisk HTTP-respons.
 *
 * Sidoeffekter flyttade ordagrant: customer_activity (sms/email), pipeline
 * moveDeal (quote_sent), smart-communication quote_sent, automation-engine
 * fireEvent quote_sent, portal-notifikation, Golden Path deal-flytt. Inga
 * tappade.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { getOrCreatePortalLink } from '@/lib/portal-link'
import { sanitizeSenderId } from '@/lib/sms/sender-id'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * Skicka SMS via 46elks
 */
async function sendSMS(to: string, message: string, from: string): Promise<boolean> {
  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    console.error('46elks credentials not configured')
    return false
  }

  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: sanitizeSenderId(from),
        to: to,
        message: message,
      }),
    })
    return response.ok
  } catch (error) {
    console.error('SMS send error:', error)
    return false
  }
}

/**
 * Skicka email via Resend
 */
async function sendEmail(
  to: string | string[],
  subject: string,
  htmlContent: string,
  fromName: string,
  replyTo?: string,
  bcc?: string[]
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('Resend API key not configured, skipping email')
    return false
  }

  try {
    const toList = Array.isArray(to) ? to : [to]
    const payload: Record<string, any> = {
      from: `${fromName} <offert@${process.env.RESEND_DOMAIN || 'handymate.se'}>`,
      to: toList,
      subject: subject,
      html: htmlContent,
      reply_to: replyTo,
    }
    if (bcc && bcc.length > 0) {
      payload.bcc = bcc
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Resend error:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Email send error:', error)
    return false
  }
}

/**
 * Generera email HTML
 */
function generateEmailHTML(quote: any, business: any, signUrl?: string, trackingPixelUrl?: string): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const customerPays = quote.rot_rut_type ? quote.customer_pays : quote.total
  const rotText = quote.rot_rut_type
    ? `<p style="color: #059669; font-weight: 600;">Med ${quote.rot_rut_type.toUpperCase()}-avdrag betalar du endast: ${formatCurrency(customerPays)} kr</p>`
    : ''

  const signBlock = signUrl
    ? `
      <!-- Sign CTA -->
      <div style="text-align: center; margin: 30px 0; padding: 24px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
        <p style="color: #166534; font-weight: 600; margin: 0 0 12px 0; font-size: 15px;">Redo att godkänna offerten?</p>
        <p style="color: #4b5563; font-size: 13px; margin: 0 0 16px 0;">I din kundportal kan du granska offerten, signera digitalt och följa ditt projekt.</p>
        <a href="${signUrl}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">
          Öppna din kundportal →
        </a>
        <p style="color: #9ca3af; font-size: 11px; margin: 12px 0 0 0;">Eller kopiera länken: ${signUrl}</p>
      </div>`
    : `
      <!-- CTA -->
      <div style="text-align: center; margin: 30px 0;">
        <p style="color: #444; margin-bottom: 15px;">Har du frågor eller vill boka? Kontakta oss:</p>
        <a href="tel:${business.phone_number}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Ring ${business.phone_number}
        </a>
      </div>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <!-- Header -->
    <div style="background: #0d9488; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
      ${business.logo_url ? `<img src="${business.logo_url}" alt="${business.business_name}" style="max-height: 48px; margin-bottom: 12px;" />` : ''}
      <h1 style="color: white; margin: 0; font-size: 28px;">${business.business_name}</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Offert</p>
    </div>

    <!-- Content -->
    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
      <p style="font-size: 16px; color: #1a1a1a; margin: 0 0 20px 0;">
        Hej ${quote.customer?.name || 'kund'}!
      </p>

      <p style="color: #444; line-height: 1.6;">
        Tack för att du kontaktade oss. Här kommer din offert för:
      </p>

      <!-- Quote Box -->
      <div style="background: #f0fdfa; border-left: 4px solid #0d9488; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #1a1a1a;">
          ${quote.title || 'Offert'}
        </h2>
        ${quote.description ? `<p style="color: #666; margin: 0; font-size: 14px;">${quote.description}</p>` : ''}
      </div>

      <!-- Price -->
      <div style="background: #fafafa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #666; font-size: 14px;">Totalt (inkl. moms)</span>
          <span style="font-size: 24px; font-weight: 700; color: #1a1a1a;">${formatCurrency(quote.total)} kr</span>
        </div>
        ${rotText}
      </div>

      <!-- Valid Until -->
      <p style="color: #666; font-size: 14px; text-align: center; margin: 20px 0;">
        ${quote.valid_until ? `Offerten är giltig till <strong>${formatDate(quote.valid_until)}</strong>` : ''}
      </p>

      ${signBlock}

      <!-- Footer -->
      <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center; color: #888; font-size: 12px;">
        <p style="margin: 0 0 5px 0;"><strong>${business.business_name}</strong></p>
        <p style="margin: 0;">${business.phone_number} | ${business.contact_email}</p>
        ${business.org_number ? `<p style="margin: 5px 0 0 0;">Org.nr: ${business.org_number}</p>` : ''}
      </div>
    </div>

    <!-- Disclaimer -->
    <p style="text-align: center; color: #999; font-size: 11px; margin-top: 20px;">
      Detta email skickades från ${business.business_name} via Handymate.
    </p>
  </div>
${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />` : ''}
</body>
</html>
  `
}

export interface SendQuoteParams {
  quoteId: string
  method: string
  extraEmails?: string[]
  bccEmails?: string[]
}

/**
 * Skicka en offert som redan klarerat ägarskap + four-eyes.
 * `quote` är den redan hämtade offerten (med .customer satt av denna funktion).
 * Returnerar { status, body } — wrappern gör NextResponse.json(body, { status }).
 */
export async function sendQuote(
  supabase: SupabaseClient,
  business: any,
  quote: any,
  params: SendQuoteParams,
): Promise<{ status: number; body: any }> {
  const { quoteId, method, extraEmails, bccEmails } = params

  // Hämta kund separat (FK-relation osäker)
  let customer: any = null
  if (quote.customer_id) {
    const { data: c } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', quote.customer_id)
      .single()
    if (!c) {
      // Försök med customers-tabellen
      const { data: c2 } = await supabase
        .from('customers')
        .select('*')
        .eq('id', quote.customer_id)
        .single()
      customer = c2
    } else {
      customer = c
    }
  }
  // Sätt customer på quote-objektet för bakåtkompatibilitet
  ;(quote as any).customer = customer

  if (!customer) {
    return { status: 400, body: { error: 'Ingen kund kopplad till offerten' } }
  }

  // Hämta logo_url och swish_number
  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('logo_url, swish_number')
    .eq('business_id', business.business_id)
    .single()
  const businessWithLogo = { ...business, logo_url: bizConfig?.logo_url, swish_number: bizConfig?.swish_number }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)
  }

  const customerPays = quote.rot_rut_type ? quote.customer_pays : quote.total
  const rotText = quote.rot_rut_type ? ` (efter ${quote.rot_rut_type.toUpperCase()}: ${formatCurrency(customerPays)} kr)` : ''

  // Generate/get sign_token and build signing URL
  let signToken = quote.sign_token
  if (!signToken) {
    signToken = crypto.randomUUID()
    await supabase
      .from('quotes')
      .update({ sign_token: signToken })
      .eq('quote_id', quoteId)
  }

  const trackingSessionId = crypto.randomUUID()
  // Länka till kundportalen med offerter-flik öppen (skapar portal_token vid behov)
  const portalUrl = await getOrCreatePortalLink(supabase, quote.customer_id, 'quotes')
  if (!portalUrl) {
    return { status: 500, body: { error: 'Kunde inte skapa portal-länk' } }
  }
  const signUrl = portalUrl
  const trackingPixelUrl = `${APP_URL}/api/quotes/track?q=${quoteId}&e=opened&s=${trackingSessionId}`

  let smsSent = false
  let emailSent = false
  let sentVia = ''
  let gmailError = ''

  // SMS
  if (method === 'sms' || method === 'both') {
    if (!quote.customer.phone_number) {
      return { status: 400, body: { error: 'Kunden saknar telefonnummer' } }
    }

    const suffix = buildSmsSuffix(business.business_name, business.assigned_phone_number)
    const smsMessage = `Hej ${quote.customer.name}!

Här kommer din offert från ${business.business_name}:

${quote.title || 'Offert'}
Totalt: ${formatCurrency(quote.total)} kr${rotText}
${quote.valid_until ? `Giltig till: ${new Date(quote.valid_until).toLocaleDateString('sv-SE')}\n` : ''}
Öppna din kundportal:
${portalUrl}

Frågor? Ring ${business.phone_number}
${suffix}`

    smsSent = await sendSMS(quote.customer.phone_number, smsMessage, business.business_name)

    if (smsSent) {
      // Logga SMS-aktivitet
      await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        customer_id: quote.customer_id,
        business_id: quote.business_id,
        activity_type: 'sms_sent',
        title: 'Offert skickad via SMS',
        description: `Offert "${quote.title}" skickad till ${quote.customer.phone_number}`,
        created_by: 'user'
      })
    }
  }

  // Email
  if (method === 'email' || method === 'both') {
    if (!quote.customer.email) {
      if (method === 'email') {
        return { status: 400, body: { error: 'Kunden saknar email' } }
      }
      // Om both och ingen email, fortsätt med bara SMS
    } else {
      const emailSubject = `Offert från ${business.business_name} — ${quote.title || 'Offert'}`
      const emailHTML = generateEmailHTML(quote, businessWithLogo, signUrl, trackingPixelUrl)
      const allRecipients = [quote.customer.email, ...(extraEmails || [])].filter(Boolean)

      // Försök Gmail först, fallback till Resend
      try {
        const { sendViaGmail, isGmailSendEnabled } = await import('@/lib/gmail-send')
        const gmailStatus = await isGmailSendEnabled(business.business_id)
        if (gmailStatus.enabled && gmailStatus.email) {
          emailSent = await sendViaGmail(business.business_id, {
            to: allRecipients,
            subject: emailSubject,
            html: emailHTML,
            fromName: business.business_name,
            fromEmail: gmailStatus.email,
            replyTo: business.contact_email || undefined,
            bcc: bccEmails && bccEmails.length > 0 ? bccEmails : undefined,
          })
          if (emailSent) {
            sentVia = gmailStatus.email
          } else {
            gmailError = 'Gmail-token kan ha gått ut — återanslut Gmail i Inställningar'
          }
        }
      } catch (gmailErr: any) {
        console.error('Gmail send error (falling back to Resend):', gmailErr)
        gmailError = gmailErr?.message || 'Gmail-fel'
      }

      // Fallback: Resend
      if (!emailSent) {
        emailSent = await sendEmail(
          allRecipients,
          emailSubject,
          emailHTML,
          business.business_name,
          business.contact_email || undefined,
          bccEmails && bccEmails.length > 0 ? bccEmails : undefined,
        )
        if (emailSent) {
          sentVia = `offert@${process.env.RESEND_DOMAIN || 'handymate.se'}`
        }
      }

      if (emailSent) {
        // Logga email-aktivitet
        await supabase.from('customer_activity').insert({
          activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
          customer_id: quote.customer_id,
          business_id: quote.business_id,
          activity_type: 'email_sent',
          title: 'Offert skickad via email',
          description: `Offert "${quote.title}" skickad till ${quote.customer.email}`,
          created_by: 'user'
        })
      }
    }
  }

  // Kontrollera att minst en metod lyckades
  if (!smsSent && !emailSent) {
    const hint = gmailError
      ? `Gmail misslyckades: ${gmailError}. `
      : ''
    return {
      status: 500,
      body: {
        error: `${hint}Kunde inte skicka offerten. Kontrollera att Gmail är kopplad i Inställningar eller att kundens mailadress stämmer.`
      },
    }
  }

  // Uppdatera offert-status
  const { error: statusUpdateErr } = await supabase
    .from('quotes')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString()
    })
    .eq('quote_id', quoteId)

  if (statusUpdateErr) {
    // Kritiskt: offert skickades via SMS/mail men status sparades inte
    console.error('[quotes/send] CRITICAL: Status-update failed after send:', statusUpdateErr)
    return {
      status: 200,
      body: {
        success: true,
        smsSent, emailSent,
        warning: 'Offerten skickades men status kunde inte uppdateras. Ladda om sidan.',
      },
    }
  }

  // Pipeline: move deal to quote_sent if exists
  try {
    const { findDealByQuote, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
    const settings = await getAutomationSettings(business.business_id)
    if (settings?.auto_move_on_signature) {
      const deal = await findDealByQuote(business.business_id, quoteId)
      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId: business.business_id,
          toStageSlug: 'quote_sent',
          triggeredBy: 'system',
        })
      }
    }
  } catch (pipelineErr) {
    console.error('Pipeline trigger error (non-blocking):', pipelineErr)
  }

  // Smart communication: trigger quote_sent event
  try {
    const { triggerEventCommunication } = await import('@/lib/smart-communication')
    await triggerEventCommunication({
      businessId: business.business_id,
      event: 'quote_sent',
      customerId: quote.customer_id,
      context: { quoteId },
    })
  } catch (commErr) {
    console.error('Communication trigger error (non-blocking):', commErr)
  }

  // V4 Automation Engine: fire quote_sent event (pipeline stage move)
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'quote_sent', business.business_id, {
      quote_id: quoteId,
      customer_id: quote.customer_id,
      customer_name: quote.customer?.name,
      total: quote.total,
      title: quote.title,
    })
  } catch (eventErr) {
    console.error('fireEvent quote_sent error (non-blocking):', eventErr)
  }

  // Portal-notifikation (1h-dedup hanteras internt; offerter skickas oftast
  // bara en gång så det här är säkert även parallellt med den primära mailen)
  try {
    const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
    await sendPortalNotification(business.business_id, quote.customer_id, 'quote_sent', {
      context: { title: quote.title, total: quote.total },
    })
  } catch (notifErr) {
    console.error('Portal notification quote_sent error (non-blocking):', notifErr)
  }

  // Golden Path: flytta deal till "Offert skickad" automatiskt
  try {
    const { data: linkedDeal } = await supabase
      .from('deal')
      .select('id')
      .eq('business_id', business.business_id)
      .eq('quote_id', quoteId)
      .maybeSingle()

    if (linkedDeal) {
      const { moveDeal } = await import('@/lib/pipeline')
      await moveDeal({
        dealId: linkedDeal.id,
        businessId: business.business_id,
        toStageSlug: 'quote_sent',
        triggeredBy: 'system',
        aiReason: 'Offert skickad till kund',
      })
    }
  } catch { /* non-blocking */ }

  // Bygg svar
  const sentMethods = []
  if (smsSent) sentMethods.push('SMS')
  if (emailSent) sentMethods.push('email')

  return {
    status: 200,
    body: {
      success: true,
      message: `Offert skickad via ${sentMethods.join(' och ')}!`,
      smsSent,
      emailSent,
      sentVia: sentVia || undefined,
    },
  }
}
