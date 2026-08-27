/**
 * V3 Automation Engine
 *
 * Core engine for rule-based automation. Three main exports:
 * - executeRule()         — run a single rule with settings validation
 * - evaluateThresholds()  — check all threshold rules for a business
 * - fireEvent()           — dispatch an event to matching event rules
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { deriveAutonomyKey, isAutonomous as isAutonomyGranted, recordAutonomyFailure } from '@/lib/autonomy/earned-autonomy'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { arTestId, arTestNamn } from '@/lib/testdata'
import { extractFirstName } from '@/lib/customers/namn'
import { registerMandateDeliveryFailure } from '@/lib/mandates/mission-mandate'
import { internalPushHeaders } from '@/lib/notifications/push-internal'
import { loadMandateResolutionCache, resolveMandateForAction, type MandateResolutionCache } from '@/lib/mandates/resolve'

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
  agent_id: string | null
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
    agentId?: string | null
  }
): Promise<void> {
  try {
    // Härled agent_id från rule om inte explicit satt
    const agentId = params.agentId ?? deriveAgentId(params.ruleName, params.actionType, params.triggerType)

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
      agent_id: agentId,
    })
  } catch (err: unknown) {
    console.error('[automation-engine] Failed to log execution:', err)
  }
}

/**
 * Härleder vilken agent som "äger" en regel baserat på namn + action.
 * Matche mot samma prefix-regler som lib/agents/personalities.ts.
 */
function deriveAgentId(ruleName: string, actionType: string, triggerType: string): string {
  const n = ruleName.toLowerCase()
  if (n.includes('faktur') || n.includes('betaln') || n.includes('påminnels') || n.includes('fortnox')) return 'karin'
  if (n.includes('offert') || n.includes('lead') || n.includes('pipeline') || n.includes('quote')) return 'daniel'
  if (n.includes('bokning') || n.includes('projekt') || n.includes('arbetsorder') || n.includes('äta') || n.includes('ata')) return 'lars'
  if (n.includes('kampanj') || n.includes('reaktiv') || n.includes('granne') || n.includes('recension') || n.includes('review')) return 'hanna'
  if (n.includes('samtal') || n.includes('sms') || n.includes('missat') || n.includes('inkomm')) return 'lisa'
  if (n.includes('morgon') || triggerType === 'manual') return 'matte'
  return 'matte'
}

/**
 * {{key}}-interpolation delad mellan handleSendSms och handleCreateApproval.
 * Ersätter bara nycklar som faktiskt finns i kontext (sträng/nummer) — gamla
 * statiska texter utan platshållare, eller platshållare för nycklar som
 * saknas i kontext, lämnas orörda i stället för att krascha eller radera dem.
 */
export function interpolateTemplate(template: string, context: ExecutionContext): string {
  let result = template
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string' || typeof value === 'number') {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
    }
  }
  return result
}

/**
 * Ren nyckel-logik för godkännande-dedupe (v85): utan entity_id i kontext
 * kan vi inte deduplicera pålitligt — då ska inget kort skapas alls (se
 * handleCreateApproval). rule_action_type faller tillbaka på config.approval_type
 * och sist 'automation', vilket matchar defaulten som faktiskt sparas på raden.
 */
export function deriveApprovalDedupeKey(
  context: ExecutionContext,
  config: Record<string, unknown>
): { entityId: string; ruleActionType: string } | null {
  const entityId = (context.entity_id as string) || (context.id as string)
  if (!entityId) return null
  const ruleActionType = (context.rule_action_type as string) || (config.approval_type as string) || 'automation'
  return { entityId, ruleActionType }
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
  let message = interpolateTemplate(template, context)

  // Get business name for template
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', businessId)
    .single()

  message = message.replace(/\{\{business_name\}\}/g, business?.business_name || 'Handymate')

  let to = (context.phone as string) || (context.customer_phone as string)
  // Många event (lead_received, threshold-regler m.fl.) bär bara customer_id,
  // inte telefonnummer. Slå då upp numret så SMS-regler faktiskt kan skickas
  // i stället för att tyst dead-letter:a på "inget telefonnummer".
  if (!to && context.customer_id) {
    const { data: cust } = await supabase
      .from('customer')
      .select('phone_number')
      .eq('business_id', businessId)
      .eq('customer_id', context.customer_id as string)
      .maybeSingle()
    to = (cust?.phone_number as string) || ''
  }
  if (!to) {
    return { success: false, error: 'Inget telefonnummer i kontext' }
  }

  // ═══ GENOM STRYPUNKTEN (etapp 0 batch 2, 2026-08-08) ═══
  //
  // Regelmotorn hade den mest kompletta kopian av strypunkten: egen
  // E.164-formaterare, egen sms_log-skrivning för både lyckat och misslyckat,
  // egen felparsning. Allt det finns i sendSmsViaElks — men det som INTE fanns
  // här var opt-out-spärren, och automationsregler är precis den sortens
  // utskick den finns för: de går utan att någon människa tittar.
  //
  // Den lokala formatPhone() var dessutom en fjärde variant av samma
  // E.164-logik. Nu en väg.
  const { sendSmsViaElks } = await import('@/lib/sms-send')
  const r = await sendSmsViaElks({
    supabase,
    businessId,
    businessName: business?.business_name,
    to,
    message,
    customerId: (context.customer_id as string) || null,
    messageType: 'automation_rule',
    recipient: 'customer',
    purpose: 'proactive',
  })

  if (!r.success) {
    console.error('[automation-engine] SMS misslyckades:', r.error)
    return { success: false, error: r.error || 'SMS send failed' }
  }

  return {
    success: true,
    data: { to, elks_id: r.elksId, message_preview: message.substring(0, 80) },
  }
}

