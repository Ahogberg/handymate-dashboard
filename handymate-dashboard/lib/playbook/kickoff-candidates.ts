/**
 * Playbook Kickoff Copilot V1 (tasks/todo.md "Playbook Kickoff Copilot V1
 * — 2026-08-17 (04:00)") — kandidat-detektion.
 *
 * Playbook Pattern Confirmation V1 (natten innan) formar redan Daniels
 * offertmotor via bekräftade, jobbtyp-scopade mönster i business_knowledge
 * (knowledge_type='pattern', job_type — sql/v141_business_knowledge_
 * pattern.sql, EJ körd i prod ännu). Den här modulen gör motsvarande för
 * PROJEKT som redan finns: hittar nyligen skapade, icke avslutade projekt
 * vars job_type matchar ett aktivt bekräftat mönster, och samlar ihop
 * belägget (källprojektens namn) så ett godkännandekort kan citera det.
 *
 * ═══ VARFÖR EN PERIODISK SVEPNING, INTE ETT SKAPANDE-HOOK ═══
 *
 * Ett ursprungsförslag krokade in i projekt-SKAPANDET direkt. Research
 * (se tasks/todo.md, korrigering 3) visade att den faktiska produktions-
 * vägen för signering (onQuoteAccepted i lib/project-ai-engine.ts)
 * förbigår create-from-quote.ts i de flesta fall — samma rotorsak som gav
 * 29/33 projekt stage:null 2026-08-13. Ett skapande-hook skulle tyst missa
 * de flesta riktiga projekt. Den här funktionen läser i stället NUVARANDE
 * tillstånd (samma princip som fixade stage:null-buggen) — anropas av en
 * veckovis(-ish) cron (app/api/cron/playbook-kickoff/route.ts).
 *
 * KICKOFF_WINDOW_DAYS = 14: längre än en vecka så ett projekt skapat
 * strax efter förra körningen ändå fångas av nästa, kortare än en månad
 * så en gammal, redan pågående renovering inte plötsligt får en
 * "kickoff"-kontrollpunkt lång tid efter start.
 *
 * ═══ LIVSTIDS-DEDUP ═══
 *
 * En kontrollpunkt är en engångs-nudge per projekt, inte återkommande —
 * samma resonemang som lib/debrief/create-debrief-card.ts: dedupen läser
 * pending_approvals UTAN statusfilter. Ett avvisat kort ska aldrig komma
 * tillbaka för samma projekt.
 *
 * Fail-safe genomgående: kastar aldrig. Ett fel för ETT projekt (eller
 * dess evidens-uppslag) får aldrig fälla svepet för alla andra projekt —
 * samma per-item try/catch som lib/playbook/propose-pattern.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'

/** Se filhuvudet för motiveringen. */
export const KICKOFF_WINDOW_DAYS = 14

export interface KickoffCandidate {
  project_id: string
  job_type: string
  pattern_text: string
  confidence: number | null
  /** Deduplicerade, verkliga källprojekt-namn — se resolveSourceProjectNames. */
  source_project_names: string[]
  /** business_knowledge.id — för spårbarhet i kortet. */
  pattern_id: string
}

interface ActivePattern {
  id: string
  observation: string
  confidence: number | null
  evidence_lesson_ids: string[]
}

/** Livstids-dedup — se filhuvudet. INGET statusfilter, avsiktligt. */
async function hasExistingKickoffCard(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('business_id', businessId)
    .eq('approval_type', 'playbook_kickoff_suggestion')
    .contains('payload', { project_id: projectId })
    .limit(1)

  if (error) {
    console.error('[playbook/kickoff-candidates] dedup-läsning misslyckades (fail-safe, hoppar):', error.message)
    // Osäkert DB-läge tolkas som "finns" — hellre missa ett förslag än
    // riskera en dubblett (samma konvention som propose-pattern.ts).
    return true
  }
  return !!data && data.length > 0
}

/**
 * Samma queryform som fetchConfirmedPatterns (lib/ai-quote-generator.ts)/
 * hasActiveConfirmedPattern (lib/playbook/propose-pattern.ts) — medvetet
 * återanvänd, inte omfunnen. Kan legitimt sakna job_type-kolumnen (v141
 * ej körd) — arSchemaSaknas dämpar larmet men degraderar ändå till null.
 */
async function fetchActivePatternForJobType(
  supabase: SupabaseClient,
  businessId: string,
  jobType: string,
): Promise<ActivePattern | null> {
  const { data, error } = await supabase
    .from('business_knowledge')
    .select('id, observation, confidence, data_basis')
    .eq('business_id', businessId)
    .eq('knowledge_type', 'pattern')
    .eq('job_type', jobType)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    if (!arSchemaSaknas(error)) {
      console.error('[playbook/kickoff-candidates] mönster-läsning misslyckades (fail-safe, hoppar):', error.message)
    }
    return null
  }

  const row = ((data || [])[0] as Record<string, unknown> | undefined)
  if (!row) return null

  const dataBasis = (row.data_basis || {}) as { evidence_lesson_ids?: unknown }
  const evidenceLessonIds = Array.isArray(dataBasis.evidence_lesson_ids)
    ? (dataBasis.evidence_lesson_ids as string[])
    : []

  return {
    id: row.id as string,
    observation: row.observation as string,
    confidence: (row.confidence as number | null) ?? null,
    evidence_lesson_ids: evidenceLessonIds,
  }
}

