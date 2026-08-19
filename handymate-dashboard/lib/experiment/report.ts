/**
 * OperatingExperiment — redovisningslagret, Etapp 2 (Adaptive Business Twin,
 * Lars-piloten, docs/council/ACTIVE_ROADMAP.md "Läge 2026-08-19").
 *
 * ═══ NÄR ETT FÖRSÖK BLIR REDOVISNINGSBART ═══
 *
 * Ett AKTIVT experiment blir redo för ett redovisningskort när ANTINGEN
 * end_date har passerat ELLER alla inskrivna projekt har fått ett fryst
 * project_outcome (dvs. measureExperiment().projects_completed ===
 * enrolled_project_ids.length) — beroende på vilket som inträffar först.
 * Inget kräver att projekten är LÄRANDEBERÄTTIGADE (financial_/time_
 * learning_eligible), bara att de är STÄNGDA — annars skulle ett experiment
 * med enbart icke-lärandeberättigade projekt aldrig bli redovisningsbart.
 *
 * ═══ VAR SVEPET KÖRS ═══
 *
 * app/api/cron/maintenance/route.ts (befintlig daglig cron, 03:00 UTC) —
 * INGEN ny vercel.json-rad. Samma kända fallgrop som redan är dokumenterad i
 * CLAUDE.md ("Vercel cron: Hobby-planen tillåter max en körning per dag") gör
 * att nya schemarader ska undvikas när en befintlig daglig svepning räcker.
 * maintenance/route.ts är redan en numrerad kedja av oberoende, var för sig
 * fail-soft steg (expire-approvals, phone-sync, review-requests,
 * jobb-igång) — redovisningssvepet blir steg 5 i samma mönster.
 *
 * ═══ FROZEN_SUMMARY SKRIVS EN GÅNG, ENDAST HÄR ═══
 *
 * concludeExperiment (nedan) är den ENDA skrivvägen till operating_
 * experiment.frozen_summary i hela kodbasen — v157:s CHECK-constraint
 * (experiment_frozen_summary_only_when_concluded) håller den disciplinen i
 * databasen, den här filen håller den i applikationslagret: frozen_summary
 * sätts i SAMMA update som flippar status → 'concluded', aldrig igen efteråt.
 * Räknade fakta (measureExperiment-resultatet), aldrig en slutsats.
 *
 * ═══ TEXTEN — RÄKNADE FAKTA, ALDRIG VÄRDEORD ═══
 *
 * buildReadoutBody/buildReadoutCardCopy är RENA funktioner (ingen I/O) som
 * bygger kortets brödtext genom att räkna direkt ur ExperimentMeasurement —
 * "Kontrollen användes på X projekt. Y hade inga sena ändringar. Z saknar
 * tillräckligt underlag." Se lib/experiment/types.ts filhuvud för
 * kausalitetsbanet — det gäller den här filen precis som alla andra i
 * lib/experiment/.
 *
 * Fail-safe genomgående: kastar aldrig, ett experiments fel får aldrig fälla
 * svepet för alla andra (per-experiment try/catch, samma mönster som
 * cron/playbook-kickoff).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import { measureExperiment, type ExperimentMeasurement, type MeasurableExperiment } from './measure'
import type { ExperimentMeasureKey, ExperimentPlannedChange } from './types'

/** 90 dagar — samma resonemang som project_debrief (lib/debrief/
 *  create-debrief-card.ts): ett strategiskt beslut, inget tidskänsligt
 *  "just nu"-fönster, och kortet har livstids-dedup (se
 *  hasExistingReadoutCard) så det aldrig återskapas om det går ut. */
const READOUT_CARD_EXPIRES_DAYS = 90

export interface ActiveExperimentRow {
  id: string
  business_id: string
  job_type: string
  hypothesis: string
  source_pattern_id: string | null
  enrolled_project_ids: string[]
  measures: ExperimentMeasureKey[]
  min_comparable_projects: number
  guard_rails: { start_date: string; end_date: string; max_projects: number; no_autonomous_customer_send: true }
  planned_change: ExperimentPlannedChange
}

// ─────────────────────────────────────────────────────────────────
// Ren kärna — kortcopy
// ─────────────────────────────────────────────────────────────────

