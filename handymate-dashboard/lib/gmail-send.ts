import { getServerSupabase } from '@/lib/supabase'

/**
 * Refresh Google OAuth access token using refresh_token.
 */
async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token || null
  } catch {
    return null
  }
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
  const supabase = getServerSupabase()

  // Hämta OAuth-tokens
  const { data: biz } = await supabase
    .from('business_config')
    .select('google_access_token, google_refresh_token, gmail_send_enabled')
    .eq('business_id', businessId)
    .single()

  if (!biz?.google_refresh_token || !biz?.gmail_send_enabled) {
    return false
  }

  // Refresha token
  let accessToken = biz.google_access_token
  if (!accessToken) {
    accessToken = await refreshGoogleToken(biz.google_refresh_token)
    if (!accessToken) return false

    // Spara ny token
    await supabase
      .from('business_config')
      .update({ google_access_token: accessToken })
      .eq('business_id', businessId)
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
    const newToken = await refreshGoogleToken(biz.google_refresh_token)
    if (!newToken) return false

    await supabase
      .from('business_config')
      .update({ google_access_token: newToken })
      .eq('business_id', businessId)

    const retryRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${newToken}`,
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
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('business_config')
    .select('gmail_send_enabled, gmail_email')
    .eq('business_id', businessId)
    .single()

  return {
    enabled: !!data?.gmail_send_enabled,
    email: data?.gmail_email || undefined,
  }
}
