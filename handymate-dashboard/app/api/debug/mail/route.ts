import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/debug/mail — Test-mail till hantverkarens email
 * Kräver admin i produktion (skyddar mot missbruk).
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Endast för admin i produktion' }, { status: 403 })
    }
  }

  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const body = await request.json().catch(() => ({}))
  const to = body.to || business.contact_email

  if (!to) {
    return NextResponse.json({ error: 'Ingen mailadress att skicka till' }, { status: 400 })
  }

  const results: Record<string, any> = {
    recipient: to,
    gmail: { tested: false },
    resend: { tested: false },
    diagnostics: {
      RESEND_API_KEY: process.env.RESEND_API_KEY ? '✅ Set' : '❌ Saknas',
      RESEND_DOMAIN: process.env.RESEND_DOMAIN || 'handymate.se (default)',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Saknas',
    },
  }

  // Test 1: Gmail OAuth
  try {
    const { sendViaGmail, isGmailSendEnabled } = await import('@/lib/gmail-send')
    const gmailStatus = await isGmailSendEnabled(business.business_id)

    results.gmail.enabled = gmailStatus.enabled
    results.gmail.email = gmailStatus.email

    if (gmailStatus.enabled && gmailStatus.email) {
      results.gmail.tested = true
      const sent = await sendViaGmail(business.business_id, {
        to: [to],
        subject: `Test-mail från ${business.business_name || 'Handymate'}`,
        html: `<p>Detta är ett testmail.</p><p>Om du ser detta fungerar Gmail-utskick korrekt.</p><p>Skickat: ${new Date().toLocaleString('sv-SE')}</p>`,
        fromName: business.business_name || 'Handymate',
        fromEmail: gmailStatus.email,
      })
      results.gmail.success = sent
      if (!sent) {
        results.gmail.error = 'sendViaGmail returnerade false — token kan ha gått ut'
      }
    } else {
      results.gmail.skipped = 'Gmail-sändning ej aktiverad'

      // Kolla calendar_connection för mer info
      const { data: conn } = await supabase
        .from('calendar_connection')
        .select('gmail_scope_granted, gmail_send_scope_granted, gmail_sync_enabled, account_email')
        .eq('business_id', business.business_id)
        .maybeSingle()

      results.gmail.calendar_connection = conn ? {
        gmail_scope_granted: conn.gmail_scope_granted,
        gmail_send_scope_granted: conn.gmail_send_scope_granted,
        gmail_sync_enabled: conn.gmail_sync_enabled,
        account_email: conn.account_email,
      } : 'Ingen calendar_connection hittad'

      // Kolla business_config
      const { data: biz } = await supabase
        .from('business_config')
        .select('gmail_send_enabled, gmail_email, google_access_token, google_refresh_token')
        .eq('business_id', business.business_id)
        .single()

      results.gmail.business_config = {
        gmail_send_enabled: biz?.gmail_send_enabled,
        gmail_email: biz?.gmail_email,
        has_access_token: !!biz?.google_access_token,
        has_refresh_token: !!biz?.google_refresh_token,
      }
    }
  } catch (err: any) {
    results.gmail.tested = true
    results.gmail.error = err.message
  }

  // Test 2: Resend (fallback)
  if (!results.gmail.success) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY
    if (!RESEND_API_KEY) {
      results.resend.error = 'RESEND_API_KEY saknas'
    } else {
      results.resend.tested = true
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${business.business_name || 'Handymate'} <offert@${process.env.RESEND_DOMAIN || 'handymate.se'}>`,
            to: [to],
            subject: `Test-mail från ${business.business_name || 'Handymate'} (Resend)`,
            html: `<p>Detta är ett testmail via Resend.</p><p>Om du ser detta fungerar mail-utskick korrekt.</p><p>Skickat: ${new Date().toLocaleString('sv-SE')}</p>`,
          }),
        })

        const resendBody = await res.text()
        results.resend.status = res.status
        results.resend.success = res.ok
        try {
          results.resend.response = JSON.parse(resendBody)
        } catch {
          results.resend.response = resendBody
        }
      } catch (err: any) {
        results.resend.error = err.message
      }
    }
  }

  const anySuccess = results.gmail.success || results.resend.success

  return NextResponse.json({
    success: anySuccess,
    message: anySuccess
      ? `Test-mail skickat till ${to} via ${results.gmail.success ? 'Gmail' : 'Resend'}`
      : 'Misslyckades att skicka via både Gmail och Resend',
    ...results,
  }, { status: anySuccess ? 200 : 500 })
}
