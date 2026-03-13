/**
 * V3 Automation Engine
 *
 * Core engine for rule-based automation. Three main exports:
 * - executeRule()         — run a single rule with settings validation
 * - evaluateThresholds()  — check all threshold rules for a business
 * - fireEvent()           — dispatch an event to matching event rules
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ── Types ───────────────────────────────────────────────

export interface AutomationRule {
  id: string
  business_id: string
  name: string
  description: string | null
  is_active: boolean
  is_system: boolean
  trigger_type: 'cron' | 'event' | 'threshold' | 'manual'
  trigger_config: Record<string, unknown>
  action_type: string
  action_config: Record<string, unknown>
  requires_approval: boolean
  respects_work_hours: boolean
  respects_night_mode: boolean
  run_count: number
  last_run_at: string | null
  last_run_status: string | null
  created_at: string
  updated_at: string
}

export interface AutomationSettingsV3 {
  id: string
  business_id: string
  work_days: string[]
  work_start: string
  work_end: string
  night_mode_enabled: boolean
  night_queue_messages: boolean
  min_job_value_sek: number
  max_distance_km: number | null
  auto_reject_below_minimum: boolean
  require_approval_send_quote: boolean
  require_approval_send_invoice: boolean
  require_approval_send_sms: boolean
  require_approval_create_booking: boolean
  lead_response_target_minutes: number
  quote_followup_days: number
  invoice_reminder_days: number
}

interface ExecutionContext {
  [key: string]: unknown
}

type LogStatus = 'success' | 'pending_approval' | 'rejected' | 'skipped' | 'failed'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET || ''

// ── Helpers ─────────────────────────────────────────────

function getSwedenTime(): { hour: number; minute: number; dayName: string } {
  const now = new Date()
  const hour = parseInt(
    new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Stockholm' }).format(now)
  )
  const minute = parseInt(
    new Intl.DateTimeFormat('sv-SE', { minute: 'numeric', timeZone: 'Europe/Stockholm' }).format(now)
  )
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Stockholm' })
    .format(now)
    .toLowerCase()
  return { hour, minute, dayName }
}

function isWithinWorkHours(settings: AutomationSettingsV3): boolean {
  const { hour, minute, dayName } = getSwedenTime()

  // Check day
  if (!settings.work_days.includes(dayName)) return false

  // Parse work hours
  const [startH, startM] = settings.work_start.split(':').map(Number)
  const [endH, endM] = settings.work_end.split(':').map(Number)
  const currentMinutes = hour * 60 + minute
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes
}

function isNightTime(): boolean {
  const { hour } = getSwedenTime()
  return hour >= 21 || hour < 7
}

async function getSettings(supabase: SupabaseClient, businessId: string): Promise<AutomationSettingsV3> {
  const { data } = await supabase
    .from('v3_automation_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  if (data) return data as AutomationSettingsV3

  // Return defaults if no row exists
  return {
    id: '',
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
  }
}

async function logExecution(
  supabase: SupabaseClient,
  params: {
    businessId: string
    ruleId: string | null
    ruleName: string
    triggerType: string
    actionType: string
    status: LogStatus
    context?: ExecutionContext
    result?: Record<string, unknown>
    errorMessage?: string
    approvalId?: string
  }
): Promise<void> {
  try {
    await supabase.from('v3_automation_logs').insert({
      business_id: params.businessId,
      rule_id: params.ruleId,
      rule_name: params.ruleName,
      trigger_type: params.triggerType,
      action_type: params.actionType,
      status: params.status,
      context: params.context || {},
      result: params.result || {},
      error_message: params.errorMessage || null,
      approval_id: params.approvalId || null,
    })
  } catch (err: unknown) {
    console.error('[automation-engine] Failed to log execution:', err)
  }
}

async function updateRuleStats(
  supabase: SupabaseClient,
  ruleId: string,
  status: string
): Promise<void> {
  // Increment run_count and update last_run_at/status via raw RPC
  // Using two-step approach since supabase-js doesn't support increment easily
  const { data: rule } = await supabase
    .from('v3_automation_rules')
    .select('run_count')
    .eq('id', ruleId)
    .single()

  await supabase
    .from('v3_automation_rules')
    .update({
      run_count: (rule?.run_count || 0) + 1,
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ruleId)
}

// ── Action Handlers ─────────────────────────────────────

async function handleSendSms(
  supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const template = config.template as string || ''
  let message = template

  // Template variable replacement
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string' || typeof value === 'number') {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
    }
  }

  // Get business name for template
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', businessId)
    .single()

  message = message.replace(/\{\{business_name\}\}/g, business?.business_name || 'Handymate')

  const to = (context.phone as string) || (context.customer_phone as string)
  if (!to) {
    return { success: false, error: 'Inget telefonnummer i kontext' }
  }

  // Use the internal SMS API
  try {
    const res = await fetch(`${APP_URL}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, to, message }),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: result.error || `HTTP ${res.status}` }
    return { success: true, data: { to, message_preview: message.substring(0, 80) } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'SMS send failed'
    return { success: false, error: msg }
  }
}

async function handleSendEmail(
  _supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const to = (context.email as string) || (context.customer_email as string)
  if (!to) return { success: false, error: 'Ingen e-postadress i kontext' }

  const subject = (config.subject as string) || 'Meddelande'
  const body = (config.body as string) || ''

  try {
    const res = await fetch(`${APP_URL}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, to, subject, body }),
    })
    if (!res.ok) return { success: false, error: `E-post misslyckades: HTTP ${res.status}` }
    return { success: true, data: { to, subject } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Email send failed'
    return { success: false, error: msg }
  }
}

async function handleRunAgent(
  _supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  ruleName: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const instruction = (config.instruction as string) || ''

  try {
    const res = await fetch(`${APP_URL}/api/agent/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': CRON_SECRET,
      },
      body: JSON.stringify({
        business_id: businessId,
        trigger_type: 'automation_rule',
        trigger_data: {
          instruction,
          rule_name: ruleName,
          ...context,
        },
        idempotency_key: `rule-${ruleName}-${new Date().toISOString().slice(0, 10)}`,
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: result.error || `Agent HTTP ${res.status}` }
    return { success: true, data: { run_id: result.run_id, steps: result.steps } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Agent trigger failed'
    return { success: false, error: msg }
  }
}

async function handleCreateApproval(
  supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const title = (config.title as string) || 'Godkännande krävs'
  const description = (config.description as string) || ''

  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  const { error } = await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: (config.approval_type as string) || 'automation',
    title,
    description,
    payload: context,
    status: 'pending',
    risk_level: 'medium',
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  })

  if (error) return { success: false, error: error.message }

  // Send push notification
  fetch(`${APP_URL}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      title: 'Godkännande krävs',
      body: title,
      url: '/dashboard/approvals',
    }),
  }).catch(() => {})

  return { success: true, data: { approval_id: id, title } }
}

async function handleUpdateStatus(
  supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const stageKey = config.stage_key as string | undefined

  // V4 Pipeline: om stage_key finns, flytta lead i pipeline_stages
  if (stageKey) {
    const leadId = (context.lead_id as string) || (context.entity_id as string)
    if (!leadId) {
      return { success: false, error: 'lead_id saknas i kontext för pipeline-flytt' }
    }

    try {
      const { moveLeadToStage } = await import('@/lib/pipeline-stages')
      const result = await moveLeadToStage({
        businessId,
        leadId,
        toStageKey: stageKey,
        triggeredBy: 'automation',
      })

      if (!result.moved) {
        return { success: false, error: result.reason || 'Pipeline-flytt misslyckades' }
      }

      // Logga övergången i automation_logs context
      return {
        success: true,
        data: {
          entity: 'lead',
          entity_id: leadId,
          from_stage: result.from_stage,
          to_stage: result.to_stage,
          pipeline_move: true,
        },
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pipeline-flytt kraschade'
      return { success: false, error: msg }
    }
  }

  // Fallback: vanlig status-uppdatering (legacy)
  const entity = (config.entity as string) || (context.entity as string)
  const entityId = (context.entity_id as string) || (config.entity_id as string)
  const newStatus = (config.new_status as string) || ''

  if (!entity || !entityId || !newStatus) {
    return { success: false, error: 'entity, entity_id och new_status krävs' }
  }

  const tableMap: Record<string, { table: string; idCol: string; statusCol: string }> = {
    lead: { table: 'leads', idCol: 'lead_id', statusCol: 'status' },
    quote: { table: 'quote', idCol: 'quote_id', statusCol: 'status' },
    invoice: { table: 'invoice', idCol: 'invoice_id', statusCol: 'status' },
    booking: { table: 'booking', idCol: 'booking_id', statusCol: 'status' },
    customer: { table: 'customer', idCol: 'customer_id', statusCol: 'job_status' },
  }

  const mapping = tableMap[entity]
  if (!mapping) return { success: false, error: `Okänd entitet: ${entity}` }

  const { error } = await supabase
    .from(mapping.table)
    .update({ [mapping.statusCol]: newStatus, updated_at: new Date().toISOString() })
    .eq(mapping.idCol, entityId)
    .eq('business_id', businessId)

  if (error) return { success: false, error: error.message }
  return { success: true, data: { entity, entity_id: entityId, new_status: newStatus } }
}

async function handleNotifyOwner(
  _supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  _context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const title = (config.title as string) || 'Notis'
  const body = (config.body as string) || ''

  try {
    await fetch(`${APP_URL}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        title,
        body,
        url: (config.url as string) || '/dashboard',
      }),
    })
    return { success: true, data: { title } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Push failed'
    return { success: false, error: msg }
  }
}

async function handleRejectLead(
  supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const leadId = context.lead_id as string
  if (!leadId) return { success: false, error: 'lead_id saknas i kontext' }

  // Update lead status
  await supabase
    .from('leads')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('business_id', businessId)

  // Send rejection SMS if template provided and phone available
  if (config.sms_template && context.phone) {
    await handleSendSms(supabase, businessId, { template: config.sms_template }, context)
  }

  return { success: true, data: { lead_id: leadId, status: 'rejected' } }
}

async function handleGenerateQuote(
  _supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  // Delegate to agent for quote generation
  return handleRunAgent(_supabase, businessId, {
    instruction: (config.instruction as string) || `Generera offert baserat på kontext: ${JSON.stringify(context)}`,
  }, context, 'Offertgenerering')
}

async function handleCreateBooking(
  _supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  return handleRunAgent(_supabase, businessId, {
    instruction: (config.instruction as string) || `Skapa bokning baserat på kontext: ${JSON.stringify(context)}`,
  }, context, 'Bokningsskapande')
}

async function handleScheduleFollowup(
  supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  // Log a future action as an inbox item or note
  const daysUntil = (config.days_until as number) || 1
  const followupDate = new Date()
  followupDate.setDate(followupDate.getDate() + daysUntil)

  const description = (config.description as string) || 'Uppföljning schemalagd'

  const { error: insertErr } = await supabase.from('inbox_item').insert({
    business_id: businessId,
    type: 'followup',
    title: description,
    description: `Automatisk uppföljning från regel. Kontext: ${JSON.stringify(context).substring(0, 500)}`,
    priority: 'medium',
    scheduled_at: followupDate.toISOString(),
  })
  if (insertErr) console.error('[automation-engine] Failed to create followup:', insertErr.message)

  return { success: true, data: { followup_date: followupDate.toISOString(), description } }
}

// ── Main action dispatcher ──────────────────────────────

async function executeAction(
  supabase: SupabaseClient,
  businessId: string,
  actionType: string,
  actionConfig: Record<string, unknown>,
  context: ExecutionContext,
  ruleName: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  switch (actionType) {
    case 'send_sms':
      return handleSendSms(supabase, businessId, actionConfig, context)
    case 'send_email':
      return handleSendEmail(supabase, businessId, actionConfig, context)
    case 'run_agent':
      return handleRunAgent(supabase, businessId, actionConfig, context, ruleName)
    case 'create_approval':
      return handleCreateApproval(supabase, businessId, actionConfig, context)
    case 'update_status':
      return handleUpdateStatus(supabase, businessId, actionConfig, context)
    case 'notify_owner':
      return handleNotifyOwner(supabase, businessId, actionConfig, context)
    case 'reject_lead':
      return handleRejectLead(supabase, businessId, actionConfig, context)
    case 'generate_quote':
      return handleGenerateQuote(supabase, businessId, actionConfig, context)
    case 'create_booking':
      return handleCreateBooking(supabase, businessId, actionConfig, context)
    case 'schedule_followup':
      return handleScheduleFollowup(supabase, businessId, actionConfig, context)
    default:
      return { success: false, error: `Okänd åtgärdstyp: ${actionType}` }
  }
}

// ── Public API ──────────────────────────────────────────

/**
 * Execute a single automation rule.
 * Validates settings, checks work hours/night mode, handles approvals.
 */