/**
 * evidence_lesson_ids → project_lesson.project_id → project.name.
 *
 * GRACEFUL DEGRADE (tasks/todo.md-kravet): om ett källprojekt är borttaget
 * behöver ingen särskild felgren skrivas — .in('project_id', ids) i andra
 * steget returnerar bara inga rader för det borttagna projektet, så dess
 * namn uteblir naturligt ur resultatet. Ett RIKTIGT läsfel (nätverk,
 * schema) degraderar hela evidenslistan till tom — kandidaten i sig
 * faller ALDRIG bort för det, bara belägget saknas.
 */
async function resolveSourceProjectNames(
  supabase: SupabaseClient,
  businessId: string,
  evidenceLessonIds: string[],
): Promise<string[]> {
  if (!evidenceLessonIds || evidenceLessonIds.length === 0) return []

  const { data: lessonRows, error: lessonErr } = await supabase
    .from('project_lesson')
    .select('project_id')
    .eq('business_id', businessId)
    .in('id', evidenceLessonIds)

  if (lessonErr) {
    console.error(
      '[playbook/kickoff-candidates] evidens-uppslag (lärdomar) misslyckades (fail-safe, tom evidenslista):',
      lessonErr.message,
    )
    return []
  }

  const projectIds = Array.from(new Set(
    ((lessonRows || []) as Array<{ project_id: string | null }>)
      .map(row => row.project_id)
      .filter((id): id is string => !!id),
  ))
  if (projectIds.length === 0) return []

  const { data: projectRows, error: projectErr } = await supabase
    .from('project')
    .select('project_id, name')
    .eq('business_id', businessId)
    .in('project_id', projectIds)

  if (projectErr) {
    console.error(
      '[playbook/kickoff-candidates] evidens-uppslag (källprojekt) misslyckades (fail-safe, tom evidenslista):',
      projectErr.message,
    )
    return []
  }

  return Array.from(new Set(
    ((projectRows || []) as Array<{ project_id: string; name: string | null }>)
      .map(row => row.name?.trim())
      .filter((name): name is string => !!name),
  ))
}

/**
 * Hittar kickoff-kandidater för ett företag: nyligen skapade, icke
 * avslutade projekt med ett job_type som matchar ett aktivt bekräftat
 * mönster, ännu inte föreslagna. Kastar ALDRIG — se filhuvudet.
 */
export async function findKickoffCandidates(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<KickoffCandidate[]> {
  try {
    const cutoffIso = new Date(now.getTime() - KICKOFF_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: projects, error: projErr } = await supabase
      .from('project')
      .select('project_id, job_type, status, created_at')
      .eq('business_id', businessId)
      .neq('status', 'completed')
      .not('job_type', 'is', null)
      .gte('created_at', cutoffIso)

    if (projErr) {
      console.error('[playbook/kickoff-candidates] projekt-läsning misslyckades (fail-safe, tom lista):', projErr.message)
      if (!arSchemaSaknas(projErr)) {
        await rapporteraTystFel(supabase, businessId, 'playbook/kickoff-candidates:fetchProjects', projErr.message)
      }
      return []
    }

    const candidates: KickoffCandidate[] = []

    for (const row of (projects || []) as Array<Record<string, unknown>>) {
      const projectId = row.project_id as string | undefined
      const jobType = row.job_type as string | null | undefined
      if (!projectId || !jobType) continue

      try {
        if (await hasExistingKickoffCard(supabase, businessId, projectId)) continue

        const pattern = await fetchActivePatternForJobType(supabase, businessId, jobType)
        if (!pattern) continue

        const sourceProjectNames = await resolveSourceProjectNames(
          supabase, businessId, pattern.evidence_lesson_ids,
        )

        candidates.push({
          project_id: projectId,
          job_type: jobType,
          pattern_text: pattern.observation,
          confidence: pattern.confidence,
          source_project_names: sourceProjectNames,
          pattern_id: pattern.id,
        })
      } catch (err) {
        // Ett projekts fel (t.ex. evidens-uppslag) får inte fälla svepet
        // för alla andra projekt.
        console.error('[playbook/kickoff-candidates] kandidat-uppslag misslyckades (fail-safe, hoppar projektet):', err)
        continue
      }
    }

    return candidates
  } catch (err) {
    console.error('[playbook/kickoff-candidates] oväntat fel (fail-safe, tom lista):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase, businessId, 'playbook/kickoff-candidates:unexpected',
        err instanceof Error ? err.message : String(err),
      )
    }
    return []
  }
}
