import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkPhoneApiRateLimit } from '@/lib/auth'

/**
 * GET - Lista tillgängliga telefonnummer från 46elks
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkPhoneApiRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const ELKS_API_USER = process.env.ELKS_API_USER
    const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

    if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
      return NextResponse.json({ error: 'Phone API not configured' }, { status: 503 })
    }

    const country = request.nextUrl.searchParams.get('country') || 'se'

    const response = await fetch(
      `https://api.46elks.com/a1/numbers?country=${country}&capabilities=voice,sms`,
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('46elks available numbers error:', error)
      return NextResponse.json({ error: 'Could not fetch available numbers' }, { status: 502 })
    }

    const data = await response.json()

    return NextResponse.json({
      numbers: data.data || [],
      country,
    })
  } catch (error: any) {
    console.error('Phone available error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
