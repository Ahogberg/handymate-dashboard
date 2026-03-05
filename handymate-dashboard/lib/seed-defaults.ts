import { getServerSupabase } from '@/lib/supabase'
import { getDefaultStandardTexts } from '@/lib/quote-standard-text-defaults'
import { getChecklistsForBranch } from '@/lib/checklist-defaults'
import { getDefaultPriceList } from '@/lib/price-list-defaults'

type SupabaseClient = ReturnType<typeof getServerSupabase>

/**
 * Seed all default data for a business.
 * Idempotent — uses conflict checks so it can be run multiple times safely.
 */
export async function seedAllDefaults(
  supabase: SupabaseClient,
  businessId: string,
  branch: string
) {
  const results = await Promise.allSettled([
    seedAutomationRules(supabase, businessId),
    seedLeadScoringRules(supabase, businessId),
    seedPipelineStages(supabase, businessId),
    seedQuoteStandardTexts(supabase, businessId, branch),
    seedChecklistTemplates(supabase, businessId, branch),
    seedPriceList(supabase, businessId, branch),
  ])

  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    console.error(`[seedAllDefaults] ${failed.length} seed operations failed:`,
      failed.map(r => (r as PromiseRejectedResult).reason))
  }

  return { total: results.length, succeeded: results.length - failed.length, failed: failed.length }
}

async function seedAutomationRules(supabase: SupabaseClient, businessId: string) {
  // Check if already seeded
  const { data: existing } = await supabase
    .from('automation_rule')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.rpc('seed_automation_rules', { p_business_id: businessId })
}

async function seedLeadScoringRules(supabase: SupabaseClient, businessId: string) {
  const { data: existing } = await supabase
    .from('lead_scoring_rule')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.rpc('seed_lead_scoring_rules', { p_business_id: businessId })
}

async function seedPipelineStages(supabase: SupabaseClient, businessId: string) {
  const { data: existing } = await supabase
    .from('pipeline_stage')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  const defaultStages = [
    { name: 'Ny förfrågan', position: 0, color: '#3B82F6' },
    { name: 'Offert skickad', position: 1, color: '#F59E0B' },
    { name: 'Förhandling', position: 2, color: '#8B5CF6' },
    { name: 'Accepterad', position: 3, color: '#10B981' },
    { name: 'Avslutad', position: 4, color: '#6B7280' },
  ]

  await supabase.from('pipeline_stage').insert(
    defaultStages.map((s, i) => ({
      id: `ps_${businessId}_${i}`,
      business_id: businessId,
      ...s,
    }))
  )
}

async function seedQuoteStandardTexts(supabase: SupabaseClient, businessId: string, branch: string) {
  const { data: existing } = await supabase
    .from('quote_standard_texts')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  const texts = getDefaultStandardTexts(branch)
  await supabase.from('quote_standard_texts').insert(
    texts.map((t, i) => ({
      id: `qst_${businessId}_${i}`,
      business_id: businessId,
      text_type: t.text_type,
      name: t.name,
      content: t.content,
      is_default: true,
    }))
  )
}

async function seedChecklistTemplates(supabase: SupabaseClient, businessId: string, branch: string) {
  const { data: existing } = await supabase
    .from('checklist_template')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  const templates = getChecklistsForBranch(branch)
  await supabase.from('checklist_template').insert(
    templates.map((t, i) => ({
      id: `ct_${businessId}_${i}`,
      business_id: businessId,
      name: t.name,
      category: t.category,
      items: t.items,
      is_default: true,
    }))
  )
}

async function seedPriceList(supabase: SupabaseClient, businessId: string, branch: string) {
  const { data: existing } = await supabase
    .from('price_list')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  const entries = getDefaultPriceList(branch)
  await supabase.from('price_list').insert(
    entries.map((e, i) => ({
      id: `pl_${businessId}_${i}`,
      business_id: businessId,
      category: e.category,
      name: e.name,
      unit: e.unit,
      unit_price: e.unit_price,
    }))
  )
}
