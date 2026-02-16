import { getServerSupabase } from '@/lib/supabase'

type UsageType = 'sms' | 'call_minutes' | 'ai_requests' | 'storage_mb'

/**
 * Inkrementerar användning för en viss typ under aktuell faktureringsperiod.
 * Skapar en ny usage_record om ingen finns för perioden.
 */
export async function incrementUsage(businessId: string, type: UsageType, amount: number = 1) {
  const supabase = getServerSupabase()
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // Upsert usage record for current period
  const { data: existing } = await supabase
    .from('usage_record')
    .select('id, sms_count, call_minutes, ai_requests, storage_mb')
    .eq('business_id', businessId)
    .gte('period_start', periodStart.toISOString())
    .lte('period_end', periodEnd.toISOString())
    .single()

  const columnMap: Record<UsageType, string> = {
    sms: 'sms_count',
    call_minutes: 'call_minutes',
    ai_requests: 'ai_requests',
    storage_mb: 'storage_mb'
  }

  const col = columnMap[type]

  if (existing) {
    await supabase
      .from('usage_record')
      .update({ [col]: (existing as any)[col] + amount, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('usage_record')
      .insert({
        business_id: businessId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        [col]: amount
      })
  }
}

/**
 * Kontrollerar om ett företag har kvar användning för en viss typ.
 * Returnerar { allowed, current, limit } baserat på deras plan.
 */
export async function checkUsageLimit(businessId: string, type: UsageType): Promise<{ allowed: boolean; current: number; limit: number }> {
  const supabase = getServerSupabase()
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Hämta planens gränser
  const { data: business } = await supabase
    .from('business_config')
    .select('billing_plan')
    .eq('business_id', businessId)
    .single()

  const plan = business?.billing_plan || 'starter'

  const { data: planData } = await supabase
    .from('billing_plan')
    .select('limits')
    .eq('plan_id', plan)
    .single()

  const limits = planData?.limits || {}
  const limitMap: Record<UsageType, string> = {
    sms: 'sms_per_month',
    call_minutes: 'call_minutes_per_month',
    ai_requests: 'ai_requests_per_month',
    storage_mb: 'storage_gb'
  }

  const limit = limits[limitMap[type]] || 0

  // Hämta aktuell användning
  const { data: usage } = await supabase
    .from('usage_record')
    .select('sms_count, call_minutes, ai_requests, storage_mb')
    .eq('business_id', businessId)
    .gte('period_start', periodStart.toISOString())
    .single()

  const columnMap: Record<UsageType, string> = {
    sms: 'sms_count',
    call_minutes: 'call_minutes',
    ai_requests: 'ai_requests',
    storage_mb: 'storage_mb'
  }

  const current = usage ? (usage as any)[columnMap[type]] : 0

  return { allowed: current < limit, current, limit }
}
