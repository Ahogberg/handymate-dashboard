import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Stable UUID per approval and artifact. A lost response must not create a second artifact. */
export function approvalArtifactId(businessId: string, approvalId: string, purpose: string): string {
  const hex = createHash('sha256').update(JSON.stringify([businessId, approvalId, purpose])).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
export async function insertApprovalArtifact(db: SupabaseClient, table: string, key: string,
  businessId: string, approvalId: string, purpose: string, values: Record<string, unknown>) {
  const id = approvalArtifactId(businessId, approvalId, purpose)
  const find = () => db.from(table).select('*').eq(key, id).eq('business_id', businessId).maybeSingle()
  const previous = await find()
  if (previous.error) return previous
  if (previous.data) return previous
  const inserted = await db.from(table).insert({ ...values, [key]: id, business_id: businessId }).select('*').single()
  if (inserted.error?.code === '23505') return find()
  return inserted
}
