/**
 * Centralized email sending via Resend API.
 * Used by nurture sequences, invoices, quotes, and other automated emails.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY

export interface SendEmailParams {
  /** En eller flera mottagare. Flera används bara av vägar utan H3b-löfte. */
  to: string | string[]
  subject: string
  html: string
  /** Ren text i stället för HTML (agentens send_email skickar text). */
  text?: string
  /** Hemlig kopia. Offertvägen skickar kopia till hantverkaren själv. */
  bcc?: string[]
  fromName?: string
  fromAddress?: string
  replyTo?: string
  /** Kontaktad (2026-08-28): med businessId + customerId flyttas kundens öppna affärer till Kontaktad vid lyckat utskick. */
  businessId?: string | null
  customerId?: string | null
  /** Immutable reviewed document bytes; never re-render at the provider boundary.
   *  content: base64-sträng eller Buffer (fakturans PDF kommer som Buffer). */
  attachments?: Array<{ filename: string; content: string | Buffer }>
  idempotencyKey?: string
  /** Stable source identity for H3b recovery. */
  outbound?: {
    source: import('@/lib/outbound/intents').OutboundSource
    sourceId: string
    dedupeKey: string
    template: string
    autonomyKey?: import('@/lib/autonomy/earned-autonomy').AutonomyKey
    auditId?: string
  }
  outboundReconcile?: { type: 'invoice_reminder'; input: Record<string, unknown> }
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
  channelSkipped?: boolean
  channelReason?: string
  deliveryState?: 'accepted' | 'rejected' | 'unknown'
}

/** Alla mottagare som lista, alltid minst ett element för en giltig parameter. */
export function mottagarlista(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map(t => String(t).trim()).filter(Boolean)
}

/** Nyckeln H3b-löftet identifieras på. Flera mottagare ⇒ en stabil, sorterad nyckel. */
function mottagarnyckel(to: string | string[]): string {
  return mottagarlista(to).map(t => t.toLowerCase()).sort().join(',')
}

/**
 * Send an email via Resend API
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (process.env.OUTBOUND_INTENTS_ENABLED === 'true' && params.outbound && params.businessId) {
    const { getServerSupabase } = await import('@/lib/supabase')
    const { withOutboundSource } = await import('@/lib/outbound/source')
    const db = getServerSupabase()
    const outcome = await withOutboundSource<import('@/lib/outbound/source').EmailEnvelope>(db, {
      promise: {
        businessId: params.businessId, kind: 'email', source: params.outbound.source,
        sourceId: params.outbound.sourceId, dedupeKey: params.outbound.dedupeKey,
        recipient: mottagarnyckel(params.to), template: params.outbound.template,
        autonomyKey: params.outbound.autonomyKey,
        context: params.fromAddress || params.outbound.auditId ? {
          ...(params.fromAddress ? { fromAddress: params.fromAddress } : {}),
          ...(params.outbound.auditId ? { auditId: params.outbound.auditId } : {}),
        } : undefined,
      },
      envelope: {
        subject: params.subject, html: params.html, fromName: params.fromName,
        fromAddress: params.fromAddress, replyTo: params.replyTo, customerId: params.customerId,
        // Bilagor persisteras som JSON i outbound_messages — en Buffer måste
        // bli base64 INNAN den lagras, annars går bytesen förlorade vid sweep.
        attachments: params.attachments?.map(a => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
        })),
        reconcile: params.outboundReconcile,
      },
    }, async (_intent, envelope) => {
      const result = emailProviderOutcome(await sendEmailWithoutOutbound({
        ...envelope, to: params.to, businessId: params.businessId,
        idempotencyKey: params.idempotencyKey || params.outbound!.dedupeKey,
      }))
      if (result.status === 'sent' && envelope.reconcile?.type === 'invoice_reminder') {
        const receipt = await (await import('@/lib/invoice-reminder-send')).reconcileInvoiceReminder(db, envelope.reconcile.input as any, { emailSent: true })
        if (!receipt.reconciled) throw new Error(receipt.error || 'Påminnelsekvittensen kunde inte sparas')
      }
      return result
    })
    if (outcome.status === 'sent') return { success: true, deliveryState: 'accepted', messageId: outcome.providerRef }
    if (outcome.status === 'pending' || outcome.status === 'skipped') return { success: false, deliveryState: 'rejected', channelSkipped: true, channelReason: 'konfiguration', error: 'Utskicket väntar tills kanalen kan användas.' }
    return { success: false, deliveryState: outcome.status === 'failed' ? 'rejected' : 'unknown',
      error: outcome.status === 'failed' ? 'E-posttjänsten avvisade utskicket.' : 'Leveransbesked saknas. Skicka inte igen innan utfallet har kontrollerats.' }
  }
  return sendEmailWithoutOutbound(params)
}

export function emailProviderOutcome(result: SendEmailResult): import('@/lib/outbound/promise').ProviderOutcome {
  if (result.success && result.messageId) return { status: 'sent', providerRef: result.messageId }
  if (result.deliveryState === 'rejected') return { status: result.channelSkipped ? 'skipped' : 'failed', error: result.error }
  return { status: 'unknown', error: result.error }
}

/** Used by the H3b sweeper after reading and validating the immutable source. */
export function sendPersistedEmail(params: SendEmailParams) {
  return sendEmailWithoutOutbound({ ...params, outbound: undefined, outboundReconcile: undefined })
}

