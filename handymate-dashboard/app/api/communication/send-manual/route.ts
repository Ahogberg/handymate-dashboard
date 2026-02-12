import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkSmsRateLimit } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { sendSmartMessage } from '@/lib/smart-communication'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkSmsRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const { customerId, message, channel } = await request.json()

    if (!customerId || !message) {
      return NextResponse.json({ error: 'Missing customerId or message' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Get customer phone
    const { data: customer } = await supabase
      .from('customer')
      .select('phone_number, name')
      .eq('customer_id', customerId)
      .eq('business_id', business.business_id)
      .single()

    if (!customer?.phone_number) {
      return NextResponse.json({ error: 'Kunden saknar telefonnummer' }, { status: 400 })
    }

    const result = await sendSmartMessage({
      businessId: business.business_id,
      customerId,
      channel: channel || 'sms',
      recipient: customer.phone_number,
      message,
      aiReason: 'Manuellt skickat meddelande',
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Kunde inte skicka' }, { status: 500 })
    }

    return NextResponse.json({ success: true, logId: result.logId })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
