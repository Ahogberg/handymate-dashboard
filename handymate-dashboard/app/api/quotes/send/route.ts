import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkSmsRateLimitDb, checkEmailRateLimitDb } from '@/lib/rate-limit-db'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getOrCreatePortalLink } from '@/lib/portal-link'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import { fetchQuoteCreator } from '@/lib/quotes/fetch-quote-creator'
import { quoteRecipients, validateQuoteDeliveryData, buildQuoteDeliveryEnvelope, quoteSendReceipt } from '@/lib/quotes/delivery-envelope'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * Skicka SMS via 46elks
 */
/**
 * Genom strypunkten (etapp 0 batch 1, 2026-08-08).
 *
 * Anropade tidigare 46elks direkt och saknade därmed opt-out-spärren,
 * sms_log-raden och kostnadsmätningen. Signaturen har utökats med tenant och
 * kund — utan dem kan varken opt-out kollas eller kostnaden bokföras på rätt
 * företag.
 */
async function sendSMS(
  supabase: SupabaseClient,
  businessId: string,
  to: string,
  message: string,
  from: string,
  customerId?: string | null,
  quoteId?: string | null,
): Promise<{ sent: boolean; error?: string }> {
  const { sendSmsViaElks } = await import('@/lib/sms-send')
  const r = await sendSmsViaElks({
    supabase,
    businessId,
    businessName: from,
    to,
    message,
    customerId: customerId || null,
    relatedId: quoteId || null,
    messageType: 'quote',
    recipient: 'customer',
    purpose: 'transactional',
  })
  if (!r.success) console.error('[quotes/send] SMS misslyckades:', r.error)
  return { sent: r.success, error: r.error }
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

    const result = await response.json()
    return typeof result?.id === 'string' && result.id.length > 0
  } catch (error) {
    console.error('Email send error:', error)
    return false
  }
}

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
    const { quoteId, method, extraEmails, bccEmails } = await request.json()

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    // Rate limit check
    if (method === 'sms' || method === 'both') {
      const smsLimit = await checkSmsRateLimitDb(business.business_id)
      if (!smsLimit.allowed) {
        return NextResponse.json({ error: smsLimit.error }, { status: 429 })
      }
    }
    if (method === 'email' || method === 'both') {
      const emailLimit = await checkEmailRateLimitDb(business.business_id)
      if (!emailLimit.allowed) {
        return NextResponse.json({ error: emailLimit.error }, { status: 429 })
      }
    }

    // Hämta offert (service role, ej RLS)
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*, sign_token')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (quoteError || !quote) {
      console.error('Quote fetch error:', quoteError, 'quoteId:', quoteId)
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // A shared contact email is not authority over another business's quote.
    if (quote.business_id !== business.business_id) return NextResponse.json({ error: 'Offerten hittades inte' }, { status: 404 })
    const { data: customer, error: customerError } = await supabase.from('customer').select('*')
      .eq('customer_id', quote.customer_id).eq('business_id', business.business_id).single()
    if (customerError || !customer) return NextResponse.json({ error: 'Kunden kunde inte verifieras i företaget' }, { status: 400 })
    ;(quote as any).customer = customer
    let recipients
    try { recipients = quoteRecipients(customer, method, extraEmails, bccEmails) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Ogiltiga mottagare' }, { status: 400 }) }

    // 4-eyes check: kräv admin-godkännande för stora offerter
    const { data: bizConfig, error: businessError } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()
    if (businessError || !bizConfig) return NextResponse.json({ error: 'Företagets avsändaruppgifter och godkännanderegler kunde inte verifieras' }, { status: 500 })
    const fourEyesConfig = bizConfig
    let quoteTotal: number
    try { quoteTotal = validateQuoteDeliveryData(quote, bizConfig).total }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Ogiltigt offertunderlag' }, { status: 400 }) }

    if (
      fourEyesConfig?.four_eyes_enabled &&
      quoteTotal >= (fourEyesConfig.four_eyes_threshold_sek || 50000) &&
      currentUser?.role !== 'owner' && currentUser?.role !== 'admin'
    ) {
      // Skapa approval istf att skicka direkt
      const approvalId = `appr_4e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      const { error: apprErr } = await supabase.from('pending_approvals').insert({
        id: approvalId,
        business_id: quote.business_id,
        approval_type: 'four_eyes_quote',
        // Etapp 3b (multi-employee-parity-plan.md): kö-routing.
        routing_role: 'owner_admin',
        title: `Offert kräver godkännande — ${(quoteTotal).toLocaleString('sv-SE')} kr`,
        description: `${quote.title || 'Offert'} till ${quote.customer?.name || 'kund'}. Beloppet överstiger gränsen på ${(fourEyesConfig.four_eyes_threshold_sek || 50000).toLocaleString('sv-SE')} kr.`,
        payload: {
          quote_id: quoteId,
          quote_title: quote.title,
          quote_total: quoteTotal,
          threshold: fourEyesConfig.four_eyes_threshold_sek,
          requested_by: currentUser?.name || 'Användare',
          // Etapp 3a (multi-employee-parity-plan.md): behövs av
          // canActOnApproval (lib/approvals/routing.ts) för
          // självgodkännande-spärren — requested_by ovan är bara ett
          // visningsnamn, inte ett id att jämföra mot.
          requested_by_user_id: currentUser?.id || null,
          send_method: method,
          extra_emails: recipients.emailTo.slice(1),
          bcc_emails: recipients.bcc,
        },
        status: 'pending',
        risk_level: 'high',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      if (apprErr) {
        console.error('[quotes/send] Failed to create approval:', apprErr)
        return NextResponse.json({ error: 'Kunde inte skapa godkännandebegäran' }, { status: 500 })
      }

      // Uppdatera status till pending_approval
      const { error: statusErr } = await supabase
        .from('quotes')
        .update({ status: 'pending_approval' })
        .eq('quote_id', quoteId)
        .eq('business_id', business.business_id)

      if (statusErr) {
        console.error('[quotes/send] Failed to update quote status:', statusErr)
        return NextResponse.json({ error: 'Godkännande skapad men offertens status kunde inte uppdateras' }, { status: 500 })
      }

      // Notifiera admin via push — annars skapades en high-risk approval helt
      // tyst (ingen template + ingen push) och offerten fastnade utan att någon
      // visste att den väntade på godkännande. Fire-and-forget.
      void sendApprovalPush({
        business_id: quote.business_id,
        approval_type: 'four_eyes_quote',
        payload: {
          quote_id: quoteId,
          quote_title: quote.title,
          quote_total: quoteTotal,
          requested_by: currentUser?.name || 'Användare',
        },
      })

      return NextResponse.json({
        requires_approval: true,
        approval_id: approvalId,
        message: `Offerten kräver godkännande av admin innan den skickas (belopp: ${quoteTotal.toLocaleString('sv-SE')} kr)`,
      })
    }

    const businessWithLogo = bizConfig

    // Offertens skapare (business_users) → mejlets kontaktuppgifter visar rätt
    // person, samma identitet som kunddokumentet. Null för gamla offerter.
    const emailCreator = await fetchQuoteCreator(supabase, quote.created_by, business.business_id)

    // Generate/get sign_token and build signing URL
    let signToken = quote.sign_token
    if (!signToken) {
      signToken = crypto.randomUUID()
      const { data: tokenRows, error: tokenError } = await supabase
        .from('quotes')
        .update({ sign_token: signToken })
        .eq('quote_id', quoteId)
        .eq('business_id', business.business_id)
        .is('sign_token', null)
        .select('quote_id')
      if (tokenError || !tokenRows?.length) return NextResponse.json({ error: 'Signeringslänken kunde inte sparas. Inget utskick gjordes.' }, { status: 409 })
    }

    const trackingSessionId = crypto.randomUUID()
    // Länka till kundportalen med offerter-flik öppen (skapar portal_token vid behov)
    const portalUrl = await getOrCreatePortalLink(supabase, quote.customer_id, 'quotes')
    if (!portalUrl) {
      return NextResponse.json({ error: 'Kunde inte skapa portal-länk' }, { status: 500 })
    }
    // t=sign_token krävs av /api/quotes/track sedan tenant-svepet 2026-09-01.
    const trackingPixelUrl = `${APP_URL}/api/quotes/track?q=${quoteId}&t=${encodeURIComponent(signToken)}&e=opened&s=${trackingSessionId}`
    const envelope = buildQuoteDeliveryEnvelope({ quote, business: businessWithLogo, recipients, portalUrl,
      pdfUrl: `${APP_URL}/api/quotes/pdf?token=${signToken}&format=pdf`, trackingPixelUrl, creator: emailCreator })

    let smsSent = false
    let emailSent = false
    let sentVia = ''
    let gmailError = ''
    let smsError = ''
    const followupErrors: string[] = []
    let gmailAttempted = false

    // SMS
    if (method === 'sms' || method === 'both') {
      if (!quote.customer.phone_number) {
        return NextResponse.json({ error: 'Kunden saknar telefonnummer' }, { status: 400 })
      }

      const smsMessage = envelope.sms!.text

      const smsResult = await sendSMS(supabase, business.business_id, quote.customer.phone_number, smsMessage, business.business_name, quote.customer_id, quoteId)
      smsSent = smsResult.sent
      smsError = smsResult.error || ''

      if (smsSent) {
        // Logga SMS-aktivitet
        const { error: activityError } = await supabase.from('customer_activity').insert({
          activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
          customer_id: quote.customer_id,
          business_id: quote.business_id,
          activity_type: 'sms_sent',
          title: 'Offert skickad via SMS',
          description: `Offert "${quote.title}" skickad till ${quote.customer.phone_number}`,
          created_by: 'user'
        })
        if (activityError) followupErrors.push('SMS accepterades men kundhistoriken kunde inte sparas.')
      }
    }

    // Email
    if (method === 'email' || method === 'both') {
      if (!quote.customer.email) {
        if (method === 'email') {
          return NextResponse.json({ error: 'Kunden saknar email' }, { status: 400 })
        }
        // Om both och ingen email, fortsätt med bara SMS
      } else {
        const emailSubject = envelope.email!.subject
        const emailHTML = envelope.email!.html
        const allRecipients = envelope.email!.to

        // Resend is only an alternative when Gmail is disabled, never a retry
        // after an uncertain Gmail delivery.
        try {
          const { sendViaGmail, isGmailSendEnabled } = await import('@/lib/gmail-send')
          const gmailStatus = await isGmailSendEnabled(business.business_id)
          if (gmailStatus.enabled && gmailStatus.email) {
            gmailAttempted = true
            emailSent = await sendViaGmail(business.business_id, {
              to: allRecipients,
              subject: emailSubject,
              html: emailHTML,
              fromName: business.business_name,
              fromEmail: gmailStatus.email,
              replyTo: envelope.email!.replyTo,
              bcc: envelope.email!.bcc.length ? envelope.email!.bcc : undefined,
            })
            if (emailSent) {
              sentVia = gmailStatus.email
            } else {
              gmailError = 'Gmail-utskicket kunde inte bekräftas. Inget reservutskick görs; kontrollera Gmail innan du försöker igen.'
            }
          }
        } catch (gmailErr: any) {
          gmailAttempted = true
          console.error('Gmail send error (no automatic resend):', gmailErr)
          gmailError = 'Gmail-utskicket kunde inte bekräftas. Inget reservutskick görs; kontrollera Gmail innan du försöker igen.'
        }

        // Fallback: Resend
        if (!emailSent && !gmailAttempted) {
          emailSent = await sendEmail(
            allRecipients,
            emailSubject,
            emailHTML,
            business.business_name,
            envelope.email!.replyTo,
            envelope.email!.bcc.length ? envelope.email!.bcc : undefined,
          )
          if (emailSent) {
            sentVia = `offert@${process.env.RESEND_DOMAIN || 'handymate.se'}`
          } else {
            gmailError = 'E-postutskicket kunde inte bekräftas av Resend. Kontrollera sändtjänsten innan du försöker igen.'
          }
        }

        if (emailSent) {
          // Logga email-aktivitet
          const { error: activityError } = await supabase.from('customer_activity').insert({
            activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
            customer_id: quote.customer_id,
            business_id: quote.business_id,
            activity_type: 'email_sent',
            title: 'Offert skickad via email',
            description: `Offert "${quote.title}" skickad till ${quote.customer.email}`,
            created_by: 'user'
          })
          if (activityError) followupErrors.push('E-post accepterades men kundhistoriken kunde inte sparas.')
        }
      }
    }

    // Kontrollera att minst en metod lyckades
    if (!smsSent && !emailSent) {
      const receipt = quoteSendReceipt(smsSent, emailSent, recipients, [smsError, gmailError, ...followupErrors].filter(Boolean), Boolean(gmailError))
      return NextResponse.json({
        error: receipt.text, smsSent, emailSent, receipt,
      }, { status: 500 })
    }

    // Uppdatera offert-status
    const { data: statusRows, error: statusUpdateErr } = await supabase
      .from('quotes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .select('quote_id')

    if (statusUpdateErr || !statusRows?.length) {
      // Kritiskt: offert skickades via SMS/mail men status sparades inte
      console.error('[quotes/send] CRITICAL: Status-update failed after send:', statusUpdateErr)
      return NextResponse.json({
        success: true,
        smsSent, emailSent,
        warning: 'Offerten skickades men status kunde inte uppdateras. Ladda om sidan.',
        receipt: quoteSendReceipt(smsSent, emailSent, recipients, [smsError, gmailError, ...followupErrors, 'Offertstatus kunde inte sparas. Skicka inte igen.'].filter(Boolean)),
      })
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
      followupErrors.push('Utskicket är gjort men en pipelineändring kunde inte bekräftas.')
    }

    // Smart Communication-triggern för quote_sent är BORTTAGEN (Etapp 0,
    // 2026-08-27, Andreas-beslut): offerten är redan levererad ovan
    // (e-post/SMS); den globala communication_rule kunde skicka ett ANDRA
    // offert-SMS via setTimeout i en serverless-request — dubblett och
    // opålitligt. V3-events nedan är kvar (pipeline/regler).

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
      followupErrors.push('Utskicket är gjort men efterföljande automation kunde inte bekräftas.')
    }

    // OBS: portal-notisen för 'quote_sent' är BORTTAGEN här med flit. Den skickade
    // ett andra, minimalt mejl utöver det rika offertmejlet ovan → kunden fick
    // två mejl per offert. quote_sent-notisen anropades enbart härifrån, så den
    // rika mejlen är nu den enda offert-mejlen (on-brand + PDF-länk).

    // Golden Path: säkerställ att en deal finns (skapa-eller-länka) och flytta
    // den till "Offert skickad". Tidigare flyttades bara EN redan befintlig deal
    // → fristående offerter (skapade utan inkommande lead) syntes aldrig i
    // pipelinen. ensureDealForQuote dedup:ar mot kundens öppna deal och skapar
    // bara om ingen finns (aldrig utan kund).
    try {
      const { ensureDealForQuote, moveDeal } = await import('@/lib/pipeline')
      const deal = await ensureDealForQuote({
        businessId: business.business_id,
        quoteId,
        customerId: quote.customer_id,
        title: quote.title,
        value: quote.total,
      })
      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId: business.business_id,
          toStageSlug: 'quote_sent',
          triggeredBy: 'system',
          aiReason: 'Offert skickad till kund',
        })
      }
    } catch (err) {
      console.error('[quotes/send] ensureDealForQuote/moveDeal failed (non-blocking):', quoteId, err)
      followupErrors.push('Utskicket är gjort men affärens uppdatering kunde inte bekräftas.')
    }

    // Bygg svar
    const receipt = quoteSendReceipt(smsSent, emailSent, recipients, [smsError, gmailError, ...followupErrors].filter(Boolean))

    return NextResponse.json({
      success: true,
      message: receipt.text,
      warning: receipt.state === 'partial' ? receipt.text : undefined,
      smsSent,
      emailSent,
      sentVia: sentVia || undefined,
      receipt,
    })

  } catch (error: any) {
    console.error('Send quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
