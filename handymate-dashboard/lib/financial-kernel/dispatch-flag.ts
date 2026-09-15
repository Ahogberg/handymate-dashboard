import type { SupabaseClient } from '@supabase/supabase-js'

/** App dispatch only: safe before v238, with no kernel RPC when disabled. */
export async function readKernelDispatchFlag(businessId: string, client?: SupabaseClient): Promise<boolean> {
  const sb=client ?? (await import('@/lib/supabase')).getServerSupabase()
  const { data, error } = await sb.from('business_config')
    .select('financial_kernel_enabled').eq('business_id', businessId).maybeSingle()
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') return false
    throw new Error(error.message)
  }
  return data?.financial_kernel_enabled === true
}
