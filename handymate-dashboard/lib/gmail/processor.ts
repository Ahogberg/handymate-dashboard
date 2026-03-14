/**
 * Gmail inbound email processor.
 * Matches incoming mail to existing customers/leads, stores in email_conversations,
 * and fires events for the automation engine / agent system.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { GmailMessage } from '@/lib/gmail'

interface BusinessConfig {
  business_id: string
  business_name: string
  contact_email: string | null
}

interface MatchResult {
  customer_id: string | null
  lead_id: string | null
  matched_by: 'email' | 'name' | 'phone' | 'unmatched'
}

/**
 * Extract a clean email address from a "Name <email@domain.com>" string.
 */
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match ? match[1] : from).trim().toLowerCase()
}

/**
 * Extract display name from a "Name <email@domain.com>" string.
 */
function extractName(from: string): string {
  const match = from.match(/^([^<]+)</)
  return match ? match[1].trim().replace(/"/g, '') : ''
}

/**
 * Check if the email is from the business owner (outbound).
 */
function isFromOwner(message: GmailMessage, ownerEmail: string): boolean {
  const fromEmail = extractEmail(message.from)
  return fromEmail === ownerEmail.toLowerCase()
}

/**
 * Match an inbound email to an existing customer or lead.
 */
async function matchSender(
  supabase: SupabaseClient,
  businessId: string,
  fromEmail: string,
  fromName: string
): Promise<MatchResult> {
  // 1. Match by email
  const { data: byEmail } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('business_id', businessId)
    .eq('email', fromEmail)
    .maybeSingle()

  if (byEmail) {
    return { customer_id: byEmail.customer_id, lead_id: null, matched_by: 'email' }
  }

  // 2. Match by name (if we have a name)
  if (fromName && fromName.length >= 3) {
    const { data: byName } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', businessId)
      .ilike('name', fromName)
      .maybeSingle()

    if (byName) {
      return { customer_id: byName.customer_id, lead_id: null, matched_by: 'name' }
    }
  }

  // 3. Match against open leads by email
  const { data: leadByEmail } = await supabase
    .from('leads')
    .select('lead_id')
    .eq('business_id', businessId)
    .eq('email', fromEmail)
    .in('status', ['new', 'contacted', 'qualified'])
    .maybeSingle()

  if (leadByEmail) {
    return { customer_id: null, lead_id: leadByEmail.lead_id, matched_by: 'email' }
  }

  return { customer_id: null, lead_id: null, matched_by: 'unmatched' }
}

/**
 * Process a single inbound email message.
 * - Skips outbound (from owner)
 * - Deduplicates by gmail_message_id
 * - Matches to customer/lead
 * - Stores in email_conversations
 * - Fires events for automation engine
 */
export async function processInboundEmail(
  supabase: SupabaseClient,
  businessId: string,
  message: GmailMessage,
  ownerEmail: string
): Promise<{ stored: boolean; reason?: string }> {
  // 1. Skip outbound
  if (isFromOwner(message, ownerEmail)) {
    return { stored: false, reason: 'outbound' }
  }

  // 2. Dedup check
  const { data: existing } = await supabase
    .from('email_conversations')
    .select('id')
    .eq('gmail_message_id', message.messageId)
    .maybeSingle()

  if (existing) {
    return { stored: false, reason: 'duplicate' }
  }

  // 3. Match sender
  const fromEmail = extractEmail(message.from)
  const fromName = extractName(message.from)
  const match = await matchSender(supabase, businessId, fromEmail, fromName)

  // 4. Truncate body for storage (keep first 5000 chars)
  const bodyPreview = message.bodyText
    ? message.bodyText.substring(0, 5000)
    : message.snippet || ''

  // 5. Store in email_conversations
  const { error } = await supabase
    .from('email_conversations')
    .insert({
      business_id: businessId,
      gmail_thread_id: message.threadId,
      gmail_message_id: message.messageId,
      customer_id: match.customer_id,
      lead_id: match.lead_id,
      matched_by: match.matched_by,
      from_email: fromEmail,
      from_name: fromName || null,
      subject: message.subject,
      body_text: bodyPreview,
      received_at: message.date ? new Date(message.date).toISOString() : new Date().toISOString(),
      direction: 'inbound',
      status: 'new',
    })

  if (error) {
    console.error('[gmail-processor] Insert error:', error.message)
    return { stored: false, reason: error.message }
  }

  // 6. Fire events
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    const eventPayload = {
      customer_id: match.customer_id,
      lead_id: match.lead_id,
      from_email: fromEmail,
      from_name: fromName,
      subject: message.subject,
      body_preview: bodyPreview.substring(0, 500),
      gmail_thread_id: message.threadId,
      matched_by: match.matched_by,
    }

    if (match.customer_id || match.lead_id) {
      // Known sender
      await fireEvent(supabase, 'email_received', businessId, eventPayload)
    } else {
      // Unknown sender — potential new lead
      await fireEvent(supabase, 'email_received', businessId, eventPayload)
    }
  } catch (err) {
    console.error('[gmail-processor] fireEvent error:', err)
  }

  return { stored: true }
}

/**
 * Process multiple messages from a Gmail history response.
 */
export async function processMailBatch(
  supabase: SupabaseClient,
  businessId: string,
  messages: GmailMessage[],
  ownerEmail: string
): Promise<{ processed: number; stored: number; skipped: number }> {
  let stored = 0
  let skipped = 0

  for (const message of messages) {
    const result = await processInboundEmail(supabase, businessId, message, ownerEmail)
    if (result.stored) {
      stored++
    } else {
      skipped++
    }
  }

  return { processed: messages.length, stored, skipped }
}
