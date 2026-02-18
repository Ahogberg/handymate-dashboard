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
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send an email via Resend API
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const {
    to,
    subject,
    html,
    fromName = 'Handymate',
    fromAddress = 'noreply@handymate.se',
    replyTo,
  } = params

  try {
    const body: Record<string, any> = {
      from: `${fromName} <${fromAddress}>`,
      to: [to],
      subject,
      html,
    }
    if (replyTo) body.reply_to = replyTo

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Resend error: ${errorText}` }
    }

    const data = await response.json()
    return { success: true, messageId: data.id }
  } catch (error: any) {
    return { success: false, error: error.message }
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