/**
 * Brödtexten — bara räknade fakta ur en redan beräknad ExperimentMeasurement.
 * Ingen I/O. sena_andringar-raden är illustrativ (den primära kontrollpunkts-
 * kopplingen för V1:s enda planned_change-typ) och skrivs bara när måttet
 * faktiskt ingår i försöket.
 */
export function buildReadoutBody(m: ExperimentMeasurement): string {
  const delar: string[] = [`Kontrollen användes på ${m.projects_enrolled} projekt.`]

  const sena = m.measures.find(x => x.measure === 'sena_andringar')
  if (sena) {
    const utanSenaAndringar = sena.values.filter(v => v.value === 0).length
    delar.push(`${utanSenaAndringar} hade inga sena ändringar.`)
  }

  const utanUnderlag = Math.max(0, m.projects_enrolled - m.projects_with_sufficient_data)
  delar.push(`${utanUnderlag} saknar tillräckligt underlag.`)

  return delar.join(' ')
}

/**
 * Rubrik + brödtext för redovisningskortet. Vid 'for_tidigt' säger texten
 * ORDAGRANT att det är för tidigt och erbjuder fortsättning — aldrig en
 * gissning om riktningen.
 */
export function buildReadoutCardCopy(jobType: string, m: ExperimentMeasurement): { title: string; description: string } {
  const title = `Försöket är klart att redovisas: ${jobType}`

  if (m.verdict === 'for_tidigt') {
    return {
      title,
      description: `För tidigt att säga något om utfallet ännu — för få projekt har tillräckligt underlag. ${buildReadoutBody(m)} Vill du fortsätta testa på fler projekt?`,
    }
  }

  return { title, description: buildReadoutBody(m) }
}

// ─────────────────────────────────────────────────────────────────
// I/O — svepet
// ─────────────────────────────────────────────────────────────────

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

/** Livstids-dedup, inget statusfilter — samma idiom som hasExistingKickoffCard. */
async function hasExistingReadoutCard(supabase: SupabaseClient, businessId: string, experimentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('business_id', businessId)
    .eq('approval_type', 'operating_experiment_readout')
    .contains('payload', { experiment_id: experimentId })
    .limit(1)

  if (error) {
    console.error('[experiment/report] dedup-läsning misslyckades (fail-safe, hoppar):', error.message)
    return true
  }
  return !!data && data.length > 0
}

/** DEN ENDA skrivvägen till frozen_summary — se filhuvudet. */
async function concludeExperiment(
  supabase: SupabaseClient,
  businessId: string,
  experimentId: string,
  measurement: ExperimentMeasurement,
  now: Date,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('operating_experiment')
      .update({
        status: 'concluded',
        concluded_at: now.toISOString(),
        frozen_summary: measurement as unknown as Record<string, unknown>,
      })
      .eq('id', experimentId)
      .eq('business_id', businessId)
      .eq('status', 'active')

    if (error) {
      console.error('[experiment/report] kunde inte avsluta försöket:', error.message)
      if (!arSchemaSaknas(error)) {
        await rapporteraTystFel(supabase, businessId, 'experiment/report:conclude', error.message, { experimentId })
      }
    }
  } catch (err) {
    console.error('[experiment/report] oväntat fel vid avslut (fail-safe):', err)
  }
}

export type ReadoutResult = 'created' | 'skipped_not_ready' | 'skipped_already_exists' | 'skipped_error'

/**
 * Ett enskilt aktivt experiment: mäter, avgör om det är redovisningsbart,
 * skapar (högst) ett redovisningskort och avslutar försöket. Kastar ALDRIG.
 */
