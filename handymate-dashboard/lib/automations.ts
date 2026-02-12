import { getServerSupabase } from '@/lib/supabase'

export interface AutomationSettings {
  id: string
  business_id: string
  // AI & Calls
  ai_analyze_calls: boolean
  ai_create_leads: boolean
  ai_auto_move_deals: boolean
  ai_confidence_threshold: number
  // Pipeline
  pipeline_move_on_quote_sent: boolean
  pipeline_move_on_quote_accepted: boolean
  pipeline_move_on_invoice_sent: boolean
  pipeline_move_on_payment: boolean
  // SMS Communication
  sms_booking_confirmation: boolean
  sms_day_before_reminder: boolean
  sms_on_the_way: boolean
  sms_quote_followup: boolean
  sms_job_completed: boolean
  sms_invoice_reminder: boolean
  sms_review_request: boolean
  sms_auto_enabled: boolean
  sms_quiet_hours_start: string
  sms_quiet_hours_end: string
  sms_max_per_customer_week: number
  // Calendar
  calendar_sync_bookings: boolean
  calendar_create_from_booking: boolean
  // Fortnox
  fortnox_sync_invoices: boolean
  fortnox_sync_customers: boolean
}

const DEFAULT_SETTINGS: Omit<AutomationSettings, 'id' | 'business_id'> = {
  ai_analyze_calls: true,
  ai_create_leads: true,
  ai_auto_move_deals: true,
  ai_confidence_threshold: 80,
  pipeline_move_on_quote_sent: true,
  pipeline_move_on_quote_accepted: true,
  pipeline_move_on_invoice_sent: true,
  pipeline_move_on_payment: true,
  sms_booking_confirmation: true,
  sms_day_before_reminder: true,
  sms_on_the_way: true,
  sms_quote_followup: true,
  sms_job_completed: true,
  sms_invoice_reminder: true,
  sms_review_request: true,
  sms_auto_enabled: true,
  sms_quiet_hours_start: '21:00',
  sms_quiet_hours_end: '07:00',
  sms_max_per_customer_week: 3,
  calendar_sync_bookings: false,
  calendar_create_from_booking: true,
  fortnox_sync_invoices: false,
  fortnox_sync_customers: false,
}

export async function getAutomationSettings(businessId: string): Promise<AutomationSettings> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('automation_settings')
    .select('*')
    .eq('business_id', businessId)
    .single()

  if (data) return data as AutomationSettings

  return {
    id: '',
    business_id: businessId,
    ...DEFAULT_SETTINGS,
  }
}

export async function updateAutomationSettings(
  businessId: string,
  updates: Partial<AutomationSettings>
): Promise<AutomationSettings> {
  const supabase = getServerSupabase()

  // Remove id/business_id from updates
  const { id: _id, business_id: _bid, ...safeUpdates } = updates as any

  const { data, error } = await supabase
    .from('automation_settings')
    .upsert({
      business_id: businessId,
      ...safeUpdates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })
    .select()
    .single()

  if (error) throw error
  return data as AutomationSettings
}

export function isAutomationEnabled(
  settings: AutomationSettings,
  key: keyof Omit<AutomationSettings, 'id' | 'business_id' | 'ai_confidence_threshold' | 'sms_quiet_hours_start' | 'sms_quiet_hours_end' | 'sms_max_per_customer_week'>
): boolean {
  return settings[key] as boolean
}

export async function logAutomationActivity(params: {
  businessId: string
  automationType: string
  action: string
  description?: string
  metadata?: Record<string, any>
  status?: 'success' | 'failed' | 'skipped'
}): Promise<void> {
  const supabase = getServerSupabase()

  await supabase.from('automation_activity').insert({
    business_id: params.businessId,
    automation_type: params.automationType,
    action: params.action,
    description: params.description || null,
    metadata: params.metadata || {},
    status: params.status || 'success',
  })
}

// Map communication settings to centralized automation settings
export function syncCommunicationSettings(automationSettings: AutomationSettings) {
  return {
    auto_enabled: automationSettings.sms_auto_enabled,
    send_booking_confirmation: automationSettings.sms_booking_confirmation,
    send_day_before_reminder: automationSettings.sms_day_before_reminder,
    send_on_the_way: automationSettings.sms_on_the_way,
    send_quote_followup: automationSettings.sms_quote_followup,
    send_job_completed: automationSettings.sms_job_completed,
    send_invoice_reminder: automationSettings.sms_invoice_reminder,
    send_review_request: automationSettings.sms_review_request,
    quiet_hours_start: automationSettings.sms_quiet_hours_start,
    quiet_hours_end: automationSettings.sms_quiet_hours_end,
    max_sms_per_customer_per_week: automationSettings.sms_max_per_customer_week,
  }
}

// Map pipeline settings to centralized automation settings
export function syncPipelineSettings(automationSettings: AutomationSettings) {
  return {
    ai_analyze_calls: automationSettings.ai_analyze_calls,
    auto_create_leads: automationSettings.ai_create_leads,
    auto_move_on_quote: automationSettings.pipeline_move_on_quote_sent,
    auto_move_on_accept: automationSettings.pipeline_move_on_quote_accepted,
    auto_move_on_invoice: automationSettings.pipeline_move_on_invoice_sent,
    auto_move_on_payment: automationSettings.pipeline_move_on_payment,
    ai_auto_move_threshold: automationSettings.ai_confidence_threshold,
    ai_create_lead_threshold: Math.max(automationSettings.ai_confidence_threshold - 10, 50),
  }
}
