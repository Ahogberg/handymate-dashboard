/**
 * Playbook Kickoff Copilot V1 (tasks/todo.md "Playbook Kickoff Copilot V1
 * — 2026-08-17 (04:00)") — kortflöde.
 *
 * Per kandidat (lib/playbook/kickoff-candidates.ts): bygger Lars-röstad
 * kortcopy och skapar ETT kort i pending_approvals
 * (approval_type='playbook_kickoff_suggestion'). Godkännande skriver EN
 * project_checklist-rad — se app/api/approvals/[id]/route.ts,
 * case 'playbook_kickoff_suggestion'.
 *
 * Fail-safe: kastar aldrig. Ett förlorat kickoff-förslag får aldrig fälla
 * cron-svepet som anropar denna funktion för flera kandidater i rad —
 * samma princip som lib/playbook/propose-pattern.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import type { KickoffCandidate } from './kickoff-candidates'

/** 14 dagar — samma resonemang som PATTERN_CARD_EXPIRES_DAYS
 *  (lib/playbook/propose-pattern.ts): inget tidskänsligt "just nu"-
 *  ögonblick, projektteamet kan behöva fundera på det vid nästa
 *  lugna stund. */
const KICKOFF_CARD_EXPIRES_DAYS = 14

/**
 * Under den här tröskeln hedgear kortcopyn explicit. Mönstret är redan
 * ägarbekräftat (business_knowledge.status='active') — confidence här är
 * AI-detektionens ursprungliga säkerhet vid FÖRSLAGSTILLFÄLLET, inte ett
 * omdöme om ägarens bekräftelse. Samma konvention som Settings-ytans
 * PlaybookPatternsSection (25449012): den RÅA siffran visas aldrig för
 * användaren, bara en kvalitativ signal.
 */
const LOW_CONFIDENCE_THRESHOLD = 0.6

/**
 * Svensk kortcopy, Lars terse ton (samma register som closeout-copilot.ts:s
 * evidence-strängar och buildCardCopy i propose-pattern.ts) — citerar
 * belägget rakt av, hittar aldrig på ett källprojekt-namn.
 */
export function buildKickoffCardCopy(
  jobType: string,
  patternText: string,
  sourceProjectNames: string[],
  confidence: number | null,
): { title: string; description: string } {
  const kalla = sourceProjectNames.length > 0
    ? sourceProjectNames.join(', ')
    : 'tidigare liknande jobb'

  const hedge = confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD
    ? ' Mönstret är inte helt säkert fastställt — värt en snabb koll innan ni räknar med det.'
    : ''

  return {
    title: `Kontrollpunkt föreslagen: ${jobType}`,
    description: `Baserat på ${kalla}: "${patternText}".${hedge}`,
  }
}

export type ProposeKickoffResult = 'created' | 'skipped_error'

export async function proposeKickoff(
  supabase: SupabaseClient,
  businessId: string,
  candidate: KickoffCandidate,
): Promise<ProposeKickoffResult> {
  try {
    const { title, description } = buildKickoffCardCopy(
      candidate.job_type,
      candidate.pattern_text,
      candidate.source_project_names,
      candidate.confidence,
    )

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      business_id: businessId,
      status: 'pending',
      expires_at: new Date(Date.now() + KICKOFF_CARD_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      approval_type: 'playbook_kickoff_suggestion',
      // Samma bucket som checklist_forslag — projektteamet, inte hela
      // företaget, äger den här typen av beslut (tasks/todo.md).
      routing_role: 'project_team',
      title,
      description,
      risk_level: 'low',
      payload: {
        project_id: candidate.project_id,
        job_type: candidate.job_type,
        pattern_id: candidate.pattern_id,
        pattern_text: candidate.pattern_text,
        source_project_names: candidate.source_project_names,
        confidence: candidate.confidence,
        // Lars äger projekt/kvalitet (samma val som egenkontroll_foto/
        // checklist_forslag).
        agent_id: 'lars',
      },
    })

    if (insertErr) {
      console.error('[playbook/propose-kickoff] kunde inte skapa kortet:', insertErr.message)
      await rapporteraTystFel(supabase, businessId, 'playbook/propose-kickoff:insert', insertErr.message, {
        projectId: candidate.project_id,
      })
      return 'skipped_error'
    }
    return 'created'
  } catch (err) {
    console.error('[playbook/propose-kickoff] oväntat fel (fail-safe):', err)
    await rapporteraTystFel(
      supabase, businessId, 'playbook/propose-kickoff:unexpected',
      err instanceof Error ? err.message : String(err), { projectId: candidate.project_id },
    )
    return 'skipped_error'
  }
}
