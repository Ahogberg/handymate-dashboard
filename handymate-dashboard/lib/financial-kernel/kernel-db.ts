import { getServerSupabase } from '@/lib/supabase'
import type { KernelDb } from './events/publish'

export function kernelDb(): KernelDb {
  const client = getServerSupabase()
  return { rpc: (name, args) => client.rpc(name, args) }
}
