/**
 * OperatingExperiment — förslagslagret, Etapp 2 (Adaptive Business Twin,
 * Lars-piloten, docs/council/ACTIVE_ROADMAP.md "Läge 2026-08-19").
 *
 * ═══ VAR FÖRSLAGET FÖDS ═══
 *
 * Minsta ärliga ingrepp: proposeExperiment anropas direkt i SAMMA flöde som
 * mönsterbekräftelsen (app/api/approvals/[id]/route.ts, case
 * 'playbook_pattern_confirmation') — omedelbart EFTER den lyckade
 * business_knowledge-inserten, fire-and-forget (awaited men fail-soft internt,
 * kan aldrig fälla mönsterbekräftelsens svar). Alternativet — att lägga
 * förslaget i playbook-kickoff-cronen — hade krävt att invänta nästa veckas
 * svepning INNAN ett försök ens kunde föreslås, en extra vecka utan skäl:
 * hypotesen (mönstrets text) och job_type finns redan i sin helhet vid
 * bekräftelsetillfället, inget nytt underlag tillkommer av att vänta.
 *
 * ═══ HYPOTESEN ÄR ORDAGRANN ═══
 *
 * hypothesis kopieras rakt av från det bekräftade mönstrets text (pattern_
 * text/observation) — proposeExperiment omformulerar ALDRIG. Samma disciplin
 * som KickoffCheckpointPlannedChange.checkpoint_text (lib/experiment/types.ts).
 *
 * ═══ DEDUPE — LIVSTID, INGET STATUSFILTER ═══
 *
 * Max ETT experiment per source_pattern_id, oavsett status — samma idiom som
 * hasExistingKickoffCard (lib/playbook/kickoff-candidates.ts) och
 * wasRecentlyRejected (lib/playbook/propose-pattern.ts), men UTAN en
 * tidsbegränsad karens: ett mönster som redan haft ett försök (godkänt,
 * avvisat, eller bara föreslaget och obesvarat) ska inte kunna få ett andra
 * automatiskt förslag. Kollas mot BÅDA källorna som kan bära spåret:
 *   a) pending_approvals (approval_type='operating_experiment_proposal',
 *      payload.source_pattern_id) — täcker förslag som aldrig hann bli en
 *      riktig rad (avvisade eller obesvarade).
 *   b) operating_experiment (source_pattern_id) — täcker bekräftade försök.
 *      42P01 här (v157 ej körd) är INTE en blockerande signal: en tabell som
 *      inte finns kan strukturellt inte bära en rad, så det tolkas som "inga
 *      träffar" snarare än husets vanliga "fail-safe = blockera"-konvention
 *      (som gäller för RIKTIGA läsfel/andra schemaluckor).
 *
 * opts.allowDuplicate=true (används av app/api/approvals/[id]/route.ts, case
 * 'operating_experiment_readout', continue_testing-grenen) kringgår
 * dedupe-spärren MEDVETET: ägaren har just, explicit, bett om en fortsättning
 * av SAMMA mönster — det är inte en duplicerad automatisk gissning.
 *
 * Fail-safe genomgående: kastar aldrig. Ett förlorat experimentförslag får
 * aldrig fälla mönsterbekräftelsen som ropar in den.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
import {
  EXPERIMENT_MAX_PROJECTS_CAP,
  EXPERIMENT_MIN_COMPARABLE_DEFAULT,
  EXPERIMENT_DEFAULT_MEASURES,
  type ExperimentMeasureKey,
  type ExperimentGuardRails,
  type KickoffCheckpointPlannedChange,
} from './types'

/** Försökets löptid — 60 dagar, se uppdragsspecen. */
const EXPERIMENT_DURATION_DAYS = 60

export interface ProposeExperimentInput {
  jobType: string
  /** Mönstrets text, ORDAGRANT — aldrig omformulerad. */
  hypothesis: string
  sourcePatternId: string | null
  /** Utelämnas → EXPERIMENT_DEFAULT_MEASURES. */
  measures?: ExperimentMeasureKey[]
  agentId?: string
}

export type ProposeExperimentResult = 'created' | 'skipped_already_proposed' | 'skipped_invalid_input' | 'skipped_error'

/** Dedupe-gren a) — se filhuvudet. Livstid, inget statusfilter. */
async function hasPendingOrPastProposal(
  supabase: SupabaseClient,
  businessId: string,
  sourcePatternId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('business_id', businessId)
    .eq('approval_type', 'operating_experiment_proposal')
    .contains('payload', { source_pattern_id: sourcePatternId })
    .limit(1)

  if (error) {
    console.error('[experiment/propose] dedupe a)-läsning misslyckades (fail-safe, hoppar):', error.message)
    return true
  }
  return !!data && data.length > 0
}

