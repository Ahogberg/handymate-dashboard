import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken, refreshGoogleToken } from '@/lib/google-calendar'

type GmailConnection = {
  id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  account_email: string | null
  gmail_send_scope_granted: boolean | null
  gmail_sync_enabled: boolean | null
}

async function getGmailConnection(businessId: string): Promise<GmailConnection | null> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('calendar_connection')
    .select('id, access_token, refresh_token, token_expires_at, account_email, gmail_send_scope_granted, gmail_sync_enabled')
    .eq('business_id', businessId)
    .eq('provider', 'google')
    .eq('gmail_send_scope_granted', true)
    .eq('gmail_sync_enabled', true)
    .order('connected_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[gmail-send] Kunde inte läsa Google-anslutningen:', error.message)
    return null
  }
  return data as GmailConnection | null
}

async function persistAccessToken(connectionId: string, accessToken: string, expiryDate: number): Promise<boolean> {
  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('calendar_connection')
    .update({
      access_token: accessToken,
      token_expires_at: new Date(expiryDate).toISOString(),
      sync_error: null,
    })
    .eq('id', connectionId)

  if (error) {
    console.error('[gmail-send] Kunde inte spara förnyad Google-token:', error.message)
    return false
  }
  return true
}

/**
 * Bygg ett RFC 2822 MIME-meddelande med HTML-body.
 */
function buildMimeMessage(opts: {
  from: string
  to: string[]
  subject: string
  html: string
  replyTo?: string
  bcc?: string[]
}): string {
  const boundary = `boundary_${Date.now()}`
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(', ')}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  if (opts.replyTo) lines.push(`Reply-To: ${opts.replyTo}`)
  if (opts.bcc?.length) lines.push(`Bcc: ${opts.bcc.join(', ')}`)
  lines.push('', `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '')
  lines.push(Buffer.from(opts.html).toString('base64'))
  lines.push(`--${boundary}--`)
  return lines.join('\r\n')
}

/**
 * Skicka mail via Gmail API (OAuth).
 * Returnerar true om det gick, false annars.
 */
export async function sendViaGmail(
  businessId: string,
  opts: {
    to: string[]
    subject: string
    html: string
    fromName: string
    fromEmail: string
    replyTo?: string
    bcc?: string[]
  }
): Promise<boolean> {
  // OAuth-hemligheter hör hemma i integrationslagret. business_config har
  // aldrig haft de gamla google_*/gmail_*-kolumner som denna funktion läste.
  const connection = await getGmailConnection(businessId)
  if (!connection?.refresh_token || !connection.access_token) {
    return false
  }

  const tokenResult = await ensureValidToken({
    id: connection.id,
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
    token_expires_at: connection.token_expires_at,
  })
  if (!tokenResult) return false

  let accessToken = tokenResult.access_token
  if (accessToken !== connection.access_token) {
    const saved = await persistAccessToken(connection.id, accessToken, tokenResult.expiry_date)
    if (!saved) return false
  }

  const rawMime = buildMimeMessage({
    from: `${opts.fromName} <${opts.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
    bcc: opts.bcc,
  })

  // Base64url-encode
  const encoded = Buffer.from(rawMime)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  if (res.status === 401) {
    // Token expired — retry med refreshad token
    let refreshed
    try {
      refreshed = await refreshGoogleToken(connection.refresh_token)
    } catch (error) {
      console.error('[gmail-send] Google-token kunde inte förnyas efter 401:', error)
      return false
    }
    const saved = await persistAccessToken(connection.id, refreshed.access_token, refreshed.expiry_date)
    if (!saved) return false
    accessToken = refreshed.access_token

    const retryRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    })

    return retryRes.ok
  }

  return res.ok
}

/**
 * Kolla om Gmail-sändning är aktiverad för ett företag.
 */
export async function isGmailSendEnabled(businessId: string): Promise<{ enabled: boolean; email?: string }> {
  const connection = await getGmailConnection(businessId)

  return {
    enabled: !!connection?.account_email,
    email: connection?.account_email || undefined,
  }
}
