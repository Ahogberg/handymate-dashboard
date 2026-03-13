import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/automation/settings — Hämta V3 automationsinställningar
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id

  const { data, error } = await supabase
    .from('v3_automation_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return defaults if no row exists
  if (!data) {
    return NextResponse.json({
      business_id: businessId,
      work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      work_start: '07:00',
      work_end: '17:00',
      night_mode_enabled: true,
      night_queue_messages: true,
      min_job_value_sek: 0,
      max_distance_km: null,
      auto_reject_below_minimum: false,
      require_approval_send_quote: true,
      require_approval_send_invoice: true,
      require_approval_send_sms: false,
      require_approval_create_booking: false,
      lead_response_target_minutes: 30,
      quote_followup_days: 5,
      invoice_reminder_days: 7,
      call_handling_mode: 'agent_with_transfer',
    })
  }

  return NextResponse.json(data)
}

/**
 * PUT /api/automation/settings — Uppdatera V3 automationsinställningar
 */
export async function PUT(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const body = await request.json()

  // Remove fields that shouldn't be updated directly
  const { id: _id, business_id: _bid, created_at: _ca, ...updates } = body

  const { data, error } = await supabase
    .from('v3_automation_settings')
    .upsert(
      {
        business_id: businessId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
