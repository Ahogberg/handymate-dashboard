import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returnerar de företag där en aktiv V3-tröskelregel äger
 * fakturapåminnelseflödet.
 *
 * Samma ägarskap används av både send-reminders och check-overdue. Läsningen
 * är avsiktligt fail-closed: om ägarskapet inte kan fastställas får en äldre
 * reservväg inte riskera att skapa eller skicka en dubblett.
 */
export async function loadV3InvoiceReminderOwnerBusinessIds(
  supabase: SupabaseClient,
  businessIds: string[],
): Promise<Set<string>> {
  if (businessIds.length === 0) return new Set()

  const { data, error } = await supabase
    .from('v3_automation_rules')
    .select('business_id')
    .eq('trigger_type', 'threshold')
    .eq('is_active', true)
    .in('business_id', businessIds)
    .like('trigger_config', '%"entity":"invoice"%')

  if (error) {
    throw new Error(`Kunde inte fastställa ägare för fakturapåminnelser: ${error.message}`)
  }

  return new Set(
    (data || [])
      .map((rule) => rule.business_id)
      .filter((businessId): businessId is string => Boolean(businessId)),
  )
}
