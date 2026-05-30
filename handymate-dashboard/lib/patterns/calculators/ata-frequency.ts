/**
 * ata-frequency calculator (Fas 1a Dag 6, 2026-05-30).
 *
 * Per tasks/fas1-pattern-extraction-design.md Tier A.
 *
 * Pattern: hur ofta får projekt ÄTA (tilläggsarbete)?
 *
 * Sample = ett projekt skapat i 12-månaders-window.
 * Min N preliminary: 10 projekt.
 *
 * Inga exclusion-rules — alla projekt är giltiga samples även de utan
 * ÄTA. Ett pågående projekt utan ÄTA är en RIKTIG datapunkt ("hittills
 * ingen ÄTA"), inte ogiltigt.
 *
 * Beräkning:
 *   pct_with_ata = projects_with_ata / total_projects
 *   avg_ata_per_project = total_ata_rows / total_projects
 *   by_project_type = breakdown per project_type om satt
 *
 * Bee första körning (förväntat): 24 projekt, 0 med ÄTA →
 *   pct_with_ata = 0, sample_size = 24, is_stale = false
 *   → "0% av era 24 projekt har fått ÄTAs hittills"
 *   → FÖRSTA RIKTIGA UTTALANDET i Fas 1a för Bee
 *
 * Designval: split i ren funktion (computeAtaFrequency) + thin
 * DB-wrapper (calculateAtaFrequency).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { assessConfidence, getDataWindow } from '../sample-thresholds'
import type { AtaFrequencyValue, AtaFrequencyMetadata, CalculatorResult } from '../types'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

/**
 * Subset av project-rad som ata-frequency behöver.
 * project_type är frivilligt — om satt får vi by_project_type-breakdown.
 */
export interface AtaFrequencySample {
  id: string
  project_type: string | null
  created_at: string
  ata_count: number  // antal project_change-rader (inkl 0)
}

// ─────────────────────────────────────────────────────────────────
// Ren funktion — unit-testbar utan DB
// ─────────────────────────────────────────────────────────────────

/**
 * Beräkna ata_frequency-pattern från en samples-array av projekt.
 *
 * Caller (DB-wrapper) ansvarar för:
 *   - Hämta projekt skapade inom window
 *   - LEFT JOIN project_change för att räkna ata_count per projekt
 *   - ata_count = 0 för projekt utan tilläggsarbete (RIKTIG datapunkt)
 *
 * Inga exclusions — alla projekt är giltiga samples.
 */
export function computeAtaFrequency(
  samples: AtaFrequencySample[],
  dataWindowStart: string,
  dataWindowEnd: string,
): CalculatorResult {
  const totalProjects = samples.length
  const projectsWithAta = samples.filter(p => p.ata_count > 0).length
  const totalAtaRows = samples.reduce((sum, p) => sum + p.ata_count, 0)

  const value: AtaFrequencyValue = {
    total_projects: totalProjects,
    projects_with_ata: projectsWithAta,
    pct_with_ata: totalProjects > 0 ? projectsWithAta / totalProjects : 0,
    avg_ata_per_project: totalProjects > 0 ? totalAtaRows / totalProjects : 0,
  }

  // Breakdown per project_type (om någon sample har satt type)
  const byProjectType: Record<string, { total: number; with_ata: number; pct: number }> = {}
  for (const sample of samples) {
    if (!sample.project_type) continue
    if (!byProjectType[sample.project_type]) {
      byProjectType[sample.project_type] = { total: 0, with_ata: 0, pct: 0 }
    }
    byProjectType[sample.project_type].total++
    if (sample.ata_count > 0) byProjectType[sample.project_type].with_ata++
  }
  // Beräkna pct per typ
  for (const type of Object.keys(byProjectType)) {
    const t = byProjectType[type]
    t.pct = t.total > 0 ? t.with_ata / t.total : 0
  }

  const metadata: AtaFrequencyMetadata = {
    excluded_total: 0,  // explicit — inga exclusions för ata_frequency
    ...(Object.keys(byProjectType).length > 0 ? { by_project_type: byProjectType } : {}),
  }

  return {
    pattern_key: 'ata_frequency',
    value,
    sample_size: totalProjects,
    data_window_start: dataWindowStart,
    data_window_end: dataWindowEnd,
    metadata,
  }
}

// ─────────────────────────────────────────────────────────────────
// DB-wrapper — thin
// ─────────────────────────────────────────────────────────────────

interface ProjectRow {
  project_id: string
  project_type: string | null
  created_at: string
}

interface ProjectChangeRow {
  project_id: string
}

/**
 * Hämta projekt + project_change för business inom 12-månaders-window och
 * beräkna ata_frequency.
 *
 * Två queries (Supabase RLS gör subquery-joins svåra):
 *   1. SELECT project WHERE created_at IN window
 *   2. SELECT project_change WHERE project_id IN (de hämtade)
 *   3. Räkna ata_count per project_id client-side
 */
export async function calculateAtaFrequency(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<{
  result: CalculatorResult
  confidence: ReturnType<typeof assessConfidence>
}> {
  const window = getDataWindow('ata_frequency', now)

  const { data: projectsData, error: projectsErr } = await supabase
    .from('project')
    .select('project_id, project_type, created_at')
    .eq('business_id', businessId)
    .gte('created_at', window.start.toISOString())
    .lte('created_at', window.end.toISOString())

  if (projectsErr) {
    console.error('[calculateAtaFrequency] project query error:', projectsErr)
    throw new Error(`ata_frequency project-query failed: ${projectsErr.message}`)
  }

  const projects = (projectsData || []) as ProjectRow[]

  // Hämta project_change-rader för dessa projekt
  const ataCountByProject: Record<string, number> = {}
  if (projects.length > 0) {
    const projectIds = projects.map(p => p.project_id)
    const { data: changes, error: changesErr } = await supabase
      .from('project_change')
      .select('project_id')
      .eq('business_id', businessId)
      .in('project_id', projectIds)

    if (changesErr) {
      console.error('[calculateAtaFrequency] project_change query error:', changesErr)
      // Non-blocking — om project_change-query fail:ar antar vi 0 ÄTA per projekt
    } else {
      for (const change of (changes || []) as ProjectChangeRow[]) {
        ataCountByProject[change.project_id] = (ataCountByProject[change.project_id] || 0) + 1
      }
    }
  }

  const samples: AtaFrequencySample[] = projects.map(p => ({
    id: p.project_id,
    project_type: p.project_type,
    created_at: p.created_at,
    ata_count: ataCountByProject[p.project_id] || 0,
  }))

  const result = computeAtaFrequency(
    samples,
    window.start.toISOString(),
    window.end.toISOString(),
  )

  const confidence = assessConfidence(result.sample_size, 'ata_frequency')

  return { result, confidence }
}
