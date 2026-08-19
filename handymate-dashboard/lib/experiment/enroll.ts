/**
 * OperatingExperiment — inskrivningslagret, Etapp 2 (Adaptive Business Twin,
 * Lars-piloten, docs/council/ACTIVE_ROADMAP.md "Läge 2026-08-19").
 *
 * ═══ VAR INSKRIVNINGEN SKER ═══
 *
 * Anropas från app/api/approvals/[id]/route.ts, case
 * 'playbook_kickoff_suggestion' — omedelbart EFTER den lyckade
 * project_checklist-inserten (dvs. det ögonblick kickoff-copiloten faktiskt
 * skapar en kontrollpunkt PÅ ett projekt). Om projektets job_type matchar ett
 * AKTIVT experiment med plats kvar och inom sitt tidsfönster, läggs
 * projektets id till i experimentets enrolled_project_ids.
 *
 * ═══ ALDRIG BLOCKERANDE ═══
 *
 * maybeEnrollProject kastar ALDRIG och kan aldrig fälla kickoff-flödet —
 * kontrollpunkten (project_checklist-raden) skapas oavsett vad som händer
 * här. Ett förlorat inskrivningsförsök är förlorat mätunderlag, inte ett
 * bristande kickoff-kort.
 *
 * ═══ LÄS-TIDS-CHECK, INGEN CRON ═══
 *
 * Fönstret (start_date/end_date) och taket (max_projects) kollas vid VARJE
 * anrop mot experimentets aktuella tillstånd — inget separat schema behövs
 * för att stänga inskrivningen efter end_date eller full kapacitet; nästa
 * kandidatprojekt som råkar dyka upp efter det ser helt enkelt ett fönster
 * som redan stängt.
 *
 * Ingen fullständig CAS mot enrolled_project_ids (läs-sedan-skriv, inte
 * atomiskt) — acceptabelt i V1: kickoff-kort godkänns av en människa i taget,
 * en verklig kapplöpning kring SAMMA experiment inom samma sekund är i
 * praktiken obefintlig, och värsta konsekvensen av en missad race är att
 * max_projects tillfälligt överskrids med en enda plats — inte en trasig
 * eller förlorad rad.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import { EXPERIMENT_MAX_PROJECTS_CAP } from './types'

export type EnrollResult =
  | 'enrolled'
  | 'skipped_no_active_experiment'
  | 'skipped_already_enrolled'
  | 'skipped_window_closed'
  | 'skipped_full'
  | 'skipped_error'

interface ExperimentEnrollmentRow {
  id: string
  enrolled_project_ids: unknown
  guard_rails: Record<string, unknown> | null
}

export async function maybeEnrollProject(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  jobType: string,
  now: Date = new Date(),
): Promise<EnrollResult> {
  try {
    if (!projectId || !jobType) return 'skipped_no_active_experiment'

    const { data, error } = await supabase
      .from('operating_experiment')
      .select('id, enrolled_project_ids, guard_rails')
      .eq('business_id', businessId)
      .eq('job_type', jobType)
      .eq('status', 'active')
      .limit(1)

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[experiment/enroll] läsning misslyckades (fail-safe, ingen inskrivning):', error.message)
      }
      return 'skipped_error'
    }

    const experiment = ((data || [])[0] as ExperimentEnrollmentRow | undefined)
    if (!experiment) return 'skipped_no_active_experiment'

    const enrolled = Array.isArray(experiment.enrolled_project_ids)
      ? (experiment.enrolled_project_ids as string[])
      : []
    if (enrolled.includes(projectId)) return 'skipped_already_enrolled'

    const guardRails = experiment.guard_rails || {}
    const startDate = typeof guardRails.start_date === 'string' ? guardRails.start_date : null
    const endDate = typeof guardRails.end_date === 'string' ? guardRails.end_date : null
    const maxProjects = typeof guardRails.max_projects === 'number' ? guardRails.max_projects : EXPERIMENT_MAX_PROJECTS_CAP

    // Malformade skyddsgränser (borde vara omöjligt bakom v157:s CHECK-
    // constraints, men läsningen litar inte blint på det) — skriv aldrig in
    // ett projekt utan att kunna verifiera fönstret.
    if (!startDate || !endDate) return 'skipped_error'

    const nowMs = now.getTime()
    const startMs = Date.parse(startDate)
    const endMs = Date.parse(`${endDate}T23:59:59.999Z`)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'skipped_error'
    if (nowMs < startMs || nowMs > endMs) return 'skipped_window_closed'

    if (enrolled.length >= maxProjects) return 'skipped_full'

    const { error: updateErr } = await supabase
      .from('operating_experiment')
      .update({ enrolled_project_ids: [...enrolled, projectId] })
      .eq('id', experiment.id)
      .eq('business_id', businessId)
      .eq('status', 'active')

    if (updateErr) {
      console.error('[experiment/enroll] skrivning misslyckades (fail-safe):', updateErr.message)
      return 'skipped_error'
    }
    return 'enrolled'
  } catch (err) {
    console.error('[experiment/enroll] oväntat fel (fail-safe):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase, businessId, 'experiment/enroll:unexpected',
        err instanceof Error ? err.message : String(err), { projectId, jobType },
      )
    }
    return 'skipped_error'
  }
}
