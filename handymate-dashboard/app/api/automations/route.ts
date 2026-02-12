import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAutomationSettings, updateAutomationSettings } from '@/lib/automations'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await getAutomationSettings(business.business_id)

    // Get integration status
    const { getServerSupabase } = await import('@/lib/supabase')
    const supabase = getServerSupabase()

    const { data: config } = await supabase
      .from('business_config')
      .select('assigned_phone_number, fortnox_access_token, google_calendar_token')
      .eq('business_id', business.business_id)
      .single()

    const integrations = {
      phone_connected: !!config?.assigned_phone_number,
      fortnox_connected: !!config?.fortnox_access_token,
      google_calendar_connected: !!config?.google_calendar_token,
    }

    // Get recent stats
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 7)

    const { count: smsCount } = await supabase
      .from('communication_log')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .gte('created_at', weekStart.toISOString())
      .in('status', ['sent', 'delivered'])

    const { count: leadsCreated } = await supabase
      .from('pipeline_activity')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .eq('activity_type', 'deal_created')
      .gte('created_at', weekStart.toISOString())

    const { count: dealsMoved } = await supabase
      .from('pipeline_activity')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .eq('activity_type', 'stage_changed')
      .eq('triggered_by', 'system')
      .gte('created_at', weekStart.toISOString())

    return NextResponse.json({
      settings,
      integrations,
      stats: {
        sms_sent_week: smsCount || 0,
        leads_created_week: leadsCreated || 0,
        deals_moved_week: dealsMoved || 0,
      },
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
    const settings = await updateAutomationSettings(business.business_id, body)

    // Sync communication_settings table for backwards compatibility
    const { getServerSupabase } = await import('@/lib/supabase')
    const supabase = getServerSupabase()

    await supabase.from('communication_settings').upsert({
      business_id: business.business_id,
      auto_enabled: settings.sms_auto_enabled,
      send_booking_confirmation: settings.sms_booking_confirmation,
      send_day_before_reminder: settings.sms_day_before_reminder,
      send_on_the_way: settings.sms_on_the_way,
      send_quote_followup: settings.sms_quote_followup,
      send_job_completed: settings.sms_job_completed,
      send_invoice_reminder: settings.sms_invoice_reminder,
      send_review_request: settings.sms_review_request,
      quiet_hours_start: settings.sms_quiet_hours_start,
      quiet_hours_end: settings.sms_quiet_hours_end,
      max_sms_per_customer_per_week: settings.sms_max_per_customer_week,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })

    // Sync pipeline_automation table for backwards compatibility
    await supabase.from('pipeline_automation').upsert({
      business_id: business.business_id,
      ai_analyze_calls: settings.ai_analyze_calls,
      auto_create_leads: settings.ai_create_leads,
      auto_move_on_quote: settings.pipeline_move_on_quote_sent,
      auto_move_on_accept: settings.pipeline_move_on_quote_accepted,
      auto_move_on_invoice: settings.pipeline_move_on_invoice_sent,
      auto_move_on_payment: settings.pipeline_move_on_payment,
      ai_auto_move_threshold: settings.ai_confidence_threshold,
      ai_create_lead_threshold: Math.max(settings.ai_confidence_threshold - 10, 50),
    }, { onConflict: 'business_id' })

    return NextResponse.json({ success: true, settings })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
