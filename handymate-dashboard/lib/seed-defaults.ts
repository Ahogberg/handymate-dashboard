import { getServerSupabase } from '@/lib/supabase'
import { getDefaultStandardTexts } from '@/lib/quote-standard-text-defaults'
import { getChecklistsForBranch } from '@/lib/checklist-defaults'
import { getDefaultPriceList } from '@/lib/price-list-defaults'
import { getDefaultQuoteTemplates, normalizeTemplateBranch } from '@/lib/quote-template-defaults'
import { getDefaultAgreementTypes } from '@/lib/agreement-type-defaults'

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
    // OBS: legacy seedAutomationRules (automation_rules/automation_queue) är
    // borttaget — det systemet är inert (ingen incheckad konsument: ingen
    // pg_cron, inget i appen enqueue:ar, edge-funktionen scheduled-triggers är
    // oschemalagd). v3_automation_rules nedan är den levande motorn.
    seedV3AutomationRules(supabase, businessId),
    seedLeadScoringRules(supabase, businessId),
    seedPipelineStages(supabase, businessId),
    seedQuoteStandardTexts(supabase, businessId, branch),
    seedChecklistTemplates(supabase, businessId, branch),
    seedPriceList(supabase, businessId, branch),
    seedQuoteTemplates(supabase, businessId, branch),
    seedAgreementTypes(supabase, businessId, branch),
  ])

  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    console.error(`[seedAllDefaults] ${failed.length} seed operations failed:`,
      failed.map(r => (r as PromiseRejectedResult).reason))
  }

  return { total: results.length, succeeded: results.length - failed.length, failed: failed.length }
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
      action_config: { template: 'Hej! Vi missade tyvärr ditt samtal till {{business_name}}. Svara på detta SMS med vad du behöver hjälp med, så återkommer vi direkt — eller ringer upp så snart vi kan.' },
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
    .from('lead_scoring_rules')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.rpc('seed_lead_scoring_rules', { p_business_id: businessId })
}

/**
 * OBS — två separata stage-system samexisterar (avsiktligt, olika syften):
 *   • `pipeline_stage` (SINGULAR) = Kanban-deals-boarden. Seedas här.
 *   • `pipeline_stages` (PLURAL) = V4 lead-pipeline (lib/pipeline-stages.ts),
 *     self-seedar lazy vid första läsning — seedas alltså INTE här.
 * Förväxla inte tabellerna när du skriver queries.
 */
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

/**
 * Seedar mallbanken (quote_templates) — delar lib/quote-template-defaults.ts
 * med app/api/quote-templates/seed/route.ts (den manuella "Hämta färdiga
 * mallar"-CTA:n). Idempotent per mallnamn (inte bara "finns någon mall") så
 * att en business som redan sparat en egen mall ändå får branschmallarna.
 */
async function seedQuoteTemplates(supabase: SupabaseClient, businessId: string, branch: string) {
  const normalizedBranch = normalizeTemplateBranch(branch)

  const { data: existingRows } = await supabase
    .from('quote_templates')
    .select('name')
    .eq('business_id', businessId)

  const existingNames = new Set((existingRows || []).map((r: { name: string }) => r.name))
  const defaultTemplates = getDefaultQuoteTemplates(normalizedBranch).filter(t => !existingNames.has(t.name))

  if (defaultTemplates.length === 0) return

  const defaultTexts = getDefaultStandardTexts(normalizedBranch)
  const texts: Record<string, string> = {}
  for (const t of defaultTexts) texts[t.text_type] = t.content

  await supabase.from('quote_templates').insert(
    defaultTemplates.map((t, i) => ({
      id: `qtpl_${businessId}_${i}`,
      business_id: businessId,
      branch: normalizedBranch,
      name: t.name,
      description: t.description,
      category: t.category,
      introduction_text: texts.introduction || null,
      conclusion_text: texts.conclusion || null,
      not_included: texts.not_included || null,
      ata_terms: texts.ata_terms || null,
      payment_terms_text: texts.payment_terms || null,
      default_items: t.default_items,
      default_payment_plan: t.default_payment_plan,
      rot_enabled: t.rot_enabled,
      rut_enabled: t.rut_enabled,
    }))
  )
}

/**
 * Relationen (tabellen) saknas — v74_serviceavtal.sql har inte körts än i
 * Supabase SQL Editor (migrationer körs manuellt, se CLAUDE.md). Postgres
 * ger felkod 42P01, PostgREST kan även svara med "schema cache"-text.
 */
function isMissingRelationError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = String(error.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|service_agreement_type/i.test(message)
}

/**
 * Seedar serviceavtalskatalogen (service_agreement_type) — delar
 * lib/agreement-type-defaults.ts. Idempotent per namn (samma mönster som
 * seedQuoteTemplates ovan). FAIL-SAFE mot v74 ej körd: om tabellen saknas
 * skippas tyst istället för att blockera resten av seedAllDefaults (som
 * körs via Promise.allSettled tillsammans med alla andra seed-steg).
 */
async function seedAgreementTypes(supabase: SupabaseClient, businessId: string, branch: string) {
  const normalizedBranch = normalizeTemplateBranch(branch)

  const { data: existingRows, error: selectErr } = await supabase
    .from('service_agreement_type')
    .select('name')
    .eq('business_id', businessId)

  if (selectErr) {
    if (isMissingRelationError(selectErr)) return
    throw selectErr
  }

  const existingNames = new Set((existingRows || []).map((r: { name: string }) => r.name))
  const defaultTypes = getDefaultAgreementTypes(normalizedBranch).filter(t => !existingNames.has(t.name))

  if (defaultTypes.length === 0) return

  const { error: insertErr } = await supabase.from('service_agreement_type').insert(
    defaultTypes.map((t, i) => ({
      type_id: `sat_${businessId}_${i}`,
      business_id: businessId,
      name: t.name,
      description: t.description,
      interval_months: t.interval_months,
      visit_duration_min: t.visit_duration_min,
      price_items: t.price_items,
      match_keys: t.match_keys,
      is_active: true,
      seeded: true,
    }))
  )
  if (insertErr && !isMissingRelationError(insertErr)) throw insertErr
}
