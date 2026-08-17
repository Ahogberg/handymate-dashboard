/**
 * Kontrollpunkts-utfall — läsfunktion, INGEN skrivning, ingen ny tabell
 * (Decision Twin, Lars-narrow-slice, tasks/todo.md 2026-08-17).
 *
 * ═══ VAD DEN GÖR ═══
 *
 * Kedjar ihop fyra tabeller som redan bär hela länken — ingen ny relation
 * behöver uppfinnas (se lib/playbook/propose-kickoff.ts och
 * app/api/approvals/[id]/route.ts, case 'playbook_kickoff_suggestion'):
 *
 *   pending_approvals (approval_type='playbook_kickoff_suggestion',
 *   status='approved') — payload.pattern_id/job_type/pattern_text +
 *   payload.execution_result.artifacts.checklist_id/project_id
 *     → project_checklist (id=checklist_id) — items[0].checked
 *     → project (project_id) — status, name
 *       → om status='completed': project_outcome (project_id) —
 *         learning_blockers
 *
 * ═══ INGEN KAUSALITET — BARA RÄKNADE FAKTA ═══
 *
 * Ingen sträng i den här filen — kommentar, kod eller genererad text — får
 * PÅSTÅ eller ANTYDA orsak. Skillnaden är samma som den Codex själv drog
 * upp för Value Ledger: att konstatera ATT en betalning inföll efter en
 * påminnelse är en observation ingen kan bestrida; att påstå att
 * påminnelsen FICK kunden att betala är ett kausalitetspåstående ingen
 * mätning här styrker. Samma princip gäller kontrollpunkter: `outcome`
 * klassificerar OM ett fryst projektutfall finns och om underlaget var
 * fullständigt — inte VARFÖR projektet blev som det blev. Verb som
 * kopplar en handling till ett bättre/sämre resultat som dess EFFEKT hör
 * inte hemma i den här filen, varken i kod eller kommentar.
 * tests/checkpoint-outcomes.spec.ts låser detta med en källkodsskanning
 * (grep efter ett par sådana verb, case-insensitive) — se testfilen för
 * den exakta ordlistan; den listas medvetet INTE här, för att den listan
 * själv inte ska räknas som en förekomst.
 *
 * Fail-safe genomgående, samma konvention som
 * lib/playbook/kickoff-candidates.ts: kastar aldrig, degraderar till tom
 * lista vid vilket fel som helst (schema saknas, nätverksfel, trasig rad).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'

export interface CheckpointOutcomeRow {
  pattern_id: string
  job_type: string
  pattern_text: string
  project_id: string
  project_name: string | null
  /** pending_approvals.resolved_at — när kortet godkändes. */
  approved_at: string
  /** items[0].checked på den skapade project_checklist-raden. */
  checkpoint_checked: boolean
  project_status: string
  /**
   * 'verified_clean' | 'verified_flagged' | 'unavailable' | 'inconclusive'.
   * En KLASSIFICERING av vilket underlag som finns — ALDRIG ett
   * kausalitetspåstående. Se filhuvudet.
   *
   *   unavailable    — projektet är inte stängt än, inget utfall att fråga.
   *   inconclusive   — projektet är stängt men saknar ett fryst
   *                    project_outcome (t.ex. kvalitetsschemat ej kört).
   *   verified_clean — fryst utfall finns, learning_blockers är tom.
   *   verified_flagged — fryst utfall finns, men med minst en learning_blocker
   *                    (underlaget var inte fullständigt).
   */
  outcome: 'verified_clean' | 'verified_flagged' | 'unavailable' | 'inconclusive'
}

interface ApprovedKickoffRow {
  pattern_id: string
  job_type: string
  pattern_text: string
  checklist_id: string
  project_id: string
  approved_at: string
}

/**
 * Steg 1 — godkända kickoff-kort med båda artefakt-ID:na på plats.
 *
 * Kort som saknar payload.execution_result.artifacts (t.ex. en gammal
 * exekvering som misslyckades och aldrig kördes om) hoppas tyst över —
 * det finns inget att koppla ihop ännu, det är inte ett fel.
 */
