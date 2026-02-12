import { getServerSupabase } from '@/lib/supabase'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

// ── Types ──────────────────────────────────────────────────────

export interface CommunicationContext {
  businessId: string
  customerId: string
  dealId?: string
  orderId?: string
  invoiceId?: string
  quoteId?: string
  bookingId?: string
  extraVariables?: Record<string, string>
}

export interface MessageVariables {
  customer_name: string
  business_name: string
  business_phone: string
  quote_link?: string
  booking_date?: string
  booking_time?: string
  work_address?: string
  invoice_number?: string
  invoice_amount?: string
  invoice_due_date?: string
  swish_number?: string
  eta_minutes?: string
  review_link?: string
  [key: string]: string | undefined
}

export interface CommunicationRule {
  id: string
  business_id: string | null
  name: string
  description: string | null
  trigger_type: string
  trigger_config: Record<string, any>
  message_template: string
  channel: string
  is_enabled: boolean
  is_system: boolean
  sort_order: number
}

export interface CommunicationSettings {
  id: string
  business_id: string
  auto_enabled: boolean
  tone: 'formal' | 'friendly' | 'personal'
  max_sms_per_customer_per_week: number
  send_booking_confirmation: boolean
  send_day_before_reminder: boolean
  send_on_the_way: boolean
  send_quote_followup: boolean
  send_job_completed: boolean
  send_invoice_reminder: boolean
  send_review_request: boolean
  quiet_hours_start: string
  quiet_hours_end: string
}

// ── Variables Resolution ──────────────────────────────────────

export async function resolveMessageVariables(
  context: CommunicationContext
): Promise<MessageVariables> {
  const supabase = getServerSupabase()

  // Fetch business info
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, phone_number, assigned_phone_number')
    .eq('business_id', context.businessId)
    .single()

  // Fetch customer info
  const { data: customer } = await supabase
    .from('customer')
    .select('name, phone_number, email, address_line')
    .eq('customer_id', context.customerId)
    .single()

  const vars: MessageVariables = {
    customer_name: customer?.name || 'Kund',
    business_name: business?.business_name || 'Handymate',
    business_phone: business?.phone_number || business?.assigned_phone_number || '',
  }

  // Resolve quote variables
  if (context.quoteId) {
    const { data: quote } = await supabase
      .from('quotes')
      .select('quote_id, total, sign_token')
      .eq('quote_id', context.quoteId)
      .single()

    if (quote) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate.se'
      vars.quote_link = quote.sign_token
        ? `${appUrl}/quote/${quote.sign_token}`
        : undefined
    }
  }

  // Resolve booking variables
  if (context.bookingId) {
    const { data: booking } = await supabase
      .from('booking')
      .select('booking_date, booking_time, service_type')
      .eq('booking_id', context.bookingId)
      .single()

    if (booking) {
      vars.booking_date = formatDate(booking.booking_date)
      vars.booking_time = booking.booking_time || ''
    }
  }

  // Resolve invoice variables
  if (context.invoiceId) {
    const { data: invoice } = await supabase
      .from('invoice')
      .select('invoice_number, total, due_date, customer_pays')
      .eq('invoice_id', context.invoiceId)
      .single()

    if (invoice) {
      vars.invoice_number = invoice.invoice_number || ''
      vars.invoice_amount = String(invoice.customer_pays || invoice.total || 0)
      vars.invoice_due_date = invoice.due_date ? formatDate(invoice.due_date) : ''
    }
  }

  // Customer address
  if (customer?.address_line) {
    vars.work_address = customer.address_line
  }

  // Merge extra variables
  if (context.extraVariables) {
    Object.assign(vars, context.extraVariables)
  }

  return vars
}

// ── Message Interpolation ──────────────────────────────────────

export function interpolateMessage(
  template: string,
  variables: MessageVariables
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] ?? match
  })
}

// ── Rate Limiting & Quiet Hours ──────────────────────────────

export async function canSendMessage(
  businessId: string,
  customerId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = getServerSupabase()

  // Get settings
  const settings = await getCommunicationSettings(businessId)

  if (!settings.auto_enabled) {
    return { allowed: false, reason: 'Automatiska meddelanden är avstängda' }
  }

  // Check quiet hours
  if (isQuietHours(settings.quiet_hours_start, settings.quiet_hours_end)) {
    return { allowed: false, reason: 'Tysta timmar' }
  }

  // Check weekly rate limit per customer
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { count } = await supabase
    .from('communication_log')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .gte('created_at', weekAgo.toISOString())
    .in('status', ['sent', 'delivered'])

  if ((count || 0) >= settings.max_sms_per_customer_per_week) {
    return {
      allowed: false,
      reason: `Max ${settings.max_sms_per_customer_per_week} meddelanden per vecka redan skickade`,
    }
  }

  return { allowed: true }
}

