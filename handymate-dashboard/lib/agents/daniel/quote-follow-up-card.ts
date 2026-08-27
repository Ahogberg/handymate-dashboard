/**
 * Daniels uppföljningskort för en offert som väntar — samma kontrakt som
 * cronens expiry-nudge (app/api/cron/quote-follow-up/route.ts), byggt för
 * onboardingens första verifierade handling (2026-08-27).
 *
 * Kortet är `approval_type: 'send_sms'` — den casen i executeApprovalPayload
 * skickar via sendSmsViaElks (STOPP-spärr, kvot, Bränsle) och returnerar
 * sms_sent/sms_id som kvittot bygger på. Payloaden bär exakt cronens nycklar
 * (to, message, customer_id, related_id, autonomy_key, agent_id, amount_kr)
 * så att:
 *   - dedup matchar cronens `.contains('payload', { related_id })`
 *     (morgoncronen skapar inget dubblettkort dagen efter),
 *   - agentForApproval läser agent_id = 'daniel' (annars faller send_sms
 *     igenom till Lisa),
 *   - streak-räkningen ser autonomy_key = 'quote_followup_sms'.
 * Plus quote_id + customer_name (cronen saknar dem) för kvittots länk och
 * kortets kontextrad.
 *
 * Inte createQuoteNudge (lib/autopilot/quote-nudge.ts): den kör modellen,
 * skriver "öppnat offerten N gånger" (osant för en oöppnad offert) och
 * hanteras på godkännandesidan som en ring-notis, inte som ett utskick.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type CreateQuoteFollowUpCardResult = { id: string } | { duplicate: true } | { error: string }

export async function createQuoteFollowUpCard(
  supabase: SupabaseClient,
  params: {
    businessId: string
    quote: { quote_id: string; title?: string | null; customer_id?: string | null }
    customer: { name?: string | null; phone_number: string }
    message: string
    amountKr: number | null
    daysSinceSent: number
    extraPayload?: Record<string, unknown>
  },
): Promise<CreateQuoteFollowUpCardResult> {
  const { businessId, quote, customer, message, amountKr, daysSinceSent, extraPayload } = params
  const { count: existing, error: dedupErr } = await supabase
    .from('pending_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('approval_type', 'send_sms')
    .eq('status', 'pending')
    .contains('payload', { related_id: quote.quote_id })
  if (dedupErr) return { error: dedupErr.message }
  if ((existing ?? 0) > 0) return { duplicate: true }

  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const amountLabel = amountKr != null ? amountKr.toLocaleString('sv-SE') : null
  const { error: apprErr } = await supabase.from('pending_approvals').insert({
    id: approvalId,
    business_id: businessId,
    approval_type: 'send_sms',
    title: 'Följ upp offerten som väntar',
    description: `Offerten${quote.title ? ` "${quote.title}"` : ''}${amountLabel ? ` på ${amountLabel} kr` : ''} har väntat ${daysSinceSent} dagar utan svar. Godkänn för att skicka en vänlig uppföljning till kunden.`,
    payload: {
      to: customer.phone_number,
      message,
      customer_id: quote.customer_id ?? null,
      related_id: quote.quote_id,
      quote_id: quote.quote_id,
      customer_name: customer.name ?? null,
      autonomy_key: 'quote_followup_sms',
      agent_id: 'daniel',
      amount_kr: amountKr,
      ...(extraPayload ?? {}),
    },
    status: 'pending',
    risk_level: 'medium',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (apprErr) return { error: apprErr.message }
  return { id: approvalId }
}