async function fetchApprovedKickoffCards(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ApprovedKickoffRow[]> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('payload, resolved_at')
    .eq('business_id', businessId)
    .eq('approval_type', 'playbook_kickoff_suggestion')
    .eq('status', 'approved')

  if (error) {
    if (!arSchemaSaknas(error)) {
      console.error('[playbook/checkpoint-outcomes] kort-läsning misslyckades (fail-safe, tom lista):', error.message)
    }
    return []
  }

  const rows: ApprovedKickoffRow[] = []
  for (const raw of (data || []) as Array<Record<string, unknown>>) {
    const payload = (raw.payload || {}) as Record<string, unknown>
    const patternId = payload.pattern_id as string | undefined
    const jobType = payload.job_type as string | undefined
    const patternText = payload.pattern_text as string | undefined
    const executionResult = (payload.execution_result || {}) as Record<string, unknown>
    const artifacts = (executionResult.artifacts || {}) as Record<string, unknown>
    const checklistId = artifacts.checklist_id as string | undefined
    const projectId = artifacts.project_id as string | undefined
    const approvedAt = raw.resolved_at as string | undefined

    if (!patternId || !jobType || !patternText || !checklistId || !projectId || !approvedAt) continue

    rows.push({
      pattern_id: patternId,
      job_type: jobType,
      pattern_text: patternText,
      checklist_id: checklistId,
      project_id: projectId,
      approved_at: approvedAt,
    })
  }
  return rows
}

/** Steg 2 — checklist_id → är kontrollpunkten avbockad? (items[0].checked). */
async function fetchChecklistChecked(
  supabase: SupabaseClient,
  businessId: string,
  checklistIds: string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>()
  if (checklistIds.length === 0) return map

  const { data, error } = await supabase
    .from('project_checklist')
    .select('id, items')
    .eq('business_id', businessId)
    .in('id', checklistIds)

  if (error) {
    if (!arSchemaSaknas(error)) {
      console.error('[playbook/checkpoint-outcomes] checklist-läsning misslyckades (fail-safe, tom karta):', error.message)
    }
    return map
  }

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const id = row.id as string
    const items = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : []
    map.set(id, items[0]?.checked === true)
  }
  return map
}

/** Steg 3 — project_id → { name, status }. */
async function fetchProjects(
  supabase: SupabaseClient,
  businessId: string,
  projectIds: string[],
): Promise<Map<string, { name: string | null; status: string }>> {
  const map = new Map<string, { name: string | null; status: string }>()
  if (projectIds.length === 0) return map

  const { data, error } = await supabase
    .from('project')
    .select('project_id, name, status')
    .eq('business_id', businessId)
    .in('project_id', projectIds)

  if (error) {
    if (!arSchemaSaknas(error)) {
      console.error('[playbook/checkpoint-outcomes] projekt-läsning misslyckades (fail-safe, tom karta):', error.message)
    }
    return map
  }

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    map.set(row.project_id as string, {
      name: (row.name as string | null) ?? null,
      status: (row.status as string) || '',
    })
  }
  return map
}

/** Steg 4 — bara för STÄNGDA projekt: project_id → learning_blockers. */
async function fetchOutcomes(
  supabase: SupabaseClient,
  businessId: string,
  completedProjectIds: string[],
): Promise<Map<string, { learning_blockers: string[] }>> {
  const map = new Map<string, { learning_blockers: string[] }>()
  if (completedProjectIds.length === 0) return map

  const { data, error } = await supabase
    .from('project_outcome')
    .select('project_id, learning_blockers')
    .eq('business_id', businessId)
    .in('project_id', completedProjectIds)

  if (error) {
    if (!arSchemaSaknas(error)) {
      console.error('[playbook/checkpoint-outcomes] utfalls-läsning misslyckades (fail-safe, tom karta):', error.message)
    }
    return map
  }

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const blockers = Array.isArray(row.learning_blockers) ? (row.learning_blockers as string[]) : []
    map.set(row.project_id as string, { learning_blockers: blockers })
  }
  return map
}

