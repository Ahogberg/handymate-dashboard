import type { SupabaseClient } from '@supabase/supabase-js'

export const FOLLOWUP_FIELDS = 'id,quote_id,mission_id,due_at,state,reason,approval_id,attempts,created_at,checked_at,resolved_at,send_claimed_at'
export const followupEnabled = () => process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED === 'true'
export function followupError(message: string): string {
  if (message.includes('runner_unavailable')) return 'Teamets uppföljning är inte tillgänglig just nu. Försök igen senare.'
  if (message.includes('invalid_due') || message.includes('due_after_quote')) return 'Välj en tid minst en minut framåt, inom 90 dagar och innan offerten går ut.'
  if (message.includes('duplicate key')) return 'Det finns redan en planerad uppföljning för offerten. Öppna den innan du skapar en ny.'
  if (message.includes('approval_in_progress')) return 'Beslutet har redan börjat behandlas och kan inte avbrytas här. Kontrollera kvittensen.'
  return 'Uppföljningen kunde inte bekräftas. Kontrollera offert, kund och uppdrag och försök igen.'
}
export async function scheduleFollowup(db: SupabaseClient,businessId: string,userId: string,input: Record<string, unknown>) {
  if (!followupEnabled()) throw new Error('runner_unavailable')
  if (typeof input.quote_id!=='string' || typeof input.due_at!=='string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input.due_at)
    || !Number.isFinite(Date.parse(input.due_at)) || typeof input.request_key!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.request_key)
    || input.mission_id!=null && typeof input.mission_id!=='string') throw new Error('invalid_due')
  const {data,error}=await db.rpc('schedule_agent_followup',{p_business:businessId,p_user:userId,p_quote:input.quote_id,p_due:input.due_at,p_key:input.request_key,p_mission:input.mission_id || null})
  if(error) throw new Error(error.message)
  return data
}
/** Existing producers yield this quote to the explicitly scheduled owner. Read errors must not send. */
export async function hasDurableFollowup(db: SupabaseClient,businessId: string,quoteId: string): Promise<boolean> {
  if (!followupEnabled()) return false
  const {data,error}=await db.from('agent_followup').select('id').eq('business_id',businessId).eq('quote_id',quoteId).in('state',['scheduled','prepared']).limit(1)
  if(error || !Array.isArray(data)) throw new Error('Uppföljningens ansvar kunde inte kontrolleras.')
  return data.length>0
}
