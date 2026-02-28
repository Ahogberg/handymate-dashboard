import { google } from 'googleapis'
import { getGoogleAuthClient } from './google-calendar'

/**
 * Send an email via Gmail API.
 * Requires 'gmail.send' scope to be granted.
 */
export async function sendGmailEmail(
  accessToken: string,
  params: { to: string; subject: string; body: string }
): Promise<{ messageId: string; threadId: string }> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const gmail = google.gmail({ version: 'v1', auth: client })

  // Build RFC 2822 email
  const messageParts = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    params.body,
  ]
  const rawMessage = messageParts.join('\r\n')

  // Base64url encode
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })

  return {
    messageId: data.id || '',
    threadId: data.threadId || '',
  }
}

export interface GmailThread {
  threadId: string
  subject: string
  snippet: string
  from: string
  to: string
  date: string
  messageCount: number
  isUnread: boolean
}

export interface GmailMessage {
  messageId: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  bodyText: string | null
  bodyHtml: string | null
}

/**
 * Search Gmail for emails matching a customer's email address.
 * Returns thread summaries (no body content — GDPR).
 * Max 20 results per call.
 */
export async function getCustomerEmails(
  accessToken: string,
  customerEmail: string,
  maxResults = 20
): Promise<GmailThread[]> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const gmail = google.gmail({ version: 'v1', auth: client })

  // Search for threads involving this email
  const query = `from:${customerEmail} OR to:${customerEmail}`
  const { data } = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults,
  })

  if (!data.threads || data.threads.length === 0) {
    return []
  }

  // Fetch thread metadata (not full body)
  const threads: GmailThread[] = []
  for (const thread of data.threads) {
    if (!thread.id) continue

    const { data: threadData } = await gmail.users.threads.get({
      userId: 'me',
      id: thread.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Date'],
    })

    const firstMessage = threadData.messages?.[0]
    if (!firstMessage) continue

    const headers = firstMessage.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

    const labelIds = firstMessage.labelIds || []

    threads.push({
      threadId: thread.id,
      subject: getHeader('Subject') || '(Inget ämne)',
      snippet: threadData.messages?.[threadData.messages.length - 1]?.snippet || '',
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      messageCount: threadData.messages?.length || 1,
      isUnread: labelIds.includes('UNREAD'),
    })
  }

  return threads
}

/**
 * Get a single email message with full body content.
 * Called on-demand when user clicks to expand — never stored in DB (GDPR).
 */
export async function getEmailContent(
  accessToken: string,
  messageId: string
): Promise<GmailMessage | null> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const gmail = google.gmail({ version: 'v1', auth: client })

  const { data } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  if (!data) return null

  const headers = data.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

  // Extract body from parts
  let bodyText: string | null = null
  let bodyHtml: string | null = null

  function extractBody(payload: any) {
    if (!payload) return

    const mimeType = payload.mimeType || ''

    if (mimeType === 'text/plain' && payload.body?.data) {
      bodyText = Buffer.from(payload.body.data, 'base64').toString('utf-8')
    }
    if (mimeType === 'text/html' && payload.body?.data) {
      bodyHtml = Buffer.from(payload.body.data, 'base64').toString('utf-8')
    }

    // Recurse into parts
    if (payload.parts) {
      for (const part of payload.parts) {
        extractBody(part)
      }
    }
  }

  extractBody(data.payload)

  return {
    messageId: data.id || messageId,
    threadId: data.threadId || '',
    subject: getHeader('Subject') || '(Inget ämne)',
    from: getHeader('From'),
    to: getHeader('To'),
    date: getHeader('Date'),
    snippet: data.snippet || '',
    bodyText,
    bodyHtml,
  }
}

/**
 * Get all messages in a thread with full body content.
 * Used when expanding a thread in the timeline.
 */
export async function getThreadMessages(
  accessToken: string,
  threadId: string
): Promise<GmailMessage[]> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const gmail = google.gmail({ version: 'v1', auth: client })

  const { data } = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  })

  if (!data.messages) return []

  return data.messages.map((msg) => {
    const headers = msg.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

    let bodyText: string | null = null
    let bodyHtml: string | null = null

    function extractBody(payload: any) {
      if (!payload) return
      const mimeType = payload.mimeType || ''
      if (mimeType === 'text/plain' && payload.body?.data) {
        bodyText = Buffer.from(payload.body.data, 'base64').toString('utf-8')
      }
      if (mimeType === 'text/html' && payload.body?.data) {
        bodyHtml = Buffer.from(payload.body.data, 'base64').toString('utf-8')
      }
      if (payload.parts) {
        for (const part of payload.parts) {
          extractBody(part)
        }
      }
    }

    extractBody(msg.payload)

    return {
      messageId: msg.id || '',
      threadId: msg.threadId || threadId,
      subject: getHeader('Subject') || '(Inget ämne)',
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      snippet: msg.snippet || '',
      bodyText,
      bodyHtml,
    }
  })
}
