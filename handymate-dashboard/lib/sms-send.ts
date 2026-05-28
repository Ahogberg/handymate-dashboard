import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSwedishPhone } from './phone-normalize'
import { sanitizeSenderId } from './sms/sender-id'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

export interface SendSmsArgs {
  supabase: SupabaseClient
  businessId: string
  /** Används som 46elks `from`-fält (max 11 tecken). Default 'Handymate'. */
  businessName?: string | null
  /** Mottagarens nummer — accepteras i valfri svensk form (0708..., +46708..., 46708...). Normaliseras till E.164 internt. */
  to: string
  message: string
  customerId?: string | null
  /** Domain-id för att kunna spåra vilket objekt som triggade SMS:et — t.ex. change_id för ATA-send. */
  relatedId?: string | null
  /** Lös enum för audit/filter — t.ex. 'ata_send', 'on_my_way', 'reminder'. */
  messageType?: string | null
}

export interface SendSmsResult {
  success: boolean
  /** Vårt eget sms_log.sms_id om INSERT lyckades */
  smsId?: string
  /** 46elks egna id (när success=true) */
  elksId?: string
  /** HTTP-status från 46elks (eller null vid fetch-exception) */
  status?: number | null
  /** Felmeddelande när success=false. PostgrestError-detalj om sms_log INSERT failade. */
  error?: string
}

/**
 * Skickar SMS direkt mot 46elks och loggar till sms_log.
 *
 * Återanvänd från andra routes (t.ex. /api/ata/[id]/send) istället för
 * intern fetch mot /api/sms/send — relativ URL fungerar inte server-side
 * och route-routen har dessutom rate-limit/billing/auth-check som inte
 * är relevanta för system-triggade SMS.
 *
 * Loggar både success och fail i sms_log så audit-spår alltid finns.
 * Fail-loggning sker även om INSERT failar (logging är non-blocking).
 *
 * Tracking av SMS-quota (trackSmsSent) görs INTE här — det är ett
 * separat feature-gate som user-facing /api/sms/send hanterar. Om
 * system-flow ska räknas mot kvoten, gör det manuellt på callsite.
 */
export async function sendSmsViaElks(args: SendSmsArgs): Promise<SendSmsResult> {
  const { supabase, businessId, businessName, to, message, customerId, relatedId, messageType } = args

  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    return { success: false, error: '46elks credentials not configured' }
  }

  // E.164-normalisering. Idempotent — redan E.164-input passerar oförändrat.
  const phone = normalizeSwedishPhone(to)
  if (!phone || !phone.startsWith('+')) {
    return { success: false, error: `Ogiltigt telefonnummer: "${to}"` }
  }

  const fromName = sanitizeSenderId(businessName)
  const smsId = 'sms_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

  let elksId: string | undefined
  let status: number | null = null
  let errorMsg: string | undefined
  let success = false

  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: fromName,
        to: phone,
        message,
      }),
    })

    status = response.status
    const responseText = await response.text()
    let result: any = null
    try {
      result = JSON.parse(responseText)
    } catch {
      // 46elks returnerar ibland plaintext på fel — det är OK
    }

    if (response.ok) {
      success = true
      elksId = result?.id || undefined
    } else {
      errorMsg = result?.message || responseText.substring(0, 300) || `HTTP ${status}`
      console.error('[sendSmsViaElks] 46elks error:', {
        status,
        body: (errorMsg || '').substring(0, 200),
        to: phone,
      })
    }
  } catch (err: any) {
    errorMsg = err?.message || 'fetch exception'
    console.error('[sendSmsViaElks] fetch exception:', err)
  }

  // Logga i sms_log (även misslyckanden för audit-spår). Non-blocking.
  try {
    const { error: insertErr } = await supabase.from('sms_log').insert({
      sms_id: smsId,
      business_id: businessId,
      customer_id: customerId || null,
      direction: 'outbound',
      phone_from: fromName,
      phone_to: phone,
      message,
      status: success ? 'sent' : 'failed',
      elks_id: elksId || null,
      error_message: errorMsg || null,
      message_type: messageType || null,
      related_id: relatedId || null,
      sent_at: success ? new Date().toISOString() : null,
    })
    if (insertErr) {
      console.error('[sendSmsViaElks] sms_log insert error:', insertErr)
    }
  } catch (logErr) {
    console.error('[sendSmsViaElks] sms_log insert exception:', logErr)
  }

  return {
    success,
    smsId,
    elksId,
    status,
    error: success ? undefined : errorMsg,
  }
}
