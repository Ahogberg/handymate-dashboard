import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Canonical producers live in v241 and are invoked by source-table triggers,
 * atomically with approval create/resolve and automation success. This covers
 * direct inserts, skapaKort, dedicated revenue-review and generic retries alike.
 * These replay adapters take identities only; snapshots are always read in SQL.
 */
export async function recordApprovalValue(db: SupabaseClient, businessId: string, cardId: string): Promise<void> {
  const { error } = await db.rpc('record_value_approval', { p_business_id: businessId, p_id: cardId })
  if (error) throw new Error(`record_value_approval: ${error.message}`)
}
export async function recordAutomationValue(db: SupabaseClient, businessId: string, logId: string): Promise<void> {
  const { error } = await db.rpc('record_value_automation', { p_business_id: businessId, p_id: logId })
  if (error) throw new Error(`record_value_automation: ${error.message}`)
}
