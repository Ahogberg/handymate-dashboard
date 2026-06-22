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
    seedV3AutomationRules(supabase, businessId),
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

/**
 * Seedar default-regler i v3_automation_rules — den LEVANDE automationsmotorn
 * (fireEvent + evaluate-thresholds-cron). Utan dessa får nya företag noll
 * automationer. Posture: snabbsvar mot kund auto-skickas; allt som rör pengar
 * (fakturapåminnelse) kräver godkännande. Alla respekterar arbetstider/nattläge.
 */
async function seedV3AutomationRules(supabase: SupabaseClient, businessId: string) {
  const { data: existing } = await supabase
    .from('v3_automation_rules')
    .select('id')
    .eq('business_id', businessId)
    .eq('is_system', true)
    .limit(1)

  if (existing && existing.length > 0) return

  const rules: Array<{
    name: string
    description: string
    trigger_type: string
    trigger_config: Record<string, unknown>
    action_type: string
    action_config: Record<string, unknown>
    requires_approval: boolean
  }> = [
    {
      name: 'Snabbsvar på ny lead',
      description: 'Skickar ett tack-SMS direkt när en ny förfrågan kommer in.',
      trigger_type: 'event',
      trigger_config: { event_name: 'lead_received' },
      action_type: 'send_sms',
      action_config: { template: 'Hej {{customer_name}}! Tack för din förfrågan till {{business_name}}. Vi återkommer så snart vi kan.' },
      requires_approval: false,
    },
    {
      name: 'Svar på missat samtal',
      description: 'SMS:ar tillbaka automatiskt när ett samtal missas.',
      trigger_type: 'event',
      trigger_config: { event_name: 'call_missed' },
      action_type: 'send_sms',
      action_config: { template: 'Hej! Vi missade tyvärr ditt samtal till {{business_name}} men återkommer så snart vi kan.' },
      requires_approval: false,
    },
    {
      name: 'Följ upp skickad offert',
      description: 'Skapar en uppföljningspåminnelse 3 dagar efter att en offert skickats.',
      trigger_type: 'event',
      trigger_config: { event_name: 'quote_sent' },
      action_type: 'schedule_followup',
      action_config: { days_until: 3, description: 'Följ upp skickad offert' },
      requires_approval: false,
    },
    {
      name: 'Kund öppnade offert',
      description: 'Notifierar dig när en kund öppnar sin offert — bra läge att höra av sig.',
      trigger_type: 'event',
      trigger_config: { event_name: 'quote_opened' },
      action_type: 'notify_owner',
      action_config: { title: 'Kund tittar på offerten', body: 'En kund har precis öppnat sin offert. Passa på att höra av dig medan den är aktuell.' },
      requires_approval: false,
    },
    {
      name: 'Påminn om förfallen faktura',
      description: 'Föreslår en betalningspåminnelse när en faktura är 7+ dagar försenad. Kräver ditt godkännande innan den skickas.',
      trigger_type: 'threshold',
      trigger_config: { entity: 'invoice', field: 'days_overdue', operator: '>=', value: 7 },
      action_type: 'send_sms',
      action_config: { template: 'Hej! En vänlig påminnelse om en faktura från {{business_name}} som har förfallit. Hör gärna av dig om du har frågor.' },
      requires_approval: true,
    },
    {
      name: 'Be om recension efter avslutat jobb',
      description: 'Skapar en påminnelse att be kunden om ett omdöme dagen efter att ett jobb avslutats.',
      trigger_type: 'event',
      trigger_config: { event_name: 'job_completed' },
      action_type: 'schedule_followup',
      action_config: { days_until: 1, description: 'Be kunden om en recension' },
      requires_approval: false,
    },
  ]

  await supabase.from('v3_automation_rules').insert(
    rules.map((r, i) => ({
      id: `v3r_${businessId}_${i}`,
      business_id: businessId,
      name: r.name,
      description: r.description,
      is_active: true,
      is_system: true,
      trigger_type: r.trigger_type,
      trigger_config: r.trigger_config,
      action_type: r.action_type,
      action_config: r.action_config,
      requires_approval: r.requires_approval,
      respects_work_hours: true,
      respects_night_mode: true,
    }))
  )
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
