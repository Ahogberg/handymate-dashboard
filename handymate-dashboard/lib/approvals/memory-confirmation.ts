import type { SupabaseClient } from '@supabase/supabase-js'
export interface ReviewedMemory { id: string; content: string; agent_id: string | null }
export async function executeMemoryConfirmation(db: SupabaseClient, businessId: string, plan?: ReviewedMemory) {
  const failed = (error: string) => ({ action: 'agent_memory_confirmation', ok: false, error })
  if (!plan?.id || typeof plan.content !== 'string') return failed('Granskat minnesunderlag saknas.')
  const find = () => db.from('agent_memories').select('id, content, agent_id, confirmed_at, superseded_by').eq('business_id', businessId).eq('id', plan.id).maybeSingle()
  const matches = (row: any) => !row?.superseded_by && row && row.content === plan.content && (row.agent_id ?? null) === plan.agent_id
  const before = await find()
  if (before.error || !matches(before.data)) return failed('Minnet har ändrats eller kunde inte verifieras. Granska det på nytt.')
  if (!before.data?.confirmed_at) {
    try {
      let query = db.from('agent_memories').update({ confirmed_at: new Date().toISOString() })
        .eq('business_id', businessId).eq('id', plan.id).eq('content', plan.content).is('confirmed_at', null).is('superseded_by', null)
      query = plan.agent_id === null ? query.is('agent_id', null) : query.eq('agent_id', plan.agent_id)
      await query.select('id')
    } catch { /* Resolve a lost response by reading the actual memory. */ }
    const after = await find()
    if (after.error || !matches(after.data) || !after.data?.confirmed_at) return failed('Bekräftelsen kunde inte verifieras som sparad.')
  }
  return { action: 'agent_memory_confirmation', ok: true, memory_id: plan.id }
}
