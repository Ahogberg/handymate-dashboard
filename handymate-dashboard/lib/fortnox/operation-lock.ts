import { randomUUID } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'

/** Shared by Vercel instances; a delayed owner may neither renew nor release a newer lease. */
export async function withFortnoxLock<T>(businessId: string, operation: 'oauth' | 'invoice-import', work: (assertOwned: () => Promise<void>) => Promise<T>): Promise<T> {
  const db = getServerSupabase()
  const owner = randomUUID()
  const args = { p_business_id: businessId, p_operation: operation, p_owner: owner }
  let acquired = false
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data, error } = await db.rpc('claim_fortnox_operation', args)
    if (error) throw new Error('Synken kunde inte låsas. Kontrollera databasuppdateringen.')
    if (data === true) { acquired = true; break }
    if (operation !== 'oauth') break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!acquired) throw new Error('En synk pågår redan. Försök igen om en stund.')
  const assertOwned = async () => {
    const { data, error } = await db.rpc('claim_fortnox_operation', { ...args, p_renew: true })
    if (error || data !== true) throw new Error('Synken avbröts. Försök igen.')
  }
  try { return await work(assertOwned) }
  finally {
    await db.from('fortnox_operation_lock').delete().eq('business_id', businessId).eq('operation', operation).eq('owner', owner)
  }
}