async function sendEmailWithoutOutbound(params: SendEmailParams): Promise<SendEmailResult> {
  if (params.businessId && process.env.CHANNEL_PREFLIGHT_ENABLED === 'true') {
    const { getServerSupabase } = await import('@/lib/supabase')
    const { gateChannel } = await import('@/lib/channels/preflight')
    const check = await gateChannel(getServerSupabase(), params.businessId, 'email', { fromAddress: params.fromAddress })
    if (!check.ok) return { success: false, deliveryState: 'rejected', channelSkipped: true, channelReason: check.reason, error: check.message }
  }

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

  const mottagare = mottagarlista(to)
  if (mottagare.length === 0) {
    return { success: false, deliveryState: 'rejected', error: 'Ingen mottagare angiven' }
  }

  try {
    const body: Record<string, any> = {
      from: `${fromName} <${fromAddress}>`,
      to: mottagare,
      subject,
    }
    // Agentvägen skickar ren text; allt annat HTML. Resend kräver minst en.
    if (html) body.html = html
    if (params.text) body.text = params.text
    if (replyTo) body.reply_to = replyTo
    if (params.bcc?.length) body.bcc = params.bcc
    if (params.attachments?.length) {
      body.attachments = params.attachments.map(a => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
      }))
    }

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
    // Leveranskvittot (Spår 2) behöver en rad som bär Resend-id:t — annars
    // har `email.delivered`/`email.bounced` ingenting att uppdatera. Raden
    // skrivs här i strypunkten så att ALLA vägar får ett kvitto, inte bara de
    // sex som råkade anropa logEmail. Deterministiskt id ⇒ en caller som
    // dessutom anropar logEmail skriver samma rad, inte en dubblett.
    if (businessId) {
      await logEmail({
        businessId, customerId: customerId || undefined, to: mottagare.join(', '),
        subject, status: 'sent', messageId: data.id,
      })
    }
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
    const rad = {
      business_id: params.businessId,
      customer_id: params.customerId || null,
      channel: params.channel || 'email',
      direction: 'outbound',
      subject: params.subject,
      message: params.to,
      status: params.status,
      // v261: leveranskvittot slår upp raden på provider_message_id. Det låg
      // tidigare bara i metadata-jsonben, som varken är indexerat eller unikt.
      provider_message_id: params.messageId || null,
      metadata: { message_id: params.messageId },
    }
    if (params.messageId) {
      // Deterministiskt id + upsert: strypunkten och en caller som ändå
      // anropar logEmail ger EN rad, inte två.
      await supabase.from('communication_log')
        .upsert({ ...rad, id: `cl_mail_${params.messageId}` }, { onConflict: 'id' })
    } else {
      await supabase.from('communication_log').insert(rad)
    }
  } catch {
    // communication_log table may not exist yet
  }
}
