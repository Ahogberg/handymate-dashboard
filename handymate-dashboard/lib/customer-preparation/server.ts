import { NextRequest } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export const BUCKET = 'customer-preparation'
export async function preparationOwner(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business || business._impersonation) return null
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !['owner', 'admin'].includes(user.role)) return null
  return business
}
export async function findPublicPreparation(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const db = getServerSupabase()
  const { data, error } = await db.from('customer_preparation')
    .select('id,business_id,customer_id,template,context,due_date,status,expires_at')
    .eq('token', token).maybeSingle()
  if (error) throw error
  return data
}
