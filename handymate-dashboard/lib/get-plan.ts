import { PlanType } from './feature-gates'

export async function getBusinessPlan(businessId: string, supabase: any): Promise<PlanType> {
  const { data } = await supabase
    .from('business_config')
    .select('plan, billing_plan, subscription_plan')
    .eq('business_id', businessId)
    .single()

  if (!data) return 'starter'

  // Priority: plan > billing_plan > subscription_plan
  const raw = data.plan || data.billing_plan || data.subscription_plan || 'starter'
  const normalized = raw.toLowerCase()

  if (normalized === 'professional') return 'professional'
  if (normalized === 'business') return 'business'
  return 'starter'
}