function isQuietHours(startStr: string, endStr: string): boolean {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const currentMinutes = hours * 60 + minutes

  const [startH, startM] = startStr.split(':').map(Number)
  const [endH, endM] = endStr.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  // Handle overnight quiet hours (e.g., 21:00 - 07:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// ── Send Message ──────────────────────────────────────────────

export async function sendSmartMessage(params: {
  businessId: string
  customerId: string
  ruleId?: string
  channel: 'sms' | 'email'
  recipient: string
  message: string
  aiReason?: string
  context?: CommunicationContext
}): Promise<{ success: boolean; logId?: string; error?: string }> {
  const supabase = getServerSupabase()

  // Get business name for SMS sender
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', params.businessId)
    .single()

  let sendSuccess = false
  let errorMessage: string | undefined

  if (params.channel === 'sms') {
    if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
      errorMessage = '46elks credentials not configured'
    } else {
      try {
        const response = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            Authorization:
              'Basic ' +
              Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: (business?.business_name || 'Handymate').substring(0, 11),
            to: params.recipient,
            message: params.message,
          }),
        })

        sendSuccess = response.ok
        if (!response.ok) {
          const result = await response.json()
          errorMessage = result.message || 'SMS failed'
        }
      } catch (err: any) {
        errorMessage = err.message
      }
    }
  }

  // Log the communication
  const { data: log } = await supabase
    .from('communication_log')
    .insert({
      business_id: params.businessId,
      customer_id: params.customerId,
      deal_id: params.context?.dealId || null,
      order_id: params.context?.orderId || null,
      invoice_id: params.context?.invoiceId || null,
      rule_id: params.ruleId || null,
      channel: params.channel,
      recipient: params.recipient,
      message: params.message,
      ai_reason: params.aiReason || null,
      status: sendSuccess ? 'sent' : 'failed',
      error_message: errorMessage || null,
    })
    .select('id')
    .single()

  return {
    success: sendSuccess,
    logId: log?.id,
    error: errorMessage,
  }
}

// ── Event-based Communication Trigger ──────────────────────────

export async function triggerEventCommunication(params: {
  businessId: string
  event: string
  customerId: string
  context?: Partial<CommunicationContext>
}): Promise<void> {
  try {
    const supabase = getServerSupabase()
    const settings = await getCommunicationSettings(params.businessId)

    if (!settings.auto_enabled) return

    // Check if this event type is enabled in settings
    const eventSettingsMap: Record<string, keyof CommunicationSettings> = {
      booking_created: 'send_booking_confirmation',
      quote_sent: 'send_quote_followup',
      project_completed: 'send_job_completed',
      invoice_sent: 'send_invoice_reminder',
      invoice_paid: 'send_review_request',
    }

    const settingKey = eventSettingsMap[params.event]
    if (settingKey && !settings[settingKey]) return

    // Find matching rules (system + business-specific)
    const { data: rules } = await supabase
      .from('communication_rule')
      .select('*')
      .eq('trigger_type', 'event')
      .eq('is_enabled', true)
      .or(`business_id.is.null,business_id.eq.${params.businessId}`)
      .order('sort_order')

    if (!rules || rules.length === 0) return

    // Find the rule matching this event
    const matchingRule = rules.find(
      (r: any) => r.trigger_config?.event === params.event
    )
    if (!matchingRule) return

    // Check if business has a custom override for this rule
    const { data: businessOverride } = await supabase
      .from('communication_rule')
      .select('*')
      .eq('business_id', params.businessId)
      .eq('trigger_type', 'event')
      .eq('is_enabled', true)
      .filter('trigger_config->>event', 'eq', params.event)
      .single()

    const ruleToUse = businessOverride || matchingRule

    // Get customer phone
    const { data: customer } = await supabase
      .from('customer')
      .select('phone_number, name')
      .eq('customer_id', params.customerId)
      .single()

    if (!customer?.phone_number) return

    // Check rate limits
    const canSend = await canSendMessage(params.businessId, params.customerId)
    if (!canSend.allowed) {
      console.log(`Communication skipped for ${params.customerId}: ${canSend.reason}`)
      return
    }

    // Resolve variables and send
    const fullContext: CommunicationContext = {
      businessId: params.businessId,
      customerId: params.customerId,
      ...params.context,
    }

    const variables = await resolveMessageVariables(fullContext)
    const message = interpolateMessage(ruleToUse.message_template, variables)

    // Apply delay if configured
    const delayMinutes = ruleToUse.trigger_config?.delay_minutes || 0
    if (delayMinutes > 0) {
      // For now, use a simple setTimeout. In production, use a job queue.
      setTimeout(async () => {
        await sendSmartMessage({
          businessId: params.businessId,
          customerId: params.customerId,
          ruleId: ruleToUse.id,
          channel: ruleToUse.channel === 'email' ? 'email' : 'sms',
          recipient: customer.phone_number,
          message,
          aiReason: `Automatiskt: ${ruleToUse.name}`,
          context: fullContext,
        })
      }, delayMinutes * 60 * 1000)
    } else {
      await sendSmartMessage({
        businessId: params.businessId,
        customerId: params.customerId,
        ruleId: ruleToUse.id,
        channel: ruleToUse.channel === 'email' ? 'email' : 'sms',
        recipient: customer.phone_number,
        message,
        aiReason: `Automatiskt: ${ruleToUse.name}`,
        context: fullContext,
      })
    }
  } catch (err) {
    console.error('Event communication trigger error (non-blocking):', err)
  }
}

// ── Settings Helper ──────────────────────────────────────────

export async function getCommunicationSettings(
  businessId: string
): Promise<CommunicationSettings> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('communication_settings')
    .select('*')
    .eq('business_id', businessId)
    .single()

  if (data) return data as CommunicationSettings

  // Return defaults if no settings exist
  return {
    id: '',
    business_id: businessId,
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
  }
}

// ── Utility ──────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('sv-SE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr
  }
}
