import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { insertApprovalArtifact, approvalArtifactId } from '@/lib/approvals/artifact-write'

export interface QuoteFollowupRound { quote_id: string; round: number; sent_at: string; channel: 'sms' | 'email' }
export function isQuoteFollowupTool(name: string, scope: QuoteFollowupRound): boolean {
  return ['get_customer', 'get_quotes', 'read_customer_emails', `send_${scope.channel}`].includes(name)
}
export function parseQuoteFollowupRound(value: unknown): QuoteFollowupRound | undefined {
  const v = value as Partial<QuoteFollowupRound> | null
  if (!v || typeof v.quote_id !== 'string' || !v.quote_id || !Number.isInteger(v.round) || v.round! < 1 || v.round! > 3
    || typeof v.sent_at !== 'string' || !Number.isFinite(Date.parse(v.sent_at)) || v.channel !== (v.round === 2 ? 'email' : 'sms')) return
  return v as QuoteFollowupRound
}
function roundKey(scope: QuoteFollowupRound) { return JSON.stringify([scope.quote_id, scope.sent_at, scope.round]) }
export function quoteFollowupApprovalId(businessId: string, scope: QuoteFollowupRound) {
  return approvalArtifactId(businessId, roundKey(scope), 'quote-followup-round')
}
export async function readQuoteFollowupRound(db: SupabaseClient, businessId: string, scope: QuoteFollowupRound) {
  const { data, error } = await db.from('pending_approvals').select('id,status,payload,expires_at')
    .eq('business_id', businessId).eq('id', quoteFollowupApprovalId(businessId, scope)).maybeSingle()
  if (error) throw new Error('Uppföljningens tidigare resultat kunde inte läsas.')
  return data
}
export function followupProviderAccepted(card: any, scope: QuoteFollowupRound): boolean {
  const e = card?.payload?.execution_result
  const id = e?.artifacts?.[scope.channel === 'sms' ? 'sms_id' : 'message_id']
  return ['approved','auto_approved'].includes(card?.status) && e?.outcome === 'success'
    && typeof id === 'string' && !!id.trim()
}

export interface QuoteFollowupReceipt {
  approvalId: string
  round: number
  channel: 'sms' | 'email'
  executedAt: string
  artifactId: string
}

/** Senaste verifierade kvittot bland exakt offertens tre deterministiska omgångar. */
export function latestQuoteFollowupReceipt(
  cards: any[],
  scopes: QuoteFollowupRound[],
  businessId: string,
  nowMs: number,
): QuoteFollowupReceipt | null {
  const byId = new Map(cards.map(card => [card.id, card]))
  const receipts: QuoteFollowupReceipt[] = []
  for (const scope of scopes) {
    const card = byId.get(quoteFollowupApprovalId(businessId, scope))
    const savedScope = parseQuoteFollowupRound(card?.payload?.quote_followup_round)
    if (!card || !savedScope || savedScope.quote_id !== scope.quote_id || savedScope.sent_at !== scope.sent_at
      || savedScope.round !== scope.round || !followupProviderAccepted(card, scope)) continue
    const executedAt = card.payload?.execution_result?.executed_at
    const executedMs = typeof executedAt === 'string' ? Date.parse(executedAt) : NaN
    if (!Number.isFinite(executedMs) || executedMs < Date.parse(scope.sent_at) || executedMs > nowMs) continue
    const artifactId = card.payload.execution_result.artifacts[scope.channel === 'sms' ? 'sms_id' : 'message_id']
    receipts.push({ approvalId: card.id, round: scope.round, channel: scope.channel, executedAt, artifactId })
  }
  return receipts.sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt))[0] || null
}

/** Shared by composition and approval execution. A run/approval is not delivery. */
export async function verifyQuoteFollowupSource(db: SupabaseClient, businessId: string, scope: QuoteFollowupRound,
  recipient?: unknown, fingerprint?: unknown) {
  const { data: q, error } = await db.from('quotes').select('quote_id,customer_id,status,sent_at,valid_until,follow_up_count,title,description,total,customer_pays,accepted_at,declined_at')
    .eq('quote_id', scope.quote_id).eq('business_id', businessId).maybeSingle()
  if (error || !q || !['sent','opened'].includes(q.status) || q.accepted_at || q.declined_at
    || q.sent_at !== scope.sent_at || (q.follow_up_count ?? 0) !== scope.round - 1
    || !q.valid_until || q.valid_until < new Date().toISOString().slice(0,10)) throw new Error('Offerten har ändrats eller är inte längre aktuell för denna uppföljning.')
  const {data:c,error:customerError} = await db.from('customer').select('customer_id,name,phone_number,email,sms_opt_out')
    .eq('customer_id',q.customer_id).eq('business_id',businessId).maybeSingle()
  const to = scope.channel === 'sms' ? c?.phone_number : c?.email
  if(customerError || !c || typeof to !== 'string' || !to.trim() || (scope.channel === 'sms' && c.sms_opt_out)
    || (recipient !== undefined && recipient !== to)) throw new Error('Kundens kontaktväg kunde inte verifieras för uppföljningen.')
  const {data:rows,error:rowsError} = await db.from('quote_items').select('*').eq('business_id',businessId).eq('quote_id',scope.quote_id).order('id')
  if(rowsError || !Array.isArray(rows))throw new Error('Offertens underlag kunde inte läsas.')
  // Any linked inbound contact after the quote was sent needs human review.
  // Unknown/unlinked provider events still require the separate live contact proof.
  for(const [table,date] of [['sms_log','created_at'],['email_conversations','created_at'],['customer_message','created_at'],['call_recording','created_at'],['call','started_at'],['communication_log','created_at']]) {
    const {data:contacts,error:contactError}=await db.from(table).select('customer_id').eq('business_id',businessId).eq('customer_id',q.customer_id)
      .in('direction',['inbound','incoming']).gte(date,scope.sent_at).limit(1)
    if(contactError || !Array.isArray(contacts))throw new Error('Kundens senaste kontakt kunde inte kontrolleras.')
    if(contacts.length)throw new Error('Kunden har hört av sig efter offerten. Bedöm svaret innan fortsatt uppföljning.')
  }
  // Opening the quote is expected while it awaits a decision, not a content edit.
  const {status: _status, ...quoteContent} = q
  const source = createHash('sha256').update(JSON.stringify({quote:quoteContent,recipient:to,rows})).digest('hex')
  if(fingerprint !== undefined && fingerprint !== source)throw new Error('Offertens underlag har ändrats sedan uppföljningen förbereddes.')
  return {quote:q,customer:c,to,source}
}

