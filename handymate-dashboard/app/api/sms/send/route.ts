import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkSmsRateLimit } from '@/lib/auth'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const rateLimit = checkSmsRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const { to, message } = await request.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 })
    }

    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: (business.business_name || 'Handymate').substring(0, 11),
        to: to,
        message: message,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json({ error: result.message || 'SMS failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: result.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