async function handleSendEmail(
  supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  let to = (context.email as string) || (context.customer_email as string)
  // Slå upp e-post från customer_id om context saknar den (parallellt med SMS-
  // handlern) — annars är email-regler en no-op för de flesta triggers.
  if (!to && context.customer_id) {
    const { data: cust } = await supabase
      .from('customer').select('email').eq('business_id', businessId).eq('customer_id', context.customer_id as string).maybeSingle()
    to = (cust?.email as string) || ''
  }
  if (!to) return { success: false, error: 'Ingen e-postadress i kontext' }

  const subject = (config.subject as string) || 'Meddelande'
  const body = (config.body as string) || ''

  try {
    // Etapp 0 (2026-08-27): den e-postrutt som tidigare anropades här har
    // aldrig funnits — varje V3 send_email-regel failade med 404. Går nu
    // direkt via e-postkärnan (Resend) och läser dess resultat.
    const { sendEmail, logEmail } = await import('@/lib/email')
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('business_id', businessId)
      .maybeSingle()
    const html = body
      .split(/\r?\n/)
      .map(line => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('<br>')
    const result = await sendEmail({ to, subject, html, fromName: biz?.business_name || undefined })
    await logEmail({
      businessId,
      customerId: (context.customer_id as string) || undefined,
      to,
      subject,
      status: result.success ? 'sent' : 'failed',
      messageId: result.messageId,
    })
    if (!result.success) return { success: false, error: `E-post misslyckades: ${result.error || 'okänt fel'}` }
    return { success: true, data: { to, subject, messageId: result.messageId } }
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
    // V6: Delegera till Orchestrator istället för HTTP POST till /api/agent/trigger
    const { orchestrate } = await import('@/lib/agent/orchestrator')

    const result = await orchestrate({
      businessId,
      triggerType: 'automation_rule',
      triggerData: {
        instruction,
        rule_name: ruleName,
        ...context,
      },
      ruleName,
      idempotencyKey: `rule-${ruleName}-${new Date().toISOString().slice(0, 10)}`,
    })

    if (!result.success) {
      return { success: false, error: result.error || 'Orchestrator failed' }
    }

    return {
      success: true,
      data: {
        run_id: result.runId,
        steps: result.steps,
        agent_type: result.agentType,
        escalated: result.escalated,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Orchestrator failed'
    return { success: false, error: msg }
  }
}

async function handleCreateApproval(
  supabase: SupabaseClient,
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  ruleName?: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  // {{key}}-interpolation, samma mönster som handleSendSms — se A i
  // dashboard-städpaketet: gamla statiska titlar/beskrivningar utan
  // platshållare rör sig inte, saknade nycklar lämnas orörda.
  const title = interpolateTemplate((config.title as string) || 'Godkännande krävs', context)
  const description = interpolateTemplate((config.description as string) || '', context)

  // Dedup: entity_id + rule_action_type (inte titel — titeln kan nu
  // interpoleras och skiljer sig därför per instans av samma regel).
  // Saknas entity_id kan vi inte deduplicera pålitligt — skapa hellre
  // inget kort än ett dubblett-spam-kort utan spårbar identitet.
  const dedupeKey = deriveApprovalDedupeKey(context, config)
  if (!dedupeKey) {
    console.warn('[automation-engine] handleCreateApproval: entity_id saknas i kontext — inget godkännandekort skapas', { businessId, title })
    return { success: true, data: { skipped: true, reason: 'entity_id saknas — inget kort skapat' } }
  }
  const { entityId, ruleActionType } = dedupeKey

  // Dedup UTAN statusfilter (buggfix 2026-08-11, samma klass som cert-expiry
  // och proactive-care): kollen på status='pending' skyddade bara medan
  // kortet låg obehandlat. Korten går ut efter 48h — nästa körning såg då
  // ingen pending-rad och skapade om samma kort, varje dag, för alltid
  // (Andreas skärmdump: tre påminnelsekort som återuppstod dagligen). Ett
  // avvisat/utgånget kort för samma entitet+regel ska INTE återuppstå;
  // trösklarna förblir sanna för evigt när de passerats.
  const { count } = await supabase
    .from('pending_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .contains('payload', { entity_id: entityId, rule_action_type: ruleActionType })

  if ((count || 0) > 0) {
    return { success: true, data: { skipped: true, reason: 'Approval redan skapad för denna entitet' } }
  }

  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const routedAgent = deriveAgentId(ruleName || title, '', '')

  const { error } = await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: (config.approval_type as string) || 'automation',
    title,
    description,
    payload: { ...context, rule_action_type: ruleActionType, routed_agent: routedAgent },
    status: 'pending',
    risk_level: 'medium',
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  })

  if (error) return { success: false, error: error.message }

  // Send push notification
  fetch(`${APP_URL}/api/push/send`, {
    method: 'POST',
    headers: internalPushHeaders(),
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
    // Etapp 0 (2026-08-27): signerad intern push + ärligt utfall — "0
    // mottagare" är inte "levererat".
    const { sendInternalPush } = await import('@/lib/notifications/push-internal')
    const push = await sendInternalPush({
      business_id: businessId,
      title,
      body,
      url: (config.url as string) || '/dashboard',
    })
    if (!push.delivered) return { success: false, error: `Push nådde ingen mottagare (${push.reason || 'no_recipients'})`, data: { title, sent: push.sent } }
    return { success: true, data: { title, sent: push.sent } }
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
  // Sanering 2026-08-05: 'rejected' bröt mot leads status-CHECK
  // (new/contacted/qualified/quote_sent/won/lost) → updaten failade tyst
  // och funktionen returnerade ändå success. 'lost' är kanoniska värdet.
  const { error: rejectErr } = await supabase
    .from('leads')
    .update({ status: 'lost', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('business_id', businessId)
  if (rejectErr) {
    return { success: false, error: `Lead-status kunde inte uppdateras: ${rejectErr.message}` }
  }

  // Send rejection SMS if template provided and phone available
  if (config.sms_template && context.phone) {
    await handleSendSms(supabase, businessId, { template: config.sms_template }, context)
  }

  return { success: true, data: { lead_id: leadId, status: 'lost' } }
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

  // OBS: inbox_item har kolumnerna inbox_item_id (PK, ingen default), channel
  // (NOT NULL), customer_id, summary, status, related_id — INTE type/title/
  // description/priority/scheduled_at. Den gamla insertet failade alltid tyst →
  // inga uppföljningar skapades. (Tabellen saknar scheduled_at → datum i summary.)
  const { error: insertErr } = await supabase.from('inbox_item').insert({
    inbox_item_id: 'inbox_' + Math.random().toString(36).slice(2, 11),
    business_id: businessId,
    channel: 'followup',
    customer_id: (context.customer_id as string) || null,
    summary: `${description} (senast ${followupDate.toLocaleDateString('sv-SE')})`,
    status: 'new',
    related_id: (context.entity_id as string) || (context.lead_id as string) || (context.quote_id as string) || null,
    created_at: new Date().toISOString(),
  })
  if (insertErr) console.error('[automation-engine] Failed to create followup:', insertErr.message)

  return { success: true, data: { followup_date: followupDate.toISOString(), description } }
}

async function handleSyncToFortnox(
  businessId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const entityType = (config.entity_type as string) || (context.entity_type as string)
    const entityId = (context.entity_id as string) || (config.entity_id as string)

    if (!entityType || !entityId) {
      return { success: false, error: 'entity_type och entity_id krävs för Fortnox-sync' }
    }

    const { syncCustomerWithTracking, syncInvoiceWithTracking, syncQuoteWithTracking, syncPaymentWithTracking } =
      await import('@/lib/fortnox/sync')

    let result: { success: boolean; skipped?: boolean; fortnoxId?: string; error?: string }

    switch (entityType) {
      case 'customer':
        result = await syncCustomerWithTracking(businessId, entityId)
        break
      case 'invoice':
        result = await syncInvoiceWithTracking(businessId, entityId)
        break
      case 'quote':
        result = await syncQuoteWithTracking(businessId, entityId)
        break
      case 'payment': {
        const invoiceNumber = (context.fortnox_invoice_number as string) || ''
        const amount = (context.amount as number) || 0
        if (!invoiceNumber || !amount) {
          return { success: false, error: 'fortnox_invoice_number och amount krävs för betalningssynk' }
        }
        const payResult = await syncPaymentWithTracking(businessId, entityId, invoiceNumber, amount)
        result = { success: payResult.success, skipped: payResult.skipped, error: payResult.error }
        break
      }
      default:
        return { success: false, error: `Okänd Fortnox entity_type: ${entityType}` }
    }

    if (result.skipped) {
      return { success: true, data: { skipped: true, reason: 'fortnox_not_connected' } }
    }

    return {
      success: result.success,
      data: { entity_type: entityType, entity_id: entityId, fortnox_id: result.fortnoxId },
      error: result.error,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Fortnox sync failed'
    return { success: false, error: msg }
  }
}

// ── Create Project from Lead ────────────────────────────

async function handleCreateProject(
  supabase: SupabaseClient,
  businessId: string,
  context: ExecutionContext
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const leadId = context.lead_id as string | undefined
  if (!leadId) {
    return { success: false, error: 'Ingen lead_id i context' }
  }

  try {
    const { createProjectFromLead } = await import('@/lib/projects/create-from-lead')
    const result = await createProjectFromLead(businessId, leadId)
    if (result.success) {
      return { success: true, data: { project_id: result.project_id } }
    }
    return { success: false, error: result.error }
  } catch (err: any) {
    return { success: false, error: err.message || 'Kunde inte skapa projekt' }
  }
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
      return handleCreateApproval(supabase, businessId, actionConfig, context, ruleName)
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
    case 'sync_to_fortnox':
      return handleSyncToFortnox(businessId, actionConfig, context)
    case 'create_project':
      return handleCreateProject(supabase, businessId, context)
    default:
      return { success: false, error: `Okänd åtgärdstyp: ${actionType}` }
  }
}

/**
 * Kör en automationsåtgärd som skjutits upp för godkännande. Anropas av
 * approvals-routen när en 'automation'-approval godkänns — utan denna var
 * godkännandet en no-op (åtgärden utfördes aldrig).
 */
export async function runApprovedAutomationAction(
  supabase: SupabaseClient,
  businessId: string,
  actionType: string,
  actionConfig: Record<string, unknown>,
  context: ExecutionContext,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  return executeAction(supabase, businessId, actionType, actionConfig, context, 'Godkänd automation')
}

// ── Public API ──────────────────────────────────────────

/**
 * Execute a single automation rule.
 * Validates settings, checks work hours/night mode, handles approvals.
 */
export async function executeRule(
  supabase: SupabaseClient,
  ruleId: string,
  context: ExecutionContext = {},
  /**
   * Etapp W (Mission Mandates V1, tasks/jaunty-pondering-hummingbird.md):
   * en delad mandat-cache för HELA business-körningen (se
   * evaluateThresholds, som skapar den EN gång och skickar in den till
   * varje kandidat i sin loop — inte en läsning per kandidat). Utelämnad
   * (fireEvent/executeCronRules/direkta anrop) ⇒ lazy fallback nedan, men
   * det spelar ingen roll i praktiken: mandat-blocket nedan är bara
   * nåbart för trigger_type 'threshold' (deriveAutonomyKey), och det är
   * bara evaluateThresholds som kör såna regler.
   */
  mandateCache?: MandateResolutionCache
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
      agentId: typedRule.agent_id ?? null,
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

  // 6. If requires_approval → create approval instead of executing.
  // Globala godkännande-växlar (Inställningar) gäller UTÖVER regelns egen flagga:
  // slår hantverkaren på "kräv godkännande för SMS" globalt kräver alla SMS-/
  // mejlregler godkännande oavsett vad den enskilda regeln säger.
  const globalApproval =
    ((typedRule.action_type === 'send_sms' || typedRule.action_type === 'send_email') && settings.require_approval_send_sms) ||
    (typedRule.action_type === 'generate_quote' && settings.require_approval_send_quote) ||
    (typedRule.action_type === 'create_booking' && settings.require_approval_create_booking)
  const needsApproval = typedRule.requires_approval || globalApproval

  // Förtjänad autonomi: om regeln mappar till en allowlistad nyckel OCH
  // hantverkaren beviljat autonomi för den → hoppa över approval-grenen och
  // fall igenom till exekvering (steg 7). Markera i context för logg/digest.
  const autonomyKey = deriveAutonomyKey(typedRule)
  let autonomousBypass = false
  // Etapp W (Mission Mandates V1): mandatkontrollen körs FÖRE isAutonomous —
  // ett mandat är uppdrags-scopat uttryckligt samtycke, mer specifikt än
  // global förtjänad autonomi. Träff ⇒ SAMMA exekverings-/loggningsväg som
  // autonomousBypass redan tar (steg 7/8 nedan, orörda) plus ett eget
  // stämplat auto_approved-kort (se strax efter steg 7). Miss/orsak (inget
  // mandat, fel typ, mål utanför, tak nått, plan ändrad, ...) ⇒ dagens
  // isAutonomous-beteende, exakt oförändrat (reduktionen syns nedan: när
  // mandatBypass förblir false körs precis den gamla try/catch-satsen).
  let mandateStamp: { mandate_id: string; mission_id: string } | null = null
  if (needsApproval && autonomyKey) {
    // Etapp W:s uttryckliga scope för den här callern är booking_reminder
    // (tasks/jaunty-pondering-hummingbird.md, Etapp W punkt 1).
    // deriveAutonomyKey mappar ÄVEN threshold-signaturerna
    // invoice/days_overdue och quote/days_since_sent till invoice_reminder/
    // quote_followup_sms (V3-regelmotorns egen väg dit, parallell med
    // cron-callerna) — de typerna HAR ett default-belopptak
    // (DEFAULT_AUTONOMY_CAPS), så ett `amountKr: null` härifrån (context bär
    // inget vitlistat beloppsfält på den här grenen) skulle fail-closed:a
    // till 'belopp_okant' varje gång, dvs. tyst göra mandat overksamma för
    // just de typerna på just den här vägen. Snävare att hålla sig till
    // exakt det planen ber om än att gissa ett belopp — isAutonomous-
    // kontrollen nedan körs OFÖRÄNDRAT för de typerna, precis som innan.
    if (autonomyKey === 'booking_reminder') {
      const entityId = (context.entity_id as string) || (context.id as string)
      if (entityId) {
        try {
          const cache = mandateCache ?? await loadMandateResolutionCache(supabase, typedRule.business_id)
          const resolution = await resolveMandateForAction(supabase, typedRule.business_id, cache, {
            actionKey: autonomyKey,
            targetRef: entityId,
            // booking_reminder saknar ett kr-belopp i den här kontexten (och
            // saknar default-tak i DEFAULT_AUTONOMY_CAPS) — null är ärligt,
            // inte en gissning.
            amountKr: null,
            nowIso: new Date().toISOString(),
          })
          if (resolution.covered) {
            autonomousBypass = true
            mandateStamp = { mandate_id: resolution.mandate.id, mission_id: resolution.mandate.mission_id }
          }
        } catch { /* fail-soft: ingen täckning, faller igenom till isAutonomous nedan */ }
      }
    }
    if (!autonomousBypass) {
      try {
        autonomousBypass = await isAutonomyGranted(supabase, typedRule.business_id, autonomyKey)
      } catch { autonomousBypass = false }
    }
  }
  // Muta ALDRIG caller-ägda context (fireEvent delar payload-objektet över
  // regler i loopen) — härled en lokal kopia för den autonoma vägen.
  const execContext = autonomousBypass ? { ...context, earned_autonomy: true } : context

  if (needsApproval && !autonomousBypass && typedRule.action_type !== 'create_approval') {
    const approvalResult = await handleCreateApproval(supabase, typedRule.business_id, {
      title: typedRule.name,
      description: typedRule.description || '',
      approval_type: 'automation',
    }, {
      ...context,
      rule_id: ruleId,
      rule_action_type: typedRule.action_type,
      rule_action_config: typedRule.action_config,
      // Stämpla nyckeln → streak-räkning kan mappa raden (autonomyKeyFromApproval)
      ...(autonomyKey ? { autonomy_key: autonomyKey } : {}),
    }, typedRule.name)

    await logExecution(supabase, {
      businessId: typedRule.business_id,
      ruleId: typedRule.id,
      ruleName: typedRule.name,
      triggerType: typedRule.trigger_type,
      actionType: typedRule.action_type,
      agentId: typedRule.agent_id ?? null,
      status: 'pending_approval',
      context,
      result: approvalResult.data,
      approvalId: approvalResult.data?.approval_id as string,
    })
    await updateRuleStats(supabase, typedRule.id, 'pending_approval')

    return { status: 'pending_approval', data: approvalResult.data }
  }

  // 7. Execute action. Stämpla rule_action_type på en lokal kopia (inte
  // execContext själv — muta aldrig caller-ägd context) så direkta
  // create_approval-regler (t.ex. "Faktura eskalering dag 7", som aldrig
  // passerar approval-grenen ovan) ändå har nyckeln dedupe-logiken kräver.
  const result = await executeAction(
    supabase,
    typedRule.business_id,
    typedRule.action_type,
    typedRule.action_config,
    { ...execContext, rule_action_type: typedRule.action_type },
    typedRule.name
  )

  const status: LogStatus = result.success ? 'success' : 'failed'

  // Etapp W (Mission Mandates V1): mandat-täckta körningar stämplas med ett
  // eget auto_approved-kort — mandatets mätinstrument (mandate-facit.ts,
  // Etapp V) härleder daglig/total användning ur payload.mandate_id-
  // stämplade pending_approvals-rader (deriveMandateUsage), och den vanliga
  // v3_automation_logs-raden (steg 8 nedan) bär inget mandate_id. Det här är
  // en TILLÄGGSSKRIVNING vid sidan av steg 8, inte en ersättning för den.
  if (mandateStamp) {
    try {
      const cardId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const { error: cardErr } = await supabase.from('pending_approvals').insert({
        id: cardId,
        business_id: typedRule.business_id,
        approval_type: 'automation',
        title: typedRule.name,
        description: `${typedRule.description || ''} — utfört automatiskt inom mandatet.`.trim(),
        payload: {
          ...execContext,
          rule_action_type: typedRule.action_type,
          autonomy_key: autonomyKey,
          mandate_id: mandateStamp.mandate_id,
          mission_id: mandateStamp.mission_id,
          execution_result: {
            outcome: status === 'success' ? 'success' : 'failed',
            error_text: status === 'success' ? null : (result.error || null),
          },
        },
        status: 'auto_approved',
        risk_level: 'medium',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      if (cardErr) console.error('[automation-engine] mandat-kort insert failed:', typedRule.id, cardErr)
      if (status === 'failed') {
        await registerMandateDeliveryFailure(supabase, {
          mandateId: mandateStamp.mandate_id,
          businessId: typedRule.business_id,
        })
      }
    } catch (err) {
      console.error('[automation-engine] mandat-kortskrivning kastade oväntat (fail-safe, ignorerat):', err)
    }
  }

  // Förtjänad autonomi: ett autonomt utskick som failar får inte svälta tyst —
  // hantverkaren har delegerat och måste få veta när delegationen fallerar.
  if (status === 'failed' && autonomousBypass) {
    // Räknas mot nedgraderings-tröskeln (2 fel/14 dagar). autonomyKey är satt
    // (annars hade autonomousBypass aldrig blivit true). Fail-safe internt.
    // INTE när felet kom via ett mandat (mandateStamp satt) — det är
    // registerMandateDeliveryFailure ovan som äger den räkningen, en
    // mandat-driven misslyckad körning ska aldrig straffa den separata
    // förtjänad-autonomi-streaken.
    if (autonomyKey && !mandateStamp) {
      await recordAutonomyFailure(supabase, typedRule.business_id, autonomyKey)
    }
    try {
      await fetch(`${APP_URL}/api/push/send`, {
        method: 'POST',
        headers: internalPushHeaders(),
        body: JSON.stringify({
          business_id: typedRule.business_id,
          title: 'Självständig åtgärd misslyckades',
          body: `${typedRule.name} kunde inte utföras — kontrollera i loggen.`,
          url: '/dashboard/automations',
        }),
      })
    } catch { /* non-blocking */ }
  }

  // 8. Log execution
  await logExecution(supabase, {
    businessId: typedRule.business_id,
    ruleId: typedRule.id,
    ruleName: typedRule.name,
    triggerType: typedRule.trigger_type,
    actionType: typedRule.action_type,
    status,
    context: execContext,
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

  // Etapp W (Mission Mandates V1): EN mandat-cache för hela den här
  // business-körningen, delad av varje kandidat i loopen nedan via
  // executeRule:s valfria 4:e argument — inte en läsning per kandidat (se
  // lib/mandates/resolve.ts filhuvud).
  const mandateCache = await loadMandateResolutionCache(supabase, businessId)

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

        // Testdata-vakt (2026-08-11, samma mönster som send-reminders-cronen
        // och lib/testdata.ts): e2e-/test-genererade quotes, fakturor,
        // bokningar och kunder ska aldrig trigga riktiga kund-SMS eller
        // godkännanden. Den här grinden saknades helt här — en gammal
        // e2e-testoffert (mars 2026, status "opened", aldrig städad) var
        // den faktiska källan till spammet i ägarens skärmdump 2026-08-11.
        if (
          arTestId(entityId) ||
          arTestId(entityItem.customer_id) ||
          arTestNamn(entityItem.customer_name)
        ) continue

        // Dedup: samma regel ska bara fyra EN GÅNG per entitet, någonsin —
        // inte en gång per DAG. Trösklarna (days_since_sent >= 5,
        // days_overdue >= 1 osv.) förblir sanna för alltid när de väl
        // passerats, så en dag-avgränsad koll lät samma påminnelse gå ut
        // igen varje morgon för alltid. Bekräftat: den testoffert som
        // triggade testdata-vakten ovan hade fyrat "Offertuppföljning dag
        // 5" 140+ dagar i rad innan den här fixen.
        const { data: existingLog } = await supabase
          .from('v3_automation_logs')
          .select('id')
          .eq('rule_id', rule.id)
          .eq('business_id', businessId)
          .contains('context', { entity_id: entityId })
          .maybeSingle()

        if (existingLog) continue

        // Execute rule with entity context
        const result = await executeRule(supabase, rule.id, {
          entity_type: entity,
          entity_id: entityId,
          dedup_key: dedupKey,
          ...entityItem,
        }, mandateCache)

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
 * Kundkontakter för threshold-entiteter — separat batch-hämtning, ALDRIG embed.
 *
 * FK:erna på quotes/booking mot customer är inte bekräfat körda i prod, och en
 * PGRST200 hade tyst fällt hela threshold-frågan (samma felklass som
 * proactive-care). Fakturagrenen har en bevisat säker embed och behåller den.
 *
 * Utan namnet i kontexten går '{{customer_name}}' ut ORDAGRANT i kund-SMS —
 * interpolateTemplate lämnar medvetet okända nycklar orörda (Andreas
 * skärmdump 2026-08-10: offertuppföljningen sa "Hej {{customer_name}}!"
 * medan fakturapåminnelsen sa "Hej Andreas!").
 *
 * Telefonnumret följer med av samma skäl fast åt andra hållet: "Ring kund"-
 * korten (create_approval-regeln) bar inget nummer, så ytan kunde aldrig visa
 * en riktig ring-knapp — bara ett Godkänn som inte utförde något.
 */
async function fetchCustomerContacts(
  supabase: SupabaseClient,
  businessId: string,
  customerIds: Array<unknown>,
): Promise<Map<string, { namn: string | null; telefon: string | null }>> {
  const ids = Array.from(new Set(
    customerIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
  ))
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number')
    .eq('business_id', businessId)
    .in('customer_id', ids)
  if (error) {
    console.error('[automation-engine] kunde inte hämta kundkontakter för threshold-entiteter:', error.message)
    return new Map()
  }
  return new Map(
    (data || []).map((c: Record<string, unknown>) => [
      c.customer_id as string,
      {
        namn: typeof c.name === 'string' && c.name ? c.name : null,
        telefon: typeof c.phone_number === 'string' && c.phone_number ? c.phone_number : null,
      },
    ]),
  )
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
          .from('quotes')
          .select('quote_id, customer_id, total, sent_at, status')
          .eq('business_id', businessId)
          // VP3 (gap 6-bis): 'opened' ingick inte — en öppnad-men-obesvarad
          // offert triggade aldrig days_since_sent-regler.
          .in('status', [...OPEN_QUOTE_STATUSES])
          .lte('sent_at', cutoffDate.toISOString())

        // customer_name/phone via separat batch — se fetchCustomerContacts.
        // Namnet saknades helt här, så seed-regelns SMS ("Hej
        // {{customer_name}}! Vi skickade en offert för {{days}} dagar
        // sedan…") gick ut med platshållaren kvar medan days och
        // business_name ersattes. Numret behövs för Ring kund-kortens
        // tel-knapp.
        const kontakter = await fetchCustomerContacts(supabase, businessId, (data || []).map((q: Record<string, unknown>) => q.customer_id))

        return (data || []).map((q: Record<string, unknown>) => ({
          id: q.quote_id,
          customer_id: q.customer_id,
          customer_name: kontakter.get(q.customer_id as string)?.namn ?? null,
          // R1: NY context-variabel, används av send_sms-mallarnas kundtext
          // istället för {{customer_name}} (fullnamn) — se sql/v123_kundrost_
          // customer_first_name.sql. {{customer_name}} bevaras oförändrad för
          // notify_owner/create_approval-mallar där fullnamn är rätt.
          customer_first_name: extractFirstName(kontakter.get(q.customer_id as string)?.namn ?? null) || null,
          customer_phone: kontakter.get(q.customer_id as string)?.telefon ?? null,
          total: q.total,
          days: Math.floor((now.getTime() - new Date(q.sent_at as string).getTime()) / (24 * 60 * 60 * 1000)),
        }))
      }
      return []
    }

    case 'invoice': {
      // days_overdue: invoices past due date
      if (field === 'days_overdue') {
        const cutoffDate = new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
        // customer:customer_id(name) — bevisat säker embed på invoice-tabellen
        // (samma join används redan i app/api/cron/check-overdue/route.ts).
        // Utan invoice_number/customer_name blir godkännande-korten (del A)
        // opersonliga generiska titlar i stället för "Faktura 1042 — ...".
        const { data } = await supabase
          .from('invoice')
          .select('invoice_id, invoice_number, customer_id, total, due_date, status, customer:customer_id(name)')
          .eq('business_id', businessId)
          .in('status', ['sent', 'overdue'])
          .lte('due_date', cutoffDate.toISOString().slice(0, 10))

        return (data || []).map((inv: Record<string, unknown>) => ({
          id: inv.invoice_id,
          customer_id: inv.customer_id,
          customer_name: (inv.customer as { name?: string } | null)?.name || null,
          customer_first_name: extractFirstName((inv.customer as { name?: string } | null)?.name || null) || null,
          invoice_number: inv.invoice_number,
          total: inv.total,
          due_date: inv.due_date,
          days_overdue: Math.floor((now.getTime() - new Date(inv.due_date as string).getTime()) / (24 * 60 * 60 * 1000)),
        }))
      }
      return []
    }

    case 'booking': {
      // hours_until: bokningar inom X timmar.
      // OBS: kolumnen heter scheduled_start (INTE start_time) och title/address
      // finns inte på booking → den gamla queryn frågade obefintliga kolumner och
      // returnerade alltid tomt, så bokningspåminnelser fyrade ALDRIG.
      if (field === 'hours_until') {
        const maxTime = new Date(now.getTime() + value * 60 * 60 * 1000)
        const { data } = await supabase
          .from('booking')
          .select('booking_id, customer_id, scheduled_start, notes')
          .eq('business_id', businessId)
          .eq('status', 'confirmed')
          .gte('scheduled_start', now.toISOString())
          .lte('scheduled_start', maxTime.toISOString())

        // Samma lucka som offertgrenen: bokningspåminnelsens seed-mall säger
        // "Hej {{customer_name}}!" — utan namnet går platshållaren ut i SMS.
        const kontakter = await fetchCustomerContacts(supabase, businessId, (data || []).map((b: Record<string, unknown>) => b.customer_id))

        return (data || []).map((b: Record<string, unknown>) => ({
          id: b.booking_id,
          customer_id: b.customer_id,
          customer_name: kontakter.get(b.customer_id as string)?.namn ?? null,
          customer_first_name: extractFirstName(kontakter.get(b.customer_id as string)?.namn ?? null) || null,
          customer_phone: kontakter.get(b.customer_id as string)?.telefon ?? null,
          time: b.scheduled_start,
          // R2: booking.notes är hantverkarens interna anteckning — bärs
          // vidare här endast för notify_owner-mallar (internt), ALDRIG för
          // kundtext. Ingen send_sms-mall får referera {{title}}.
          title: b.notes,
        }))
      }
      return []
    }

    case 'customer': {
      // months_since_last_job: inactive customers
      if (field === 'months_since_last_job') {
        const cutoffDate = new Date(now)
        cutoffDate.setMonth(cutoffDate.getMonth() - value)

        // Kunder vars senaste jobb är äldre än cutoff. OBS: kolumnen job_status
        // finns INTE — använd last_job_date (sätts av lib/customer-ltv.ts). Tidigare
        // failade queryn tyst → reaktiveringsregler fyrade aldrig.
        const cutoffDay = cutoffDate.toISOString().slice(0, 10)
        const { data } = await supabase
          .from('customer')
          .select('customer_id, name, phone_number, email, last_job_date')
          .eq('business_id', businessId)
          .not('last_job_date', 'is', null)
          .lte('last_job_date', cutoffDay)

        return (data || []).map((c: Record<string, unknown>) => ({
          id: c.customer_id,
          customer_id: c.customer_id,
          customer_name: c.name,
          customer_first_name: extractFirstName(c.name as string | null) || null,
          phone: c.phone_number,
          email: c.email,
          months_since_last_job: Math.floor((now.getTime() - new Date(c.last_job_date as string).getTime()) / (30 * 24 * 60 * 60 * 1000)),
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
