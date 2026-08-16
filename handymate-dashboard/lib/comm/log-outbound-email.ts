import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Loggar ett UTGÅENDE e-postmeddelande till email_conversations
 * (kontextrevisionen 2026-08-16, fynd 1 — det allvarligaste).
 *
 * Innan detta sparades utgående e-post ALDRIG någonstans: Gmail-pollern
 * hoppar medvetet över ägarens egna skickade mejl, send_email-verktyget
 * skickade utan att spara, och ingen email_log-tabell fanns. Systemet
 * behöll alltså permanent bara ENA sidan av varje e-postkonversation —
 * obevisbart vid tvist, och agenter kunde motsäga vad som redan mejlats
 * utan att veta om det.
 *
 * email_conversations har redan en direction-kolumn ('inbound'|'outbound',
 * sql/v9_gmail_polling.sql) — schemat var klart, koden skrev bara aldrig.
 * gmail_message_id är NOT NULL UNIQUE; för mejl skickade via Resend (inget
 * Gmail-id finns) genereras ett syntetiskt, kollisionssäkert id.
 *
 * Best-effort: loggning får ALDRIG fälla själva utskicket — mejlet är
 * redan skickat när detta anropas.
 */
export async function logOutboundEmail(
  supabase: SupabaseClient,
  input: {
    businessId: string
    toEmail: string
    subject: string
    body: string
    /** Gmail-meddelande-id när det finns; annars genereras ett syntetiskt. */
    gmailMessageId?: string | null
    gmailThreadId?: string | null
    customerId?: string | null
    leadId?: string | null
    /** 'gmail' | 'resend' | annan avsändarväg — sparas i matched_by-fältet för spårbarhet. */
    sentVia: string
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('email_conversations').insert({
      business_id: input.businessId,
      gmail_message_id: input.gmailMessageId || `out_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      gmail_thread_id: input.gmailThreadId || `outthread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      customer_id: input.customerId || null,
      lead_id: input.leadId || null,
      matched_by: `outbound_${input.sentVia}`,
      from_email: input.toEmail, // mottagaren — from_email är radens "motpart", samma semantik som inbound
      subject: input.subject,
      body_text: input.body,
      received_at: new Date().toISOString(),
      direction: 'outbound',
      status: 'read',
      agent_handled: true,
    })
    if (error) console.error('[log-outbound-email] insert misslyckades:', input.businessId, error.message)
  } catch (err) {
    console.error('[log-outbound-email] exception:', input.businessId, err)
  }
}
