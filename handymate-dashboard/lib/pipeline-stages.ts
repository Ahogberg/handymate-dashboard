/**
 * Pipeline Stages — Leads-tratt (V4)
 *
 * Hanterar pipeline_stages-tabellen som styr vilka steg en lead
 * passerar genom i säljtratten. Separerad från pipeline_stage (deals).
 */

import { getServerSupabase } from '@/lib/supabase'

export interface LeadPipelineStage {
  id: string
  business_id: string
  key: string
  label: string
  sort_order: number
  is_system: boolean
  color: string
  creates_project: boolean
  created_at: string
}

/** Default 8 systemsteg — seedad via SQL, fallback här */
export const DEFAULT_LEAD_STAGES: Omit<LeadPipelineStage, 'id' | 'business_id' | 'created_at'>[] = [
  { key: 'new_lead',      label: 'Ny lead',          sort_order: 1,  is_system: true, color: '#8B5CF6', creates_project: false },
  { key: 'contacted',     label: 'Kontaktad',        sort_order: 2,  is_system: true, color: '#3B82F6', creates_project: false },
  { key: 'quote_sent',    label: 'Offert skickad',   sort_order: 3,  is_system: true, color: '#F59E0B', creates_project: false },
  { key: 'quote_opened',  label: 'Offert öppnad',    sort_order: 4,  is_system: true, color: '#F97316', creates_project: false },
  { key: 'active_job',    label: 'Aktivt jobb',      sort_order: 5,  is_system: true, color: '#0F766E', creates_project: true },
  { key: 'invoiced',      label: 'Fakturerad',       sort_order: 6,  is_system: true, color: '#6366F1', creates_project: false },
  { key: 'completed',     label: 'Avslutad',         sort_order: 7,  is_system: true, color: '#22C55E', creates_project: false },
  { key: 'lost',          label: 'Förlorad',         sort_order: 99, is_system: true, color: '#EF4444', creates_project: false },
]

/**
 * Hämta alla pipeline-steg för ett företag.
 * Om tabellen är tom, seeda systemsteg.
 */
export async function getLeadPipelineStages(businessId: string): Promise<LeadPipelineStage[]> {
  const supabase = getServerSupabase()

  const { data: existing } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order')

  if (existing && existing.length > 0) return existing

  // Seeda default-steg om tabellen är tom
  const stages = DEFAULT_LEAD_STAGES.map(s => ({
    business_id: businessId,
    ...s,
  }))

  const { data: created, error } = await supabase
    .from('pipeline_stages')
    .insert(stages)
    .select()

  if (error) {
    console.error('Failed to seed pipeline_stages:', error)
    return []
  }
  return created || []
}

/**
 * Hämta ett specifikt steg via key.
 */
export async function getLeadStageByKey(businessId: string, key: string): Promise<LeadPipelineStage | null> {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('business_id', businessId)
    .eq('key', key)
    .single()
  return data
}

/**
 * Flytta en lead till ett nytt pipeline-steg.
 * Skyddsregel: tillåt aldrig att flytta bakåt i order (utom till 'lost').
 * Returnerar { moved, skipped, error } för loggning.
 */
export async function moveLeadToStage(params: {
  businessId: string
  leadId: string
  toStageKey: string
  triggeredBy: 'user' | 'system' | 'automation'
}): Promise<{ moved: boolean; from_stage?: string; to_stage?: string; reason?: string }> {
  const supabase = getServerSupabase()

  // Hämta nuvarande lead
  const { data: lead } = await supabase
    .from('leads')
    .select('lead_id, pipeline_stage_key')
    .eq('lead_id', params.leadId)
    .eq('business_id', params.businessId)
    .single()

  if (!lead) return { moved: false, reason: 'Lead hittades inte' }

  const currentKey = lead.pipeline_stage_key || 'new_lead'
  if (currentKey === params.toStageKey) return { moved: false, reason: 'Lead är redan i detta steg' }

  // Hämta steg-ordning
  const stages = await getLeadPipelineStages(params.businessId)
  const fromStage = stages.find(s => s.key === currentKey)
  const toStage = stages.find(s => s.key === params.toStageKey)

  if (!toStage) return { moved: false, reason: `Okänt steg: ${params.toStageKey}` }

  // Skyddsregel: tillåt aldrig bakåt (utom till 'lost' som alltid är tillåtet)
  if (params.triggeredBy === 'automation' && fromStage && toStage.key !== 'lost') {
    if (toStage.sort_order < fromStage.sort_order) {
      return {
        moved: false,
        from_stage: currentKey,
        to_stage: params.toStageKey,
        reason: `Automation kan inte flytta bakåt: ${fromStage.label} (${fromStage.sort_order}) → ${toStage.label} (${toStage.sort_order})`,
      }
    }
  }

  // Uppdatera lead
  const { error } = await supabase
    .from('leads')
    .update({
      pipeline_stage_key: params.toStageKey,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', params.leadId)
    .eq('business_id', params.businessId)

  if (error) return { moved: false, reason: error.message }

  // Fire pipeline_stage_changed event for automation rules
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    const { getServerSupabase: getSupa } = await import('@/lib/supabase')
    const supa = getSupa()
    await fireEvent(supa, 'pipeline_stage_changed', params.businessId, {
      lead_id: params.leadId,
      from_stage: currentKey,
      to_stage: params.toStageKey,
      triggered_by: params.triggeredBy,
    })
  } catch (err) {
    console.error('[moveLeadToStage] fireEvent failed:', err)
  }

  // Auto-create project if target stage has creates_project=true
  if (toStage && toStage.creates_project) {
    try {
      const { createProjectFromLead } = await import('@/lib/projects/create-from-lead')
      await createProjectFromLead(params.businessId, params.leadId)
    } catch (err) {
      console.error('[moveLeadToStage] createProjectFromLead failed:', err)
    }
  }

  return { moved: true, from_stage: currentKey, to_stage: params.toStageKey }
}
