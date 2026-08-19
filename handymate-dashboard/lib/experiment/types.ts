/**
 * OperatingExperiment — typer, Etapp 1 (Adaptive Business Twin, Lars-
 * piloten, docs/council/ACTIVE_ROADMAP.md "Läge 2026-08-19"). Ren typ-fil,
 * INGEN I/O, INGEN node-specifik import — samma isolationsskäl som
 * lib/mandates/types.ts filhuvud förklarar: den ska kunna importeras var
 * som helst utan att dra in något runtime-beroende.
 *
 * ═══ FYRA SANNINGSNIVÅER, ALDRIG BLANDADE ═══
 *
 * Ett påstående det här programmet någonsin gör bär EN av fyra nivåer,
 * synligt, aldrig underförstått:
 *
 *   observation       — en enskild registrerad datapunkt (t.ex. en
 *                        project_outcome-rad). Sann för EN instans.
 *   hypotes           — flera observationer pekar åt samma håll men är
 *                        obekräftade (en oconfirmed business_knowledge-
 *                        kandidat innan ägaren godkänt den).
 *   avgransat_forsok   — en medvetet skopad, tidsbegränsad variation med
 *                        ett förutbestämt mätvillkor (en operating_
 *                        experiment-rad). Gäller BARA det avgränsade
 *                        försöket tills det utvärderats.
 *   bekraftad_regel    — ägaren har uttryckligen godkänt att mönstret ska
 *                        forma framtida beslut generellt.
 *
 * Ett påstående får aldrig hoppa nivå utan den nivåns beviskrav.
 *
 * ═══ KAUSALITETSBANET ═══
 *
 * Den här filen och resten av lib/experiment/ räknar och korrelerar, men
 * uttrycker aldrig att en observerad skillnad förklarar eller framkallar
 * en annan. Se testfilen (tests/operating-experiment.spec.ts) för den
 * exakta ordlistan källskanningen låser — den listas medvetet INTE här,
 * av samma skäl som checkpoint-outcomes.ts filhuvud ger: annars fastnar
 * beskrivningen i sin egen fälla.
 *
 * ═══ EN SLUTEN MÅTTUPPSÄTTNING ═══
 *
 * ExperimentMeasureKey är en sluten union — ett mått utanför den listan är
 * ett typfel, inte en körtidsavvikelse. Varje nyckel härleds ärligt ur
 * kolumner som redan finns (se lib/experiment/measure.ts filhuvud för
 * käll-motiveringen per mått, inklusive de två som medvetet prövades och
 * behölls efter en ärlighetsbedömning: forseningar och materialavvikelser).
 */

// ─────────────────────────────────────────────────────────────────
// Sanningsnivåer
// ─────────────────────────────────────────────────────────────────

export type ExperimentTruthLevel =
  | 'observation'
  | 'hypotes'
  | 'avgransat_forsok'
  | 'bekraftad_regel'

export const EXPERIMENT_TRUTH_LEVELS: readonly ExperimentTruthLevel[] = [
  'observation',
  'hypotes',
  'avgransat_forsok',
  'bekraftad_regel',
] as const

export function isExperimentTruthLevel(v: unknown): v is ExperimentTruthLevel {
  return typeof v === 'string' && (EXPERIMENT_TRUTH_LEVELS as readonly string[]).includes(v)
}

// ─────────────────────────────────────────────────────────────────
// Den slutna måttuppsättningen — se lib/experiment/measure.ts för
// härledningskälla per nyckel.
// ─────────────────────────────────────────────────────────────────

export type ExperimentMeasureKey =
  | 'sena_andringar'
  | 'marginal'
  | 'extra_timmar'
  | 'faktureringstid'
  | 'forseningar'
  | 'materialavvikelser'

export const EXPERIMENT_MEASURE_KEYS: readonly ExperimentMeasureKey[] = [
  'sena_andringar',
  'marginal',
  'extra_timmar',
  'faktureringstid',
  'forseningar',
  'materialavvikelser',
] as const

export function isExperimentMeasureKey(v: unknown): v is ExperimentMeasureKey {
  return typeof v === 'string' && (EXPERIMENT_MEASURE_KEYS as readonly string[]).includes(v)
}

// ─────────────────────────────────────────────────────────────────
// Namngivna konstanter — förhandsgissning 2026-08-19, kalibreras mot
// verkliga utfall före första presenterade slutsats. Andreas justerar vid
// granskning, samma disciplin som MATURITY_MIN_EXECUTED m.fl. i
// lib/mandates/type-maturity.ts.
// ─────────────────────────────────────────────────────────────────

