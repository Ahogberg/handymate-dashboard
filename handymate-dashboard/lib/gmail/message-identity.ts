import type { SupabaseClient } from '@supabase/supabase-js'

export function gmailIdentity(account: string, messageId: string) {
  const mailbox = account.trim().toLowerCase()
  if (!mailbox || !messageId.trim()) throw new Error('Mejlets konto eller meddelande-ID saknas.')
  return { mail_provider: 'google', mail_account: mailbox, provider_message_id: messageId }
}

export async function findGmailMessage(db: SupabaseClient, businessId: string, account: string, messageId: string) {
  const identity = gmailIdentity(account, messageId)
  const { data, error } = await db.from('email_conversations').select('id')
    .eq('business_id', businessId).eq('mail_provider', identity.mail_provider)
    .eq('mail_account', identity.mail_account).eq('provider_message_id', messageId).maybeSingle()
  if (error) throw new Error('Mejlets identitet kunde inte kontrolleras.')
  if (data) return data
  // Old rows have no proven mailbox. Never guess one or create a duplicate.
  const legacy = await db.from('email_conversations').select('id')
    .eq('business_id', businessId).eq('mail_provider', 'legacy')
    .eq('gmail_message_id', messageId).maybeSingle()
  if (legacy.error) throw new Error('Äldre mejl kunde inte kontrolleras.')
  if (legacy.data) throw new Error('Ett äldre mejl behöver verifierad kontokoppling innan synken kan fortsätta.')
  return null
}
