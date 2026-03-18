import { getServerSupabase } from '@/lib/supabase'
import { getSmsQuota, type PlanType } from '@/lib/feature-gates'

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export interface SmsUsageStatus {
  sent: number
  quota: number
  extraSent: number
  extraCostSek: number
  hardCap: number
  percentUsed: number
  isOverQuota: boolean
  isAtHardCap: boolean
  extraCostPerSms: number
}

/**
 * Hämta aktuell SMS-användning för ett företag.
 */
export async function getSmsUsage(businessId: string, plan: PlanType): Promise<SmsUsageStatus> {
  const supabase = getServerSupabase()
  const month = getCurrentMonth()
  const quotaConfig = getSmsQuota(plan)

  const { data } = await supabase
    .from('sms_usage')
    .select('sms_sent, sms_quota, extra_sms_sent, extra_sms_cost_sek')
    .eq('business_id', businessId)
    .eq('month', month)
    .maybeSingle()

  const sent = data?.sms_sent ?? 0
  const extraSent = data?.extra_sms_sent ?? 0
  const extraCost = data?.extra_sms_cost_sek ?? 0
  const quota = quotaConfig.monthlyQuota

  return {
    sent,
    quota,
    extraSent,
    extraCostSek: extraCost,
    hardCap: quotaConfig.hardCap,
    percentUsed: quota > 0 ? Math.round((sent / quota) * 100) : 0,
    isOverQuota: sent >= quota,
    isAtHardCap: sent >= quotaConfig.hardCap,
    extraCostPerSms: quotaConfig.extraCostSek,
  }
}

export interface SmsCheckResult {
  allowed: boolean
  isExtra: boolean
  extraCostSek: number
  error?: string
  warningPercent?: number
}

/**
 * Kontrollera om SMS kan skickas. Returnerar om det räknas som extra + kostnad.
 */
export async function checkSmsAllowance(businessId: string, plan: PlanType): Promise<SmsCheckResult> {
  const usage = await getSmsUsage(businessId, plan)

  if (usage.isAtHardCap) {
    return {
      allowed: false,
      isExtra: false,
      extraCostSek: 0,
      error: `Du har nått månadens SMS-gräns (${usage.hardCap} SMS). Kontakta oss för att höja gränsen.`,
    }
  }

  if (usage.isOverQuota) {
    return {
      allowed: true,
      isExtra: true,
      extraCostSek: usage.extraCostPerSms,
      warningPercent: 100,
    }
  }

  const percent = usage.percentUsed
  return {
    allowed: true,
    isExtra: false,
    extraCostSek: 0,
    warningPercent: percent >= 80 ? percent : undefined,
  }
}

/**
 * Räkna upp SMS-usage efter ett skickat SMS.
 */
export async function trackSmsSent(businessId: string, plan: PlanType): Promise<void> {
  const supabase = getServerSupabase()
  const month = getCurrentMonth()
  const quotaConfig = getSmsQuota(plan)

  // Upsert — skapa rad om den inte finns
  const { data: existing } = await supabase
    .from('sms_usage')
    .select('id, sms_sent, sms_quota')
    .eq('business_id', businessId)
    .eq('month', month)
    .maybeSingle()

  if (!existing) {
    await supabase.from('sms_usage').insert({
      business_id: businessId,
      month,
      sms_sent: 1,
      sms_quota: quotaConfig.monthlyQuota,
      extra_sms_sent: 0,
      extra_sms_cost_sek: 0,
    })
    return
  }

  const newSent = (existing.sms_sent ?? 0) + 1
  const isExtra = newSent > quotaConfig.monthlyQuota

  if (isExtra) {
    await supabase
      .from('sms_usage')
      .update({
        sms_sent: newSent,
        extra_sms_sent: (existing.sms_sent ?? 0) - quotaConfig.monthlyQuota + 1,
        extra_sms_cost_sek: ((existing.sms_sent ?? 0) - quotaConfig.monthlyQuota + 1) * quotaConfig.extraCostSek,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('sms_usage')
      .update({
        sms_sent: newSent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  }
}