/**
 * Hämtar kontrollpunkts-utfall för ett företag: godkända kickoff-kort
 * kopplade till sina project_checklist-/project-/project_outcome-rader,
 * klassificerade enligt outcome-vokabulären ovan. Kastar ALDRIG — se
 * filhuvudet.
 */
export async function getCheckpointOutcomes(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CheckpointOutcomeRow[]> {
  try {
    const kickoffRows = await fetchApprovedKickoffCards(supabase, businessId)
    if (kickoffRows.length === 0) return []

    const checklistIds = Array.from(new Set(kickoffRows.map(r => r.checklist_id)))
    const projectIds = Array.from(new Set(kickoffRows.map(r => r.project_id)))

    const [checkedMap, projectMap] = await Promise.all([
      fetchChecklistChecked(supabase, businessId, checklistIds),
      fetchProjects(supabase, businessId, projectIds),
    ])

    const completedProjectIds = projectIds.filter(id => projectMap.get(id)?.status === 'completed')
    const outcomeMap = await fetchOutcomes(supabase, businessId, completedProjectIds)

    const rows: CheckpointOutcomeRow[] = []
    for (const r of kickoffRows) {
      const project = projectMap.get(r.project_id)
      // Projektet gick inte att slå upp (t.ex. borttaget) — utelämnas,
      // resten av kedjan påverkas inte.
      if (!project) continue

      let outcome: CheckpointOutcomeRow['outcome']
      if (project.status !== 'completed') {
        outcome = 'unavailable'
      } else {
        const frozen = outcomeMap.get(r.project_id)
        if (!frozen) {
          outcome = 'inconclusive'
        } else {
          outcome = frozen.learning_blockers.length === 0 ? 'verified_clean' : 'verified_flagged'
        }
      }

      rows.push({
        pattern_id: r.pattern_id,
        job_type: r.job_type,
        pattern_text: r.pattern_text,
        project_id: r.project_id,
        project_name: project.name,
        approved_at: r.approved_at,
        checkpoint_checked: checkedMap.get(r.checklist_id) === true,
        project_status: project.status,
        outcome,
      })
    }
    return rows
  } catch (err) {
    console.error('[playbook/checkpoint-outcomes] oväntat fel (fail-safe, tom lista):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase, businessId, 'playbook/checkpoint-outcomes:unexpected',
        err instanceof Error ? err.message : String(err),
      )
    }
    return []
  }
}

export interface CheckpointPatternSummary {
  pattern_id: string
  job_type: string
  /** Antal kontrollpunkter föreslagna (och godkända) för mönstret. */
  suggested: number
  /** Antal av dem som blivit avbockade. */
  checked: number
  /** Antal STÄNGDA projekt med fullständigt underlag (verified_clean). */
  verified_clean: number
  /** Antal STÄNGDA projekt med ofullständigt underlag (verified_flagged). */
  verified_flagged: number
}

/**
 * Ren funktion, ingen I/O. Grupperar rader per mönster till räknade
 * summeringar — exakt den sortens sifferexakta mening Lars kan uttrycka i
 * klartext: "N kontrollpunkter föreslagna, M avbockade, K av de stängda
 * projekten hade rent underlag." Ingen sammanfattning som kopplar
 * kontrollpunkten till ett bättre utfall härleds eller skrivs härifrån —
 * bara summerade fakta. Se filhuvudet.
 */
export function summarizeByPattern(rows: CheckpointOutcomeRow[]): CheckpointPatternSummary[] {
  const map = new Map<string, CheckpointPatternSummary>()

  for (const row of rows) {
    let summary = map.get(row.pattern_id)
    if (!summary) {
      summary = {
        pattern_id: row.pattern_id,
        job_type: row.job_type,
        suggested: 0,
        checked: 0,
        verified_clean: 0,
        verified_flagged: 0,
      }
      map.set(row.pattern_id, summary)
    }
    summary.suggested += 1
    if (row.checkpoint_checked) summary.checked += 1
    if (row.outcome === 'verified_clean') summary.verified_clean += 1
    if (row.outcome === 'verified_flagged') summary.verified_flagged += 1
  }

  return Array.from(map.values())
}