/** Under det här antalet jämförbara projekt är underlaget för tunt för
    att säga något alls — se deriveExperimentVerdict i measure.ts. */
export const EXPERIMENT_MIN_COMPARABLE_DEFAULT = 3

/** Max antal projekt ett enskilt avgränsat försök får omfatta samtidigt —
    mirrorad i sql/v157_operating_experiment.sql:s CHECK-constraints
    (experiment_guard_rails_max_projects_check,
    experiment_enrolled_within_cap). Ändras båda ställena tillsammans. */
export const EXPERIMENT_MAX_PROJECTS_CAP = 5

// ─────────────────────────────────────────────────────────────────
// planned_change — typad, INTE fritext. V1 har exakt EN variant
// (kickoff-checkpoints, den beslutade första Lars-piloten). Ny variant
// kräver en ny migration som vidgar experiment_planned_change_typed-
// CHECK:en i sql/v157, samma "vägen till fullständighet"-disciplin som
// MANDATE_ALLOWED_TYPES.
// ─────────────────────────────────────────────────────────────────

export interface KickoffCheckpointPlannedChange {
  type: 'kickoff_checkpoint'
  /** Kontrollpunktens text, kopierad från den bekräftade playbook-
      kandidaten (lib/playbook/kickoff-candidates.ts) vid experimentets
      skapande — aldrig LLM-levererad vid läsning. */
  checkpoint_text: string
}

export type ExperimentPlannedChange = KickoffCheckpointPlannedChange

// ─────────────────────────────────────────────────────────────────
// guard_rails — no_autonomous_customer_send är ALLTID true i V1 (CHECK:as
// i sql/v157). Inget steg i den här motorn får någonsin nå en kund utan
// ett vanligt godkännandekort.
// ─────────────────────────────────────────────────────────────────

export interface ExperimentGuardRails {
  /** Mirrorar EXPERIMENT_MAX_PROJECTS_CAP vid skapandet — inte
      nödvändigtvis identisk med den globala takten om taket sänks senare
      för ett specifikt försök, men aldrig högre. */
  max_projects: number
  /** DATE, 'YYYY-MM-DD'. */
  start_date: string
  /** DATE, 'YYYY-MM-DD'. */
  end_date: string
  no_autonomous_customer_send: true
}

// ─────────────────────────────────────────────────────────────────
// Status/ägarbeslut
// ─────────────────────────────────────────────────────────────────

export type ExperimentStatus = 'proposed' | 'declined' | 'active' | 'concluded'

export const EXPERIMENT_STATUSES: readonly ExperimentStatus[] = [
  'proposed',
  'declined',
  'active',
  'concluded',
] as const

export type ExperimentOwnerDecision = 'continue_testing' | 'rejected' | 'made_standard'

export const EXPERIMENT_OWNER_DECISIONS: readonly ExperimentOwnerDecision[] = [
  'continue_testing',
  'rejected',
  'made_standard',
] as const

// ─────────────────────────────────────────────────────────────────
// Rad-typen — mirrorar sql/v157_operating_experiment.sql kolumn för
// kolumn.
// ─────────────────────────────────────────────────────────────────

export interface OperatingExperimentRow {
  id: string
  business_id: string
  hypothesis: string
  /** Ansvarig specialist — 'lars' i den beslutade första piloten. */
  agent_key: string
  job_type: string
  /** business_knowledge.id (UUID, lagrad som text). Null om experimentet
      inte föddes ur ett bekräftat mönster. */
  source_pattern_id: string | null
  source_project_ids: string[]
  planned_change: ExperimentPlannedChange
  guard_rails: ExperimentGuardRails
  measures: ExperimentMeasureKey[]
  min_comparable_projects: number
  enrolled_project_ids: string[]
  status: ExperimentStatus
  owner_decision: ExperimentOwnerDecision | null
  decided_at: string | null
  resulting_rule_id: string | null
  created_at: string
  confirmed_at: string | null
  concluded_at: string | null
  /** Skrivs EN gång vid concluded — räknade fakta, aldrig en slutsats.
      Ingen skrivväg finns i Etapp 1; typen är formad i förväg så Etapp 2
      inte behöver ändra kontraktet, bara börja skriva till det. */
  frozen_summary: Record<string, unknown> | null
}