export async function prepareQuoteFollowupRound(db: SupabaseClient,businessId: string,scope: QuoteFollowupRound,
  type: 'send_sms' | 'send_email',payload: Record<string,unknown>) {
  if(type !== `send_${scope.channel}`)throw new Error('Denna uppföljningsomgång använder en annan kanal.')
  const message = type === 'send_sms' ? payload.message : payload.body
  if(typeof message !== 'string' || !message.trim() || (type === 'send_email' && (typeof payload.subject !== 'string' || !payload.subject.trim()))) throw new Error('Uppföljningens meddelande saknas.')
  const verified=await verifyQuoteFollowupSource(db,businessId,scope,payload.to)
  const saved=await insertApprovalArtifact(db,'pending_approvals','id',businessId,roundKey(scope),'quote-followup-round',{
    approval_type:type,title:'Följ upp offerten som väntar',description:payload.message || payload.body,
    payload:{...payload,customer_id:verified.quote.customer_id,customer_name:verified.customer.name,
      quote_id:scope.quote_id,related_id:scope.quote_id,agent_id:'daniel',routed_agent:'daniel',
      quote_followup_round:scope,quote_followup_source:verified.source},status:'pending',risk_level:'high',
    expires_at:new Date(Math.min(Date.now()+7*86400000,Date.parse(verified.quote.valid_until+'T23:59:59Z'))).toISOString(),
  })
  if(saved.error || !saved.data)throw new Error('Uppföljningsförslaget kunde inte bekräftas som sparat.')
  return {success:true,data:{queued_for_approval:saved.data.status==='pending',approval_id:saved.data.id,
    message:'Uppföljningen finns i godkännandekön. Kontrollera kortets beslut och kvittens; inget nytt meddelande har skickats här.'}}
}

/** Never release a provider attempt automatically, even when its HTTP response is lost. */
export async function claimQuoteFollowupSend(db: SupabaseClient,businessId: string,approvalId: string,payload: Record<string,unknown>) {
  if(payload.quote_followup_send_claimed_at)throw new Error('Uppföljningens utskick har redan påbörjats. Kontrollera kvittensen innan ett nytt meddelande skickas.')
  const claimedAt=new Date().toISOString()
  const {data,error}=await db.from('pending_approvals').update({payload:{...payload,quote_followup_send_claimed_at:claimedAt}})
    .eq('business_id',businessId).eq('id',approvalId).eq('status','approved')
    .is('payload->>quote_followup_send_claimed_at',null).select('id')
  if(error || !Array.isArray(data) || data.length!==1)throw new Error('Uppföljningens sändförsök kunde inte reserveras. Kontrollera det befintliga utfallet.')
  // The executor and final receipt persistence share this payload reference.
  // Keep the durable claim when the latter adds execution_result.
  payload.quote_followup_send_claimed_at=claimedAt
}

/** CAS makes receipt reconciliation replay-safe; an unresolved card holds the round. */
export async function reconcileQuoteFollowupRound(db: SupabaseClient,businessId: string,scope: QuoteFollowupRound) {
  const card=await readQuoteFollowupRound(db,businessId,scope)
  if(!card)return {state:'missing' as const}
  if(!followupProviderAccepted(card,scope))return {state:'held' as const,card}
  const executedAt=card.payload.execution_result.executed_at
  if(typeof executedAt !== 'string' || !Number.isFinite(Date.parse(executedAt)))return {state:'held' as const,card}
  const {data,error}=await db.from('quotes').update({follow_up_count:scope.round,last_follow_up_at:executedAt})
    .eq('business_id',businessId).eq('quote_id',scope.quote_id).eq('sent_at',scope.sent_at)
    .or(`follow_up_count.eq.${scope.round-1}${scope.round===1?',follow_up_count.is.null':''}`).select('quote_id')
  if(error || !Array.isArray(data))throw new Error('Uppföljningens sparade kvittens kunde inte stämmas av.')
  return {state:'reconciled' as const,card,advanced:data.length===1}
}