export async function maybeCreateReadout(
  supabase: SupabaseClient,
  businessId: string,
  experiment: ActiveExperimentRow,
  now: Date = new Date(),
): Promise<ReadoutResult> {
  try {
    const enrolled = Array.isArray(experiment.enrolled_project_ids) ? experiment.enrolled_project_ids : []

    const measurable: MeasurableExperiment = {
      id: experiment.id,
      business_id: businessId,
      enrolled_project_ids: enrolled,
      measures: experiment.measures,
      min_comparable_projects: experiment.min_comparable_projects,
      planned_change_type: experiment.planned_change?.type,
      source_pattern_id: experiment.source_pattern_id,
    }
    const measurement = await measureExperiment(supabase, measurable)

    const endDate = experiment.guard_rails?.end_date
    const endReached = typeof endDate === 'string' && now.getTime() >= Date.parse(`${endDate}T23:59:59.999Z`)
    const allFrozen = enrolled.length > 0 && measurement.projects_completed === enrolled.length

    if (!endReached && !allFrozen) return 'skipped_not_ready'

    if (await hasExistingReadoutCard(supabase, businessId, experiment.id)) {
      // Ett tidigare svep hann skapa kortet men inte hinna avsluta raden
      // (t.ex. serverfel mellan de två skrivningarna) — inget nytt kort,
      // men försök avsluta raden nu om den fortfarande står som aktiv.
      await concludeExperiment(supabase, businessId, experiment.id, measurement, now)
      return 'skipped_already_exists'
    }

    const { title, description } = buildReadoutCardCopy(experiment.job_type, measurement)
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: businessId,
      status: 'pending',
      expires_at: new Date(Date.now() + READOUT_CARD_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      approval_type: 'operating_experiment_readout',
      // Samma bucket som operating_experiment_proposal/playbook_pattern_
      // confirmation — ett strategiskt beslut som formar hela jobbtypen.
      routing_role: 'owner_admin',
      title,
      description,
      risk_level: 'low',
      payload: {
        experiment_id: experiment.id,
        job_type: experiment.job_type,
        hypothesis: experiment.hypothesis,
        source_pattern_id: experiment.source_pattern_id,
        verdict: measurement.verdict,
        measurement,
        target_route: `/dashboard/experiments/${approvalId}`,
        agent_id: 'lars',
      },
    })

    if (insertErr) {
      console.error('[experiment/report] kunde inte skapa redovisningskortet:', insertErr.message)
      if (!arSchemaSaknas(insertErr)) {
        await rapporteraTystFel(supabase, businessId, 'experiment/report:insert', insertErr.message, { experimentId: experiment.id })
      }
      return 'skipped_error'
    }

    await concludeExperiment(supabase, businessId, experiment.id, measurement, now)
    return 'created'
  } catch (err) {
    console.error('[experiment/report] oväntat fel (fail-safe):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase, businessId, 'experiment/report:unexpected',
        err instanceof Error ? err.message : String(err), { experimentId: experiment.id },
      )
    }
    return 'skipped_error'
  }
}

export interface SweepSummary {
  considered: number
  created: number
}

/**
 * Alla AKTIVA experiment för ett företag. Fail-safe mot 42P01 (v157 ej körd)
 * — degraderar tyst till { considered: 0, created: 0 }, kastar aldrig.
 */
export async function sweepExperimentReadouts(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<SweepSummary> {
  try {
    const { data, error } = await supabase
      .from('operating_experiment')
      .select('id, business_id, job_type, hypothesis, source_pattern_id, enrolled_project_ids, measures, min_comparable_projects, guard_rails, planned_change')
      .eq('business_id', businessId)
      .eq('status', 'active')

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[experiment/report] listning av aktiva försök misslyckades (fail-safe):', error.message)
      }
      return { considered: 0, created: 0 }
    }

    const rows = asRows<Record<string, unknown>>(data)
    let created = 0
    for (const row of rows) {
      try {
        const experiment: ActiveExperimentRow = {
          id: row.id as string,
          business_id: row.business_id as string,
          job_type: row.job_type as string,
          hypothesis: row.hypothesis as string,
          source_pattern_id: (row.source_pattern_id as string | null) ?? null,
          enrolled_project_ids: Array.isArray(row.enrolled_project_ids) ? (row.enrolled_project_ids as string[]) : [],
          measures: Array.isArray(row.measures) ? (row.measures as ExperimentMeasureKey[]) : [],
          min_comparable_projects: Number(row.min_comparable_projects) || 0,
          guard_rails: row.guard_rails as ActiveExperimentRow['guard_rails'],
          planned_change: row.planned_change as ExperimentPlannedChange,
        }
        const result = await maybeCreateReadout(supabase, businessId, experiment, now)
        if (result === 'created') created++
      } catch (err) {
        // Ett experiments fel får inte fälla svepet för alla andra.
        console.error('[experiment/report] hantering av ett enskilt försök misslyckades (fail-safe, hoppar):', err)
      }
    }
    return { considered: rows.length, created }
  } catch (err) {
    console.error('[experiment/report] oväntat fel (fail-safe):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase, businessId, 'experiment/report:sweep-unexpected',
        err instanceof Error ? err.message : String(err),
      )
    }
    return { considered: 0, created: 0 }
  }
}
