import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkSmsRateLimit } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  resolveMessageVariables,
  interpolateMessage,
  sendSmartMessage,
} from '@/lib/smart-communication'

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

    const { customerId, ruleId, extraVariables } = await request.json()

    if (!customerId || !ruleId) {
      return NextResponse.json({ error: 'Missing customerId or ruleId' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Get the rule
    const { data: rule } = await supabase
      .from('communication_rule')
      .select('*')
      .eq('id', ruleId)
      .single()

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    // Get customer phone
    const { data: customer } = await supabase
      .from('customer')
      .select('phone_number')
      .eq('customer_id', customerId)
      .eq('business_id', business.business_id)
      .single()

    if (!customer?.phone_number) {
      return NextResponse.json({ error: 'Kunden saknar telefonnummer' }, { status: 400 })
    }

    // Resolve variables and interpolate
    const variables = await resolveMessageVariables({
      businessId: business.business_id,
      customerId,
      extraVariables: extraVariables || {},
    })
    const message = interpolateMessage(rule.message_template, variables)

    const result = await sendSmartMessage({
      businessId: business.business_id,
      customerId,
      ruleId: rule.id,
      channel: 'sms',
      recipient: customer.phone_number,
      message,
      aiReason: `Manuellt triggad: ${rule.name}`,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Kunde inte skicka' }, { status: 500 })
    }

    return NextResponse.json({ success: true, logId: result.logId, message })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