/** Dedupe-gren b) — se filhuvudet. Schema saknas (v157 ej körd) tolkas som
 *  "inga träffar" (strukturellt sant), andra fel som "finns" (fail-safe). */
async function hasExistingExperimentRow(
  supabase: SupabaseClient,
  businessId: string,
  sourcePatternId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('operating_experiment')
    .select('id')
    .eq('business_id', businessId)
    .eq('source_pattern_id', sourcePatternId)
    .limit(1)

  if (error) {
    if (arSchemaSaknas(error)) return false
    console.error('[experiment/propose] dedupe b)-läsning misslyckades (fail-safe, hoppar):', error.message)
    return true
  }
  return !!data && data.length > 0
}

/** Svensk kortcopy — citerar hypotesen ordagrant, hittar aldrig på ett tal
 *  eller en riktning. */
function buildProposalCardCopy(jobType: string, hypothesis: string, maxProjects: number, endDate: string): { title: string; description: string } {
  return {
    title: `Försök föreslaget: ${jobType}`,
    description: `"${hypothesis}" — testa på upp till ${maxProjects} nya projekt av jobbtypen, fram till ${endDate}. Kunden märker ingenting utan ditt godkännande.`,
  }
}

export async function proposeExperiment(
  supabase: SupabaseClient,
  businessId: string,
  input: ProposeExperimentInput,
  opts: { allowDuplicate?: boolean } = {},
): Promise<ProposeExperimentResult> {
  try {
    if (!input.jobType || !input.hypothesis) return 'skipped_invalid_input'

    if (!opts.allowDuplicate && input.sourcePatternId) {
      if (await hasPendingOrPastProposal(supabase, businessId, input.sourcePatternId)) {
        return 'skipped_already_proposed'
      }
      if (await hasExistingExperimentRow(supabase, businessId, input.sourcePatternId)) {
        return 'skipped_already_proposed'
      }
    }

    const measures = input.measures && input.measures.length > 0 ? input.measures : [...EXPERIMENT_DEFAULT_MEASURES]
    const startDate = svDateStr()
    const endDate = svDateStrPlusDays(EXPERIMENT_DURATION_DAYS)

    const guardRails: ExperimentGuardRails = {
      max_projects: EXPERIMENT_MAX_PROJECTS_CAP,
      start_date: startDate,
      end_date: endDate,
      no_autonomous_customer_send: true,
    }
    const plannedChange: KickoffCheckpointPlannedChange = {
      type: 'kickoff_checkpoint',
      checkpoint_text: input.hypothesis,
    }

    const { title, description } = buildProposalCardCopy(input.jobType, input.hypothesis, guardRails.max_projects, endDate)

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      business_id: businessId,
      status: 'pending',
      // 60 dagar, samma som försökets egen löptid — ett förslag som aldrig
      // besvaras hinner gå ut ungefär när försöket ändå skulle avslutats,
      // inget tidskänsligt "just nu"-fönster (samma resonemang som
      // PATTERN_CARD_EXPIRES_DAYS, fast längre eftersom detta är ett större
      // beslut).
      expires_at: new Date(Date.now() + EXPERIMENT_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      approval_type: 'operating_experiment_proposal',
      // Samma bucket som playbook_pattern_confirmation — ett försök formar
      // (om det bekräftas) hur kontrollpunkter hanteras för HELA jobbtypen.
      routing_role: 'owner_admin',
      title,
      description,
      risk_level: 'low',
      payload: {
        hypothesis: input.hypothesis,
        job_type: input.jobType,
        source_pattern_id: input.sourcePatternId,
        guard_rails: guardRails,
        measures,
        min_comparable_projects: EXPERIMENT_MIN_COMPARABLE_DEFAULT,
        planned_change: plannedChange,
        agent_id: input.agentId || 'lars',
      },
    })

    if (insertErr) {
      console.error('[experiment/propose] kunde inte skapa förslagskortet:', insertErr.message)
      if (!arSchemaSaknas(insertErr)) {
        await rapporteraTystFel(supabase, businessId, 'experiment/propose:insert', insertErr.message, {
          jobType: input.jobType,
          sourcePatternId: input.sourcePatternId,
        })
      }
      return 'skipped_error'
    }
    return 'created'
  } catch (err) {
    console.error('[experiment/propose] oväntat fel (fail-safe):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase, businessId, 'experiment/propose:unexpected',
        err instanceof Error ? err.message : String(err), { jobType: input.jobType },
      )
    }
    return 'skipped_error'
  }
}