export async function executeRule(
  supabase: SupabaseClient,
  ruleId: string,
  context: ExecutionContext = {}
): Promise<{ status: LogStatus; data?: Record<string, unknown>; error?: string }> {
  // 1. Fetch rule
  const { data: rule, error: ruleErr } = await supabase
    .from('v3_automation_rules')
    .select('*')
    .eq('id', ruleId)
    .single()

  if (ruleErr || !rule) {
    return { status: 'failed', error: `Regel hittades inte: ${ruleId}` }
  }

  const typedRule = rule as AutomationRule

  // 2. Check if active
  if (!typedRule.is_active) {
    return { status: 'skipped', data: { reason: 'Regeln är inaktiv' } }
  }

  // 3. Get settings
  const settings = await getSettings(supabase, typedRule.business_id)

  // 4. Check work hours
  if (typedRule.respects_work_hours && !isWithinWorkHours(settings)) {
    await logExecution(supabase, {
      businessId: typedRule.business_id,
      ruleId: typedRule.id,
      ruleName: typedRule.name,
      triggerType: typedRule.trigger_type,
      actionType: typedRule.action_type,
      status: 'skipped',
      context,
      result: { reason: 'Utanför arbetstider' },
    })
    return { status: 'skipped', data: { reason: 'Utanför arbetstider' } }
  }

  // 5. Night mode check for SMS
  if (typedRule.respects_night_mode && settings.night_mode_enabled && isNightTime()) {
    if (typedRule.action_type === 'send_sms' || typedRule.action_type === 'send_email') {
      await logExecution(supabase, {
        businessId: typedRule.business_id,
        ruleId: typedRule.id,
        ruleName: typedRule.name,
        triggerType: typedRule.trigger_type,
        actionType: typedRule.action_type,
        status: 'skipped',
        context,
        result: { reason: 'Nattspärr aktiv' },
      })
      return { status: 'skipped', data: { reason: 'Nattspärr aktiv' } }
    }
  }

  // 6. If requires_approval → create approval instead of executing
  if (typedRule.requires_approval && typedRule.action_type !== 'create_approval') {
    const approvalResult = await handleCreateApproval(supabase, typedRule.business_id, {
      title: typedRule.name,
      description: typedRule.description || '',
      approval_type: 'automation',
    }, { ...context, rule_id: ruleId, rule_action_type: typedRule.action_type, rule_action_config: typedRule.action_config })

    await logExecution(supabase, {
      businessId: typedRule.business_id,
      ruleId: typedRule.id,
      ruleName: typedRule.name,
      triggerType: typedRule.trigger_type,
      actionType: typedRule.action_type,
      status: 'pending_approval',
      context,
      result: approvalResult.data,
      approvalId: approvalResult.data?.approval_id as string,
    })
    await updateRuleStats(supabase, typedRule.id, 'pending_approval')

    return { status: 'pending_approval', data: approvalResult.data }
  }

  // 7. Execute action
  const result = await executeAction(
    supabase,
    typedRule.business_id,
    typedRule.action_type,
    typedRule.action_config,
    context,
    typedRule.name
  )

  const status: LogStatus = result.success ? 'success' : 'failed'

  // 8. Log execution
  await logExecution(supabase, {
    businessId: typedRule.business_id,
    ruleId: typedRule.id,
    ruleName: typedRule.name,
    triggerType: typedRule.trigger_type,
    actionType: typedRule.action_type,
    status,
    context,
    result: result.data,
    errorMessage: result.error,
  })

  // 9. Update rule stats
  await updateRuleStats(supabase, typedRule.id, status)

  return { status, data: result.data, error: result.error }
}

