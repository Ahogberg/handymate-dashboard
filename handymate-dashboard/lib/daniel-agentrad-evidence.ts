/**
 * Daniels agentrad — tenantbunden I/O-gräns.
 *
 * Läser bevisen bakom verklighetskontrollen (lib/daniel-intelligence.ts):
 * samma matchning (quotes.template_id först, annars job_type — aldrig
 * fritext), samma kvalitetsgrind (time_learning_eligible + aktuell
 * calculation_version) och samma tenant-scope på varje fråga. Kastar
 * aldrig: ett källfel ger null, och då finns ingen rad — hellre tyst än en
 * rad med gissade siffror.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { OUTCOME_CALCULATION_VERSION } from '@/lib/efterkalkyl/freeze-outcome'
import {
  buildAgentradExamples,
  countOverruns,
  eligibleOutcomeRows,
  type AgentradEvidence,
  type AgentradLesson,
  type AgentradOutcomeRow,
} from '@/lib/daniel-agentrad'

export interface AgentradQuoteContext {
  quote_status: string | null
  template_id: string | null
  job_type: string | null
}

/** Offertens explicit sparade klassificering + status — bara det raden behöver. */
export async function readAgentradQuoteContext(
  supabase: SupabaseClient,
  businessId: string,
  quoteId: string,
): Promise<AgentradQuoteContext | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('quote_id, status, template_id, job_type')
    .eq('business_id', businessId)
    .eq('quote_id', quoteId)
    .maybeSingle()
  if (error || !data) return null
  return {
    quote_status: typeof data.status === 'string' ? data.status : null,
    template_id: typeof data.template_id === 'string' && data.template_id.trim() ? data.template_id.trim() : null,
    job_type: typeof data.job_type === 'string' && data.job_type.trim() ? data.job_type.trim() : null,
  }
}

/**
 * Bevisen för en offert som redan passerat verklighetskontrollens grind.
 * Returnerar null om offerten inte är ett utkast, saknar mall/jobbtyp eller
 * om någon källa inte kan läsas säkert.
 */
export async function getDanielAgentradEvidence(
  supabase: SupabaseClient,
  businessId: string,
  quoteId: string,
): Promise<AgentradEvidence | null> {
  try {
    const context = await readAgentradQuoteContext(supabase, businessId, quoteId)
    if (!context || context.quote_status !== 'draft') return null
    const { template_id: templateId, job_type: jobType } = context
    if (!templateId && !jobType) return null

    let outcomeQuery = supabase
      .from('project_outcome')
      .select('project_id, closed_at, quoted_hours, actual_hours, hours_diff_pct, time_learning_eligible')
      .eq('business_id', businessId)
      .eq('calculation_version', OUTCOME_CALCULATION_VERSION)
    outcomeQuery = templateId
      ? outcomeQuery.eq('template_id', templateId)
      : outcomeQuery.eq('job_type', jobType as string)

    const { data: outcomeRows, error: outcomeError } = await outcomeQuery
    if (outcomeError) {
      console.error('[daniel-agentrad] project_outcome kunde inte läsas:', outcomeError)
      return null
    }

    const rows = (outcomeRows || []) as AgentradOutcomeRow[]
    const eligible = eligibleOutcomeRows(rows)
    const { over_count, sample_count } = countOverruns(eligible)
    const matchedProjectIds = Array.from(new Set(eligible.map(row => row.project_id).filter(Boolean)))

    const names: Record<string, string | null> = {}
    if (matchedProjectIds.length > 0) {
      const { data: projects, error: projectError } = await supabase
        .from('project')
        .select('project_id, name')
        .eq('business_id', businessId)
        .in('project_id', matchedProjectIds)
      if (projectError) {
        console.error('[daniel-agentrad] projektnamn kunde inte läsas:', projectError)
      } else {
        for (const project of (projects || []) as Array<{ project_id: string; name: string | null }>) {
          names[project.project_id] = project.name
        }
      }
    }

    const examples = buildAgentradExamples(eligible, names, 3)
    const lesson = await readNewestLesson(supabase, businessId, {
      templateMatchedProjectIds: templateId ? matchedProjectIds : null,
      jobType,
    })

    return { examples, over_count, sample_count, lesson }
  } catch (error) {
    console.error('[daniel-agentrad] bevisen kunde inte läsas:', error)
    return null
  }
}

/**
 * Senaste bekräftade debrief-lärdomen för samma matchning. project_lesson
 * saknar template_id — vid mallmatch tas lärdomar från de matchade
 * projekten, vid jobbtypsmatch lärdomar med samma job_type.
 */
async function readNewestLesson(
  supabase: SupabaseClient,
  businessId: string,
  match: { templateMatchedProjectIds: string[] | null; jobType: string | null },
): Promise<AgentradLesson | null> {
  let query = supabase
    .from('project_lesson')
    .select('project_id, lesson_text, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (match.templateMatchedProjectIds) {
    if (match.templateMatchedProjectIds.length === 0) return null
    query = query.in('project_id', match.templateMatchedProjectIds)
  } else if (match.jobType) {
    query = query.eq('job_type', match.jobType)
  } else {
    return null
  }

  const { data, error } = await query
  if (error) {
    // Tabellen kan saknas (v121 ej körd) — raden klarar sig utan lärdomen.
    console.error('[daniel-agentrad] project_lesson kunde inte läsas:', error)
    return null
  }
  const row = (data || [])[0] as { project_id: string; lesson_text: string | null; created_at: string | null } | undefined
  if (!row || typeof row.lesson_text !== 'string' || !row.lesson_text.trim()) return null
  return { project_id: row.project_id, lesson_text: row.lesson_text.trim(), created_at: row.created_at ?? null }
}
