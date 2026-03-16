import { PlanType } from './feature-gates'

export async function getBusinessPlan(businessId: string, supabase: any): Promise<PlanType> {
  const { data } = await supabase
    .from('business_config')
    .select('subscription_plan')
    .eq('business_id', businessId)
    .single()

  if (!data) return 'starter'

  const raw = data.subscription_plan || 'starter'
  const normalized = raw.toLowerCase()

  if (normalized === 'professional') return 'professional'
  if (normalized === 'business') return 'business'
  return 'starter'
}
