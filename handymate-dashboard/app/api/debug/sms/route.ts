import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isAdmin } from '@/lib/admin-auth'

/**
 * POST /api/debug/sms — Test-SMS till hantverkarens eget nummer
 * Kräver admin-auth i produktion (skyddar mot missbruk av SMS-kostnader).
 */
export async function POST(request: NextRequest) {
  // I produktion: endast admins får trigga debug-endpoints
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

  const ELKS_API_USER = process.env.ELKS_API_USER
  const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

  // Diagnostik: kolla env-variabler
  const diagnostics: Record<string, string> = {
    ELKS_API_USER: ELKS_API_USER ? `✅ Set (${ELKS_API_USER.substring(0, 4)}...)` : '❌ Saknas',
    ELKS_API_PASSWORD: ELKS_API_PASSWORD ? `✅ Set (${ELKS_API_PASSWORD.length} tecken)` : '❌ Saknas',
    RESEND_API_KEY: process.env.RESEND_API_KEY ? '✅ Set' : '❌ Saknas',
    RESEND_DOMAIN: process.env.RESEND_DOMAIN || 'handymate.se (default)',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Saknas',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Saknas',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Saknas',
  }

  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    return NextResponse.json({
      error: '46elks-credentials saknas i miljövariabler',
      diagnostics,
    }, { status: 500 })
  }

  // Hämta mottagarnummer
  const body = await request.json().catch(() => ({}))
  const to = body.to || business.phone_number || (business as any).personal_phone

  if (!to) {
    return NextResponse.json({
      error: 'Inget telefonnummer att skicka till — fyll i phone_number i business_config',
      diagnostics,
    }, { status: 400 })
  }

  // Formatera till E.164
  const formatPhone = (num: string): string => {
    const clean = num.replace(/[\s\-()]/g, '')
    if (clean.startsWith('0')) return '+46' + clean.slice(1)
    return clean.startsWith('+') ? clean : '+' + clean
  }

  const formattedTo = formatPhone(to)
  const testMessage = `Test från Handymate! Om du ser detta fungerar SMS-utskick korrekt. ${new Date().toLocaleTimeString('sv-SE')}`

  console.log('[debug/sms] Skickar till:', formattedTo)
  console.log('[debug/sms] Auth:', ELKS_API_USER.substring(0, 4) + '...')

  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: (business.business_name || 'Handymate').substring(0, 11),
        to: formattedTo,
        message: testMessage,
      }),
    })

    const responseText = await response.text()
    console.log('[debug/sms] 46elks status:', response.status)
    console.log('[debug/sms] 46elks response:', responseText)

    let result: any
    try {
      result = JSON.parse(responseText)
    } catch {
      result = { raw: responseText }
    }

    if (!response.ok) {
      return NextResponse.json({
        error: `46elks returnerade ${response.status}`,
        elks_response: result,
        diagnostics,
        sent_to: formattedTo,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Test-SMS skickat till ${formattedTo}`,
      elks_id: result.id,
      elks_response: result,
      diagnostics,
    })
  } catch (err: any) {
    console.error('[debug/sms] Exception:', err)
    return NextResponse.json({
      error: err.message,
      diagnostics,
    }, { status: 500 })
  }
}
