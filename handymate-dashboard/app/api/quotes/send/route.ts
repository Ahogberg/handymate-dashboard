import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness, checkSmsRateLimit, checkEmailRateLimit } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
const RESEND_API_KEY = process.env.RESEND_API_KEY

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
        from: from.substring(0, 11),
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
  to: string,
  subject: string,
  htmlContent: string,
  fromName: string,
  replyTo?: string
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('Resend API key not configured, skipping email')
    return false
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <offert@handymate.se>`,
        to: [to],
        subject: subject,
        html: htmlContent,
        reply_to: replyTo,
      }),
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
function generateEmailHTML(quote: any, business: any): string {
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
    <div style="background: linear-gradient(135deg, #8b5cf6, #d946ef); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
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
      <div style="background: #f8f4ff; border-left: 4px solid #8b5cf6; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
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
        Offerten är giltig till <strong>${formatDate(quote.valid_until)}</strong>
      </p>

      <!-- CTA -->
      <div style="text-align: center; margin: 30px 0;">
        <p style="color: #444; margin-bottom: 15px;">
          Har du frågor eller vill boka? Kontakta oss:
        </p>
        <a href="tel:${business.phone_number}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Ring ${business.phone_number}
        </a>
      </div>

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
</body>
</html>
  `
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const { quoteId, method } = await request.json()

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    // Rate limit check
    if (method === 'sms' || method === 'both') {
      const smsLimit = checkSmsRateLimit(business.business_id)
      if (!smsLimit.allowed) {
        return NextResponse.json({ error: smsLimit.error }, { status: 429 })
      }
    }
    if (method === 'email' || method === 'both') {
      const emailLimit = checkEmailRateLimit(business.business_id)
      if (!emailLimit.allowed) {
        return NextResponse.json({ error: emailLimit.error }, { status: 429 })
      }
    }

    // Hämta offert med kundinfo och verifiera ägarskap
    const { data: quote } = await supabase
      .from('quotes')
      .select('*, customer(*)')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (!quote.customer) {
      return NextResponse.json({ error: 'No customer on quote' }, { status: 400 })
    }

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)
    }

    const customerPays = quote.rot_rut_type ? quote.customer_pays : quote.total
    const rotText = quote.rot_rut_type ? ` (efter ${quote.rot_rut_type.toUpperCase()}: ${formatCurrency(customerPays)} kr)` : ''

    let smsSent = false
    let emailSent = false

    // SMS
    if (method === 'sms' || method === 'both') {
      if (!quote.customer.phone_number) {
        return NextResponse.json({ error: 'Kunden saknar telefonnummer' }, { status: 400 })
      }

      const smsMessage = `Hej ${quote.customer.name}!

Här kommer din offert från ${business.business_name}:

${quote.title || 'Offert'}
Totalt: ${formatCurrency(quote.total)} kr${rotText}
Giltig till: ${new Date(quote.valid_until).toLocaleDateString('sv-SE')}

Frågor? Ring ${business.phone_number}

//${business.business_name}`

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
          return NextResponse.json({ error: 'Kunden saknar email' }, { status: 400 })
        }
        // Om both och ingen email, fortsätt med bara SMS
      } else {
        const emailSubject = `Offert från ${business.business_name}: ${quote.title || 'Offert'}`
        const emailHTML = generateEmailHTML(quote, business)

        emailSent = await sendEmail(
          quote.customer.email,
          emailSubject,
          emailHTML,
          business.business_name,
          business.contact_email || undefined
        )

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
      return NextResponse.json({
        error: 'Kunde inte skicka offerten. Kontrollera att SMS/Email är konfigurerat.'
      }, { status: 500 })
    }

    // Uppdatera offert-status
    await supabase
      .from('quotes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('quote_id', quoteId)

    // Bygg svar
    const sentMethods = []
    if (smsSent) sentMethods.push('SMS')
    if (emailSent) sentMethods.push('email')

    return NextResponse.json({
      success: true,
      message: `Offert skickad via ${sentMethods.join(' och ')}!`,
      smsSent,
      emailSent
    })

  } catch (error: any) {
    console.error('Send quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
