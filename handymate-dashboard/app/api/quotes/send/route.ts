import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkSmsRateLimitDb, checkEmailRateLimitDb } from '@/lib/rate-limit-db'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { getOrCreatePortalLink } from '@/lib/portal-link'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import { fetchQuoteCreator } from '@/lib/quotes/fetch-quote-creator'
import { halsning } from '@/lib/customers/namn'
import { brandingFromConfig, type Branding } from '@/lib/branding/get-branding'
import { buildQuoteEmailHtml } from '@/lib/quotes/quote-email'

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

    return true
  } catch (error) {
    console.error('Email send error:', error)
    return false
  }
}

/**
 * Offertmailet — företagets varumärke via masterlayouten (lib/email-templates.ts).
 *
 * Varumärkeslagret 2026-09-07: den här funktionen löser bara VEM som står
 * som avsändare (skaparen före företaget) och lämnar sedan över till
 * buildQuoteEmailHtml. "Du betalar"-logiken bor i byggaren.
 */
function generateEmailHTML(
  quote: any,
  business: any,
  signUrl?: string,
  trackingPixelUrl?: string,
  creator?: { name?: string | null; phone?: string | null; email?: string | null } | null,
  pdfUrl?: string
): string {
  // business är hela business_config-raden (select('*')) → varumärke +
  // stämpel utan extra query. Kontaktuppgifter = offertens SKAPARE när den
  // finns (samma identitet som kunddokumentet visar), annars företagets.
  // `??` — en skapare med tomt telefonfält faller ändå tillbaka på företagets.
  // Layouten escapar varumärkesfälten själv — ingen förescapning här.
  const base = brandingFromConfig(business)
  const branding: Branding = {
    ...base,
    contactName: creator?.name || base.contactName,
    contactPhone: (creator?.phone ?? base.contactPhone) || undefined,
    contactEmail: (creator?.email ?? base.contactEmail) || undefined,
  }

  // Själva innehållet byggs av den rena byggaren (lib/quotes/quote-email.ts)
  // — samma funktion som inställningssidan "Så ser dina kunder dig"
  // förhandsvisar med, så det kunden får och det ägaren ser är ett och samma.
  return buildQuoteEmailHtml({
    branding,
    customerName: quote.customer?.name,
    quoteNumber: quote.quote_number,
    title: quote.title,
    description: quote.description,
    total: Number(quote.total),
    customerPays: quote.customer_pays,
    rotRutType: quote.rot_rut_type,
    validUntil: quote.valid_until,
    signUrl,
    pdfUrl,
    contactName: creator?.name,
    trackingPixelUrl,
  })
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
      .single()

    if (quoteError || !quote) {
      console.error('Quote fetch error:', quoteError, 'quoteId:', quoteId)
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Verifiera ägarskap: kolla att offertens business tillhör inloggad användare
    const { data: ownerCheck } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('business_id', quote.business_id)
      .eq('user_id', business.user_id)
      .maybeSingle()

    if (!ownerCheck) {
      // Fallback: kolla om det är samma e-post (multi-account scenario)
      const { data: emailCheck } = await supabase
        .from('business_config')
        .select('business_id')
        .eq('business_id', quote.business_id)
        .eq('contact_email', business.contact_email)
        .maybeSingle()

      if (!emailCheck) {
        return NextResponse.json({ error: 'Ingen behörighet för denna offert' }, { status: 403 })
      }
    }

    // 4-eyes check: kräv admin-godkännande för stora offerter
    const { data: fourEyesConfig } = await supabase
      .from('business_config')
      .select('four_eyes_enabled, four_eyes_threshold_sek')
      .eq('business_id', quote.business_id)
      .single()

    const quoteTotal = quote.total || quote.subtotal || 0
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
          extra_emails: extraEmails,
          bcc_emails: bccEmails,
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

    // Hämta kund separat (FK-relation osäker)
    let customer: any = null
    if (quote.customer_id) {
      const { data: c } = await supabase
        .from('customer')
        .select('*')
        .eq('customer_id', quote.customer_id)
        .single()
      // Sanering 2026-08-05: den gamla fallbacken mot "customers" var död —
      // tabellen finns inte (heter customer) — och slukade bara det riktiga
      // felmeddelandet när kunduppslaget misslyckades.
      customer = c
    }
    // Sätt customer på quote-objektet för bakåtkompatibilitet
    ;(quote as any).customer = customer

    if (!customer) {
      return NextResponse.json({ error: 'Ingen kund kopplad till offerten' }, { status: 400 })
    }

    // Hämta logo_url, swish_number och accent_color (varumärkesfärg för mejlet)
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('logo_url, swish_number, accent_color')
      .eq('business_id', business.business_id)
      .single()
    const businessWithLogo = { ...business, logo_url: bizConfig?.logo_url, swish_number: bizConfig?.swish_number, accent_color: bizConfig?.accent_color }

    // Offertens skapare (business_users) → mejlets kontaktuppgifter visar rätt
    // person, samma identitet som kunddokumentet. Null för gamla offerter.
    const emailCreator = await fetchQuoteCreator(supabase, quote.created_by)

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
      return NextResponse.json({ error: 'Kunde inte skapa portal-länk' }, { status: 500 })
    }
    const signUrl = portalUrl
    // t=sign_token krävs av /api/quotes/track sedan tenant-svepet 2026-09-01.
    const trackingPixelUrl = `${APP_URL}/api/quotes/track?q=${quoteId}&t=${encodeURIComponent(signToken)}&e=opened&s=${trackingSessionId}`

    let smsSent = false
    let emailSent = false
    let sentVia = ''
    let gmailError = ''
    let smsError = ''

    // SMS
    if (method === 'sms' || method === 'both') {
      if (!quote.customer.phone_number) {
        return NextResponse.json({ error: 'Kunden saknar telefonnummer' }, { status: 400 })
      }

      const suffix = buildSmsSuffix(business.business_name, business.assigned_phone_number)
      const smsMessage = `${halsning(quote.customer.name)}

Här kommer din offert från ${business.business_name}:

Totalt: ${formatCurrency(quote.total)} kr${rotText}
${quote.valid_until ? `Giltig till: ${new Date(quote.valid_until).toLocaleDateString('sv-SE')}\n` : ''}
Öppna din kundportal:
${portalUrl}

Frågor? Ring ${business.phone_number}
${suffix}`

      const smsResult = await sendSMS(supabase, business.business_id, quote.customer.phone_number, smsMessage, business.business_name, quote.customer_id, quoteId)
      smsSent = smsResult.sent
      smsError = smsResult.error || ''

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
          return NextResponse.json({ error: 'Kunden saknar email' }, { status: 400 })
        }
        // Om both och ingen email, fortsätt med bara SMS
      } else {
        const emailSubject = `Offert från ${business.business_name} — ${quote.title || 'Offert'}`
        const pdfUrl = `${APP_URL}/api/quotes/pdf?token=${signToken}&format=pdf`
        const emailHTML = generateEmailHTML(quote, businessWithLogo, signUrl, trackingPixelUrl, emailCreator, pdfUrl)
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
              bcc: bccEmails?.length > 0 ? bccEmails : undefined,
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
            bccEmails?.length > 0 ? bccEmails : undefined,
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
      const hint = [
        smsError ? `SMS misslyckades: ${smsError}.` : '',
        gmailError ? `Gmail misslyckades: ${gmailError}.` : '',
      ].filter(Boolean).join(' ')
      return NextResponse.json({
        error: `${hint ? hint + ' ' : ''}Kunde inte skicka offerten. Kontrollera att Gmail är kopplad i Inställningar eller att kundens mailadress stämmer.`
      }, { status: 500 })
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
      return NextResponse.json({
        success: true,
        smsSent, emailSent,
        warning: 'Offerten skickades men status kunde inte uppdateras. Ladda om sidan.',
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
    }

    // OBS: portal-notisen för 'quote_sent' är BORTTAGEN här med flit. Den skickade
    // ett andra, minimalt mejl utöver den rika generateEmailHTML ovan → kunden fick
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
    }

    // Bygg svar
    const sentMethods = []
    if (smsSent) sentMethods.push('SMS')
    if (emailSent) sentMethods.push('email')

    return NextResponse.json({
      success: true,
      message: `Offert skickad via ${sentMethods.join(' och ')}!`,
      smsSent,
      emailSent,
      sentVia: sentVia || undefined,
    })

  } catch (error: any) {
    console.error('Send quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
