import { findGmailMessage } from './message-identity'
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
  gmail_sync_started_at: string | null
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
const CONNECTION_FIELDS = 'id, business_id, access_token, refresh_token, token_expires_at, account_email, gmail_last_polled_at, gmail_last_history_id, gmail_sync_started_at'
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)
const isNotFound = (error: unknown) => {
  const value = error as { code?: unknown; response?: { status?: number } }
  return Number(value?.code) === 404 || value?.response?.status === 404
}

export async function pollGmailForBusiness(
  requested: GmailConnection,
  deadlineAt = Date.now() + 45000
): Promise<{ processed: number; stored: number; error?: string }> {
  let processed = 0, stored = 0
  try {
    const supabase = getServerSupabase()
    // Re-read consent and account identity, including for direct callers. A
    // snapshot collected by cron is not proof that sync is still enabled.
    const { data: fresh, error: readError } = await supabase.from('calendar_connection')
      .select(CONNECTION_FIELDS).eq('id', requested.id).eq('business_id', requested.business_id)
      .eq('gmail_scope_granted', true).eq('gmail_sync_enabled', true).maybeSingle()
    if (readError) throw new Error('Gmail-anslutningen kunde inte kontrolleras.')
    if (!fresh?.refresh_token) return { processed, stored }
    const connection = fresh as GmailConnection
    const originalHistory = connection.gmail_last_history_id
    const activeRow = () => supabase.from('calendar_connection')
      .select('id').eq('id', connection.id).eq('business_id', connection.business_id)
      .eq('account_email', connection.account_email).eq('refresh_token', connection.refresh_token)
      .eq('gmail_scope_granted', true).eq('gmail_sync_enabled', true)
    const checkActive = async () => {
      if (Date.now() >= deadlineAt) throw new Error('Mejlsynken behöver fortsätta i nästa körning. Läspositionen är oförändrad.')
      const { data, error } = await activeRow().maybeSingle()
      if (error || !data) throw new Error('Mejlsynken pausades eller anslutningen ändrades. Läspositionen är oförändrad.')
    }
    const updateRow = (values: Record<string, unknown>) => supabase.from('calendar_connection')
      .update(values).eq('id', connection.id).eq('business_id', connection.business_id)
      .eq('account_email', connection.account_email).eq('refresh_token', connection.refresh_token)
      .eq('gmail_scope_granted', true).eq('gmail_sync_enabled', true)

    const refreshed = await ensureValidToken(connection)
    if (!refreshed) throw new Error('Google-inloggningen behöver förnyas.')
    if (refreshed.access_token !== connection.access_token) {
      const { data, error } = await updateRow({ access_token: refreshed.access_token,
        token_expires_at: new Date(refreshed.expiry_date).toISOString() }).select('id').maybeSingle()
      if (error || !data) throw new Error('Google-inloggningen kunde inte sparas.')
    }
    const client = getGoogleAuthClient()
    client.setCredentials({ access_token: refreshed.access_token })
    const gmail = google.gmail({ version: 'v1', auth: client })
    const ids = new Set<string>()
    let newHistoryId: string | null = null
    let pageToken: string | undefined
    const seenTokens = new Set<string>()
    const nextPage = (token: string | null | undefined) => {
      if (token && seenTokens.has(token)) throw new Error('Google upprepade en sida. Läspositionen är oförändrad.')
      if (token) seenTokens.add(token)
      pageToken = token || undefined
    }
    if (originalHistory) {
      do {
        await checkActive()
        let historyData
        try {
          const response = await gmail.users.history.list({ userId: 'me', startHistoryId: originalHistory,
            historyTypes: ['messageAdded'], labelId: 'INBOX', maxResults: 100, pageToken })
          historyData = response.data
        } catch (error) {
          // An expired cursor needs an explicit backfill. A recent-only fallback
          // would silently omit older messages from the missing history interval.
          if (isNotFound(error)) throw new Error('Gmail-historiken har gått ut. Återläsning krävs; synken har inte hoppat över intervallet.')
          throw error
        }
        for (const entry of historyData.history || []) {
          for (const added of entry.messagesAdded || []) if (added.message?.id) ids.add(added.message.id)
        }
        nextPage(historyData.nextPageToken)
        // Only the last page's cursor covers the complete history response.
        if (!pageToken) newHistoryId = historyData.historyId?.toString() || null
      } while (pageToken)
    } else {
      if (!connection.gmail_sync_started_at) {
        const anchor = new Date().toISOString()
        const { data, error } = await updateRow({ gmail_sync_started_at: anchor })
          .is('gmail_sync_started_at', null).is('gmail_last_history_id', null).select('id').maybeSingle()
        if (error || !data) throw new Error('Startpunkten ändrades eller kunde inte sparas. Försök igen.')
        connection.gmail_sync_started_at = anchor
      }
      const anchor = Date.parse(connection.gmail_sync_started_at)
      if (!Number.isFinite(anchor)) throw new Error('Mejlsynkens startpunkt är ogiltig.')
      // Capture baseline BEFORE listing. Messages arriving while listing are
      // replayed by the next history pass instead of falling into a gap.
      const { data: profile } = await gmail.users.getProfile({ userId: 'me' })
      newHistoryId = profile.historyId?.toString() || null
      do {
        await checkActive()
        const { data } = await gmail.users.messages.list({ userId: 'me', maxResults: 100,
          q: `in:inbox after:${Math.floor((anchor - 86400000) / 1000)}`, pageToken })
        for (const message of data.messages || []) if (message.id) ids.add(message.id)
        nextPage(data.nextPageToken)
      } while (pageToken)
    }
    if (!newHistoryId) throw new Error('Google lämnade ingen säker läsposition.')
    for (const id of Array.from(ids)) {
      await checkActive()
      // Previously stored messages need no provider/AI work on a retry. Scope
      // the evidence to this company; another company's row is not a receipt.
      const existing = await findGmailMessage(supabase, connection.business_id, connection.account_email, id)
      if (existing) { processed++; continue }
      let data
      try { ({ data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })) }
      catch (error) {
        if (isNotFound(error)) { processed++; continue } // Deleted at provider, not a transport failure.
        throw error
      }
      if (!data?.id || data.id !== id) throw new Error('Google lämnade ett ofullständigt mejl.')
      await checkActive() // Consent may have changed during the network request.
      const result = await processInboundEmail(supabase, connection.business_id, toGmailMessage(data), connection.account_email)
      if (!result.stored && result.reason !== 'duplicate') throw new Error('Ett mejl kunde inte sparas. Läspositionen är oförändrad.')
      if (result.stored) stored++
      processed++
    }
    let update = updateRow({ gmail_last_polled_at: new Date().toISOString(), gmail_last_history_id: newHistoryId })
    update = originalHistory ? update.eq('gmail_last_history_id', originalHistory) : update.is('gmail_last_history_id', null)
    const { data: saved, error: saveError } = await update.select('id').maybeSingle()
    if (saveError || !saved) throw new Error('Mejlen är behandlade men läspositionen kunde inte kvitteras. Nästa körning kontrollerar dem igen.')
    return { processed, stored }
  } catch (error) {
    return { processed, stored, error: messageOf(error) }
  }
}

