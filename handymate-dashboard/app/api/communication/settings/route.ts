import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data } = await supabase
      .from('communication_settings')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    // Return defaults if none exist
    return NextResponse.json(data || {
      business_id: business.business_id,
      auto_enabled: true,
      tone: 'friendly',
      max_sms_per_customer_per_week: 3,
      send_booking_confirmation: true,
      send_day_before_reminder: true,
      send_on_the_way: true,
      send_quote_followup: true,
      send_job_completed: true,
      send_invoice_reminder: true,
      send_review_request: true,
      quiet_hours_start: '21:00',
      quiet_hours_end: '07:00',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getServerSupabase()

    const allowedFields = [
      'auto_enabled', 'tone', 'max_sms_per_customer_per_week',
      'send_booking_confirmation', 'send_day_before_reminder',
      'send_on_the_way', 'send_quote_followup', 'send_job_completed',
      'send_invoice_reminder', 'send_review_request',
      'quiet_hours_start', 'quiet_hours_end',
    ]

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    const { data, error } = await supabase
      .from('communication_settings')
      .upsert({
        business_id: business.business_id,
        ...updates,
      }, { onConflict: 'business_id' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
