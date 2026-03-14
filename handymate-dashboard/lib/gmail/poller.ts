/**
 * Gmail Polling Motor.
 * Polls Gmail API for new messages using History API (incremental)
 * or full message list (first run). Processes each message through
 * processInboundEmail().
 */

import { google } from 'googleapis'
import { getServerSupabase } from '@/lib/supabase'
import { getGoogleAuthClient, ensureValidToken } from '@/lib/google-calendar'
import { processInboundEmail } from './processor'
import type { GmailMessage } from '@/lib/gmail'

interface GmailConnection {
  id: string
  business_id: string
  access_token: string
  refresh_token: string
  token_expires_at: string | null
  account_email: string
  gmail_last_polled_at: string | null
  gmail_last_history_id: string | null
}

/**
 * Extract body text from a Gmail message payload (recursive).
 */
function extractBodyText(payload: any): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!payload) return null
  const mimeType = payload.mimeType || ''
  if (mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBodyText(part)
      if (text) return text
    }
  }
  return null
}

/**
 * Get a header value from Gmail message headers.
 */
function getHeader(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

/**
 * Convert a raw Gmail API message to our GmailMessage type.
 */
function toGmailMessage(data: any): GmailMessage { // eslint-disable-line @typescript-eslint/no-explicit-any
  const headers = data.payload?.headers || []
  return {
    messageId: data.id || '',
    threadId: data.threadId || '',
    subject: getHeader(headers, 'Subject') || '(Inget ämne)',
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    date: getHeader(headers, 'Date'),
    snippet: data.snippet || '',
    bodyText: extractBodyText(data.payload),
    bodyHtml: null,
  }
}

/**
 * Poll Gmail for a single business.
 * Uses History API if we have a previous historyId, otherwise fetches recent messages.
 */
export async function pollGmailForBusiness(
  connection: GmailConnection
): Promise<{ processed: number; stored: number; error?: string }> {
  // 1. Ensure valid token
  const refreshed = await ensureValidToken(connection)
  if (!refreshed) {
    return { processed: 0, stored: 0, error: 'Token refresh failed' }
  }

  const supabase = getServerSupabase()

  // Update token if refreshed
  if (refreshed.access_token !== connection.access_token) {
    await supabase
      .from('calendar_connection')
      .update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(refreshed.expiry_date).toISOString(),
      })
      .eq('id', connection.id)
  }

  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: refreshed.access_token })
  const gmail = google.gmail({ version: 'v1', auth: client })

  let messageIds: string[] = []
  let newHistoryId: string | null = null

  try {
    if (connection.gmail_last_history_id) {
      // 2a. Incremental — use History API
      try {
        const { data: historyData } = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: connection.gmail_last_history_id,
          historyTypes: ['messageAdded'],
          labelId: 'INBOX',
        })

        newHistoryId = historyData.historyId?.toString() || null

        if (historyData.history) {
          for (const entry of historyData.history) {
            if (entry.messagesAdded) {
              for (const added of entry.messagesAdded) {
                if (added.message?.id) {
                  messageIds.push(added.message.id)
                }
              }
            }
          }
        }
      } catch (histErr: unknown) {
        const errMsg = histErr instanceof Error ? histErr.message : String(histErr)
        // History expired — fall back to full fetch
        if (errMsg.includes('404') || errMsg.includes('notFound')) {
          console.warn(`[gmail-poll] History expired for ${connection.account_email}, falling back to full fetch`)
          connection.gmail_last_history_id = null
          // Fall through to 2b
        } else {
          throw histErr
        }
      }
    }

    if (!connection.gmail_last_history_id) {
      // 2b. First run or expired history — fetch recent messages
      const { data: listData } = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
        q: 'in:inbox newer_than:1d',
      })

      messageIds = (listData.messages || [])
        .filter(m => m.id)
        .map(m => m.id!)

      // Get current historyId for future incremental polling
      const { data: profile } = await gmail.users.getProfile({ userId: 'me' })
      newHistoryId = profile.historyId?.toString() || null
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[gmail-poll] Error fetching messages for ${connection.account_email}:`, msg)
    return { processed: 0, stored: 0, error: msg }
  }

  // Deduplicate
  messageIds = messageIds.filter((id, idx) => messageIds.indexOf(id) === idx)

  // 3. Fetch and process each message
  let stored = 0
  for (const msgId of messageIds) {
    try {
      const { data: msgData } = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      })

      if (!msgData) continue

      const gmailMessage = toGmailMessage(msgData)
      const result = await processInboundEmail(
        supabase,
        connection.business_id,
        gmailMessage,
        connection.account_email
      )
      if (result.stored) stored++
    } catch (msgErr) {
      console.error(`[gmail-poll] Error processing message ${msgId}:`, msgErr)
    }
  }

  // 4. Update poll tracking
  const updateData: Record<string, unknown> = {
    gmail_last_polled_at: new Date().toISOString(),
  }
  if (newHistoryId) {
    updateData.gmail_last_history_id = newHistoryId
  }
  await supabase
    .from('calendar_connection')
    .update(updateData)
    .eq('id', connection.id)

  return { processed: messageIds.length, stored }
}

/**
 * Poll Gmail for ALL businesses with Gmail connected.
 * Runs sequentially to stay within Gmail API rate limits.
 */
export async function pollAllBusinesses(): Promise<{
  businesses: number
  totalProcessed: number
  totalStored: number
  errors: string[]
}> {
  const supabase = getServerSupabase()

  // Fetch all businesses with Gmail scope granted and a refresh token
  const { data: connections } = await supabase
    .from('calendar_connection')
    .select('id, business_id, access_token, refresh_token, token_expires_at, account_email, gmail_last_polled_at, gmail_last_history_id')
    .eq('gmail_scope_granted', true)
    .not('refresh_token', 'is', null)

  if (!connections || connections.length === 0) {
    return { businesses: 0, totalProcessed: 0, totalStored: 0, errors: [] }
  }

  let totalProcessed = 0
  let totalStored = 0
  const errors: string[] = []

  // Process sequentially (max ~5 businesses is typical, no need for parallelism)
  for (const conn of connections) {
    const result = await pollGmailForBusiness(conn as GmailConnection)
    totalProcessed += result.processed
    totalStored += result.stored
    if (result.error) {
      errors.push(`${conn.account_email}: ${result.error}`)
    }
  }

  return { businesses: connections.length, totalProcessed, totalStored, errors }
}