export async function pollAllBusinesses(): Promise<{
  businesses: number; totalProcessed: number; totalStored: number; errors: string[]
}> {
  const supabase = getServerSupabase()
  const { data: connections, error } = await supabase.from('calendar_connection')
    .select(CONNECTION_FIELDS).eq('gmail_scope_granted', true).eq('gmail_sync_enabled', true)
    .not('refresh_token', 'is', null)
  if (error) return { businesses: 0, totalProcessed: 0, totalStored: 0, errors: ['Gmail-anslutningarna kunde inte hämtas.'] }
  let totalProcessed = 0, totalStored = 0
  const errors: string[] = []
  const deadline = Date.now() + 45000
  const budget = Math.max(1000, Math.floor(45000 / Math.max(1, connections?.length || 0)))
  for (const connection of connections || []) {
    if (Date.now() >= deadline) { errors.push('Körtiden räckte inte till alla anslutningar; återstående synk behöver fortsätta.'); break }
    try {
      const result = await pollGmailForBusiness(connection as GmailConnection, Math.min(deadline, Date.now() + budget))
      totalProcessed += result.processed; totalStored += result.stored
      if (result.error) errors.push(`${connection.account_email}: ${result.error}`)
    } catch { errors.push(`${connection.account_email}: Mejlsynken avbröts.`) }
  }
  return { businesses: connections?.length || 0, totalProcessed, totalStored, errors }
}