/**
 * Evaluate all threshold rules for a business.
 * Queries relevant entities and checks conditions.
 * Deduplicates: won't re-fire the same rule+entity combo within 24h.
 */
export async function evaluateThresholds(
  supabase: SupabaseClient,
  businessId: string
): Promise<{ evaluated: number; triggered: number; errors: number }> {
  let evaluated = 0
  let triggered = 0
  let errors = 0

  // Fetch active threshold rules
  const { data: rules } = await supabase
    .from('v3_automation_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('trigger_type', 'threshold')

  if (!rules || rules.length === 0) return { evaluated, triggered, errors }

  const today = new Date().toISOString().slice(0, 10)

  for (const rule of rules as AutomationRule[]) {
    evaluated++
    const config = rule.trigger_config
    const entity = config.entity as string
    const field = config.field as string
    const operator = config.operator as string
    const value = config.value as number

    try {
      const matchingEntities = await queryThresholdEntities(
        supabase, businessId, entity, field, operator, value
      )

      for (const entityItem of matchingEntities) {
        const entityId = entityItem.id as string
        const dedupKey = `${rule.id}:${entityId}`

        // Dedup: check if already run today
        const { data: existingLog } = await supabase
          .from('v3_automation_logs')
          .select('id')
          .eq('rule_id', rule.id)
          .eq('business_id', businessId)
          .gte('created_at', `${today}T00:00:00Z`)
          .contains('context', { entity_id: entityId })
          .maybeSingle()

        if (existingLog) continue

        // Execute rule with entity context
        const result = await executeRule(supabase, rule.id, {
          entity_type: entity,
          entity_id: entityId,
          dedup_key: dedupKey,
          ...entityItem,
        })

        if (result.status === 'success' || result.status === 'pending_approval') {
          triggered++
        } else if (result.status === 'failed') {
          errors++
        }
      }
    } catch (err) {
      console.error(`[automation-engine] Threshold evaluation error for rule ${rule.name}:`, err)
      errors++
    }
  }

  return { evaluated, triggered, errors }
}

/**
 * Query entities matching a threshold condition.
 */
async function queryThresholdEntities(
  supabase: SupabaseClient,
  businessId: string,
  entity: string,
  field: string,
  operator: string,
  value: number
): Promise<Array<Record<string, unknown>>> {
  const now = new Date()

  switch (entity) {
    case 'quote': {
      // days_since_sent: quotes with status 'sent' that are X days old
      if (field === 'days_since_sent') {
        const cutoffDate = new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
        const { data } = await supabase
          .from('quote')
          .select('quote_id, customer_id, total_amount, sent_at, status')
          .eq('business_id', businessId)
          .eq('status', 'sent')
          .lte('sent_at', cutoffDate.toISOString())

        return (data || []).map((q: Record<string, unknown>) => ({
          id: q.quote_id,
          customer_id: q.customer_id,
          total_amount: q.total_amount,
          days: Math.floor((now.getTime() - new Date(q.sent_at as string).getTime()) / (24 * 60 * 60 * 1000)),
        }))
      }
      return []
    }

    case 'invoice': {
      // days_overdue: invoices past due date
      if (field === 'days_overdue') {
        const cutoffDate = new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
        const { data } = await supabase
          .from('invoice')
          .select('invoice_id, customer_id, total, due_date, status')
          .eq('business_id', businessId)
          .in('status', ['sent', 'overdue'])
          .lte('due_date', cutoffDate.toISOString().slice(0, 10))

        return (data || []).map((inv: Record<string, unknown>) => ({
          id: inv.invoice_id,
          customer_id: inv.customer_id,
          total: inv.total,
          due_date: inv.due_date,
          days_overdue: Math.floor((now.getTime() - new Date(inv.due_date as string).getTime()) / (24 * 60 * 60 * 1000)),
        }))
      }
      return []
    }

    case 'booking': {
      // hours_until: bookings happening within X hours
      if (field === 'hours_until') {
        const maxTime = new Date(now.getTime() + value * 60 * 60 * 1000)
        const { data } = await supabase
          .from('booking')
          .select('booking_id, customer_id, start_time, title, address')
          .eq('business_id', businessId)
          .eq('status', 'confirmed')
          .gte('start_time', now.toISOString())
          .lte('start_time', maxTime.toISOString())

        return (data || []).map((b: Record<string, unknown>) => ({
          id: b.booking_id,
          customer_id: b.customer_id,
          time: b.start_time,
          title: b.title,
          address: b.address,
        }))
      }
      return []
    }

    case 'customer': {
      // months_since_last_job: inactive customers
      if (field === 'months_since_last_job') {
        const cutoffDate = new Date(now)
        cutoffDate.setMonth(cutoffDate.getMonth() - value)

        // Find customers whose latest booking/project is older than cutoff
        const { data } = await supabase
          .from('customer')
          .select('customer_id, name, phone_number, email, updated_at')
          .eq('business_id', businessId)
          .eq('job_status', 'completed')
          .lte('updated_at', cutoffDate.toISOString())

        return (data || []).map((c: Record<string, unknown>) => ({
          id: c.customer_id,
          customer_name: c.name,
          phone: c.phone_number,
          email: c.email,
          months_since_last_job: Math.floor((now.getTime() - new Date(c.updated_at as string).getTime()) / (30 * 24 * 60 * 60 * 1000)),
        }))
      }
      return []
    }

    default:
      return []
  }
}

/**
 * Fire an event and execute all matching event rules.
 * Fire-and-forget: logs but doesn't block the caller.
 */
export async function fireEvent(
  supabase: SupabaseClient,
  eventName: string,
  businessId: string,
  payload: ExecutionContext = {}
): Promise<void> {
  try {
    // Fetch matching event rules
    const { data: rules } = await supabase
      .from('v3_automation_rules')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('trigger_type', 'event')

    if (!rules || rules.length === 0) return

    // Filter by event_name in trigger_config
    const matchingRules = (rules as AutomationRule[]).filter(r => {
      const configEvent = r.trigger_config?.event_name
      return configEvent === eventName
    })

    // Execute matching rules
    for (const rule of matchingRules) {
      try {
        await executeRule(supabase, rule.id, payload)
      } catch (err) {
        console.error(`[automation-engine] Event rule ${rule.name} failed:`, err)
      }
    }
  } catch (err) {
    console.error(`[automation-engine] fireEvent error for ${eventName}:`, err)
  }
}

/**
 * Execute all cron-triggered rules for a business.
 * Called by the daily evaluate-thresholds cron job.
 */
export async function executeCronRules(
  supabase: SupabaseClient,
  businessId: string
): Promise<{ executed: number; errors: number }> {
  let executed = 0
  let errCount = 0

  const { data: rules } = await supabase
    .from('v3_automation_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('trigger_type', 'cron')

  if (!rules || rules.length === 0) return { executed, errors: errCount }

  const { hour, dayName } = getSwedenTime()

  for (const rule of rules as AutomationRule[]) {
    const schedule = rule.trigger_config?.schedule as string
    if (!schedule) continue

    // Simple cron matching for common patterns
    if (shouldCronRun(schedule, hour, dayName)) {
      try {
        const result = await executeRule(supabase, rule.id, {
          trigger: 'cron',
          schedule,
        })
        if (result.status === 'failed') errCount++
        else executed++
      } catch (err) {
        console.error(`[automation-engine] Cron rule ${rule.name} failed:`, err)
        errCount++
      }
    }
  }

  return { executed, errors: errCount }
}

/**
 * Simple cron schedule matcher.
 * Supports: "0 7 * * mon-fri", "0 7 * * *", "0 18 * * fri"
 */
function shouldCronRun(schedule: string, currentHour: number, currentDay: string): boolean {
  const parts = schedule.split(/\s+/)
  if (parts.length < 5) return false

  const [minute, hour, , , dayPart] = parts

  // Check hour (we run daily at 04:00, so match rules for morning batch)
  const targetHour = parseInt(hour)
  if (isNaN(targetHour)) return false

  // Since we run once daily, execute all rules regardless of exact hour
  // The cron runs at 04:00, so we batch all daily rules together

  // Check day constraint
  if (dayPart !== '*') {
    const days = dayPart.toLowerCase()
    if (days.includes('-')) {
      const [start, end] = days.split('-')
      const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
      const startIdx = dayOrder.indexOf(start)
      const endIdx = dayOrder.indexOf(end)
      const currentIdx = dayOrder.indexOf(currentDay)
      if (startIdx === -1 || endIdx === -1 || currentIdx === -1) return false
      if (currentIdx < startIdx || currentIdx > endIdx) return false
    } else {
      const allowedDays = days.split(',').map(d => d.trim())
      if (!allowedDays.includes(currentDay)) return false
    }
  }

  return true
}

/**
 * Get automation settings for a business (public helper).
 */
export async function getAutomationSettingsV3(
  supabase: SupabaseClient,
  businessId: string
): Promise<AutomationSettingsV3> {
  return getSettings(supabase, businessId)
}
