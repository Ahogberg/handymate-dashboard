/**
 * Centralized email sending via Resend API.
 * Used by nurture sequences, invoices, quotes, and other automated emails.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  fromName?: string
  fromAddress?: string
  replyTo?: string
  /** Kontaktad (2026-08-28): med businessId + customerId flyttas kundens öppna affärer till Kontaktad vid lyckat utskick. */
  businessId?: string | null
  customerId?: string | null
  /** Immutable reviewed document bytes; never re-render at the provider boundary. */
  attachments?: Array<{ filename: string; content: string }>
  idempotencyKey?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
  deliveryState?: 'accepted' | 'rejected' | 'unknown'
}

/**
 * Send an email via Resend API
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    return { success: false, deliveryState: 'rejected', error: 'RESEND_API_KEY not configured' }
  }

  const {
    to,
    subject,
    html,
    fromName = 'Handymate',
    fromAddress = 'noreply@handymate.se',
    replyTo,
    businessId,
    customerId,
  } = params

  try {
    const body: Record<string, any> = {
      from: `${fromName} <${fromAddress}>`,
      to: [to],
      subject,
      html,
    }
    if (replyTo) body.reply_to = replyTo
    if (params.attachments?.length) body.attachments = params.attachments

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(params.idempotencyKey ? { 'Idempotency-Key': params.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, deliveryState: response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 409 ? 'rejected' : 'unknown', error: `Resend error: ${errorText}` }
    }

    const data = await response.json()
    if (typeof data.id !== 'string' || !data.id) return { success: false, deliveryState: 'unknown', error: 'Mejltjänstens svar saknar leveransreferens' }
    if (businessId && customerId) {
      try {
        const { markCustomerContacted } = await import('@/lib/pipeline/contacted')
        const { getServerSupabase } = await import('@/lib/supabase')
        await markCustomerContacted(getServerSupabase(), businessId, customerId, 'mejl')
      } catch { /* best-effort */ }
    }
    return { success: true, deliveryState: 'accepted', messageId: data.id }
  } catch (error: any) {
    return { success: false, deliveryState: 'unknown', error: error.message }
  }
}

/**
 * Log email to communication_log table
 */
export async function logEmail(params: {
  businessId: string
  customerId?: string
  to: string
  subject: string
  channel?: string
  status: string
  messageId?: string
}): Promise<void> {
  try {
    const { getServerSupabase } = await import('@/lib/supabase')
    const supabase = getServerSupabase()
    await supabase.from('communication_log').insert({
      business_id: params.businessId,
      customer_id: params.customerId || null,
      channel: params.channel || 'email',
      direction: 'outbound',
      subject: params.subject,
      message: params.to,
      status: params.status,
      metadata: { message_id: params.messageId },
    })
  } catch {
    // communication_log table may not exist yet
  }
}
