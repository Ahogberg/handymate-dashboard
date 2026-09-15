import type { SupabaseClient } from '@supabase/supabase-js'
import { gateApprovalChannels } from './preflight'
type InsertResult = { data: any; error: { code?: string; message: string } | null; channelSkipped?: boolean; reason?: string }
interface CheckedInsert extends PromiseLike<InsertResult> {
 select(columns?: string): CheckedInsert
 single(): CheckedInsert
 maybeSingle(): CheckedInsert
}
/** Lazy: constructing a builder has no DB effect. Preflight runs before the insert is awaited. */
export function checkedApprovalInsert(supabase: SupabaseClient, row: Record<string, any>): CheckedInsert {
  let query: any = supabase.from('pending_approvals').insert(row)
  async function execute(): Promise<InsertResult> {
    const state = row.status && row.status !== 'pending' ? null : await gateApprovalChannels(supabase, row.business_id, row.approval_type, row.payload)
    if (state) return { data: null, error: { code: 'CHANNEL_UNAVAILABLE', message: state.message }, channelSkipped: true, reason: state.reason }
    return await query
  }
  const wrapper: CheckedInsert = {
    select(columns = '*') { query = query.select(columns); return wrapper },
    single() { query = query.single(); return wrapper },
    maybeSingle() { query = query.maybeSingle(); return wrapper },
    then(resolve, reject) { return execute().then(resolve, reject) },
  }
  return wrapper
}
