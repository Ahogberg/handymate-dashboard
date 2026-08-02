/**
 * Egenkontroll-agenten — Etapp 1b (v-plan tasks/easoft-gap-plan.md).
 *
 * Kopplar fotobedömningens rena kärna (lib/egenkontroll/photo-assessment.ts,
 * etapp 1a) till uppladdningsflödet och godkännande-kön. Anropas
 * fire-and-forget från app/api/projects/[id]/documents/route.ts efter att
 * uppladdningssvaret redan skickats — analysen får ALDRIG blockera eller
 * sinka en uppladdning.
 *
 * Flöde:
 *   1. Hämta projektets aktiva checklistor (status='in_progress').
 *      Ingen aktiv checklista → return tyst (inget att bedöma mot).
 *   2. Cost-guard-koll (bakgrund, samma helper som agent-observation-cronen)
 *      → vid tak: return tyst med console.log, uppladdningen påverkas aldrig
 *      (guarden har redan svarat vid det laget).
 *   3. Kör assessPhotoAgainstChecklist per aktiv checklista, logga
 *      agent_runs.
 *   4. Tolka bedömningen (buildQueueActionsFromAssessment — ren, testbar
 *      funktion) och skapa pending_approvals-kort enligt mönstret i
 *      lib/autopilot/quote-nudge.ts (samma dedup-stil, samma insert-form).
 *
 * JURIDIK/AUTONOMI: skapar ALDRIG en checked-flagga direkt — bara ett
 * förslag i kön. Hantverkaren godkänner alltid (se lib/approve-actions.ts
 * ELLER app/api/approvals/[id]/route.ts executeApprovalPayload-caset för
 * mutationen).
 *
 * PUSH: dessa två approval_types är INTE high-risk (inga pengar, inget
 * externt utskick) — CLAUDE.md:s push-regel gäller high-risk-kort, så
 * ingen sendApprovalPush-anrop här (jmf. lib/autopilot/quote-nudge.ts som
 * skickar SMS-underlag och därför push:ar).
 *
 * FAIL-SAFE (kritiskt, samma löfte som photo-assessment.ts):
 * analyzeProjectPhoto() kastar ALDRIG mot anroparen — hela kroppen ligger
 * i ett try/catch som bara console.error:ar. Uppladdningsflödet som
 * anropar detta fire-and-forget (.catch) ska aldrig se ett ohanterat fel.
 */

import { getServerSupabase } from '@/lib/supabase'
import { checkCostGuards, type CostGuardBusiness } from '@/lib/agents/shared/cost-guard'
import {
  assessPhotoAgainstChecklist,
  type ChecklistPunkt,
  type ImageSource,
  type PunktBedömning,
} from '@/lib/egenkontroll/photo-assessment'
import type { ChecklistItem } from '@/lib/checklist-defaults'

// ─────────────────────────────────────────────────────────────────
// Typer
// ─────────────────────────────────────────────────────────────────

export interface AnalyzeProjectPhotoInput {
  businessId: string
  projectId: string
  /** Unik referens till fotot — project_document.id är den naturliga
      nyckeln från uppladdningsflödet, används i payload + dedup. */
  photoRef: string
  imageSource: ImageSource
  uploadedBy?: string | null
}

export interface QueueForslagPunkt {
  punkt_id: string
  text: string
  motivering: string
}

export interface QueueAvvikelse {
  punkt_id: string
  punkttext: string
  motivering: string
}

export interface QueueActions {
  forslag: QueueForslagPunkt[]
  avvikelser: QueueAvvikelse[]
}

/** Delmängd av ChecklistItem som resultattolkningen faktiskt behöver. */
export type ChecklistItemForQueue = Pick<ChecklistItem, 'id' | 'text' | 'checked'>

// ─────────────────────────────────────────────────────────────────
// buildQueueActionsFromAssessment — ren, facit-testbar resultattolkning
// ─────────────────────────────────────────────────────────────────

/**
 * Tolkar en fotobedömning mot checklistans nuvarande state och avgör
 * vilka kö-kort som ska skapas. Ren funktion — ingen I/O, inget Supabase.
 *
 * Regler (planens ord):
 *  - 'stods' + konfidens 'hog' + punkten INTE redan checked → förslag
 *    (samlas i ETT kort av anroparen).
 *  - 'stods' med lägre konfidens → ingenting (för osäkert för att föreslå).
 *  - punkten redan checked → ingenting, oavsett status (inget att föreslå).
 *  - 'motsags' → eget avvikelse-kort, oavsett konfidens (en flagga om att
 *    något ser fel ut ska aldrig tystas av låg konfidens — hantverkaren
 *    avgör själv om den stämmer).
 *  - 'ej_synlig' / 'ej_bedombar' → ingenting.
 *  - punktId i bedömningen som inte finns i den aktuella checklistan
 *    (borttagen/ändrad sedan bedömningen kördes) → ignoreras tyst.
 */
export function buildQueueActionsFromAssessment(
  bedomningar: PunktBedömning[],
  items: ChecklistItemForQueue[],
): QueueActions {
  const itemsById = new Map(items.map(it => [it.id, it]))
  const forslag: QueueForslagPunkt[] = []
  const avvikelser: QueueAvvikelse[] = []

  for (const b of bedomningar) {
    const item = itemsById.get(b.punktId)
    if (!item) continue // okänd/borttagen punkt — ignoreras

    if (b.status === 'stods') {
      if (b.konfidens === 'hog' && !item.checked) {
        forslag.push({ punkt_id: b.punktId, text: item.text, motivering: b.motivering })
      }
      continue
    }

    if (b.status === 'motsags') {
      avvikelser.push({ punkt_id: b.punktId, punkttext: item.text, motivering: b.motivering })
      continue
    }

    // 'ej_synlig' / 'ej_bedombar' → ingenting.
  }

  return { forslag, avvikelser }
}

// ─────────────────────────────────────────────────────────────────
// Dedup-nyckel — ren funktion, facit-testbar
// ─────────────────────────────────────────────────────────────────

/**
 * Bygger payload-matchen som skickas till `.contains('payload', ...)` för
 * dedup-kollen. 'egenkontroll_foto' är ETT samlat kort per checklista+foto
 * → dedup på {checklist_id, photo_ref}. 'egenkontroll_avvikelse' är ETT
 * kort PER motsägande punkt → dedup måste även innehålla punkt_id, annars
 * skulle en andra avvikande punkt på samma foto tystas av den första
 * punktens redan-skapade kort (planens dedup-beskrivning nämner bara
 * checklist_id+photo_ref, men det gäller "samma typ" — för avvikelse-typen
 * är punkt_id en del av vad som gör kortet unikt, se payload-formen).
 */
export function buildDedupMatch(
  approvalType: 'egenkontroll_foto' | 'egenkontroll_avvikelse',
  checklistId: string,
  photoRef: string,
  punktId?: string,
): Record<string, unknown> {
  const match: Record<string, unknown> = { checklist_id: checklistId, photo_ref: photoRef }
  if (approvalType === 'egenkontroll_avvikelse' && punktId) {
    match.punkt_id = punktId
  }
  return match
}

// ─────────────────────────────────────────────────────────────────
// analyzeProjectPhoto — orkestrering (fail-safe, kastar ALDRIG)
// ─────────────────────────────────────────────────────────────────

export async function analyzeProjectPhoto(input: AnalyzeProjectPhotoInput): Promise<void> {
  try {
    const { businessId, projectId, photoRef, imageSource, uploadedBy } = input
    const supabase = getServerSupabase()

    // ── 1. Aktiva checklistor ────────────────────────────────────
    const { data: checklists, error: clErr } = await supabase
      .from('project_checklist')
      .select('id, items')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .eq('status', 'in_progress')

    if (clErr) {
      console.error('[egenkontroll/analyze-and-queue] kunde inte hämta checklistor:', clErr)
      return
    }
    if (!checklists || checklists.length === 0) return // ingen aktiv checklista — inget att bedöma mot

    // ── 2. Cost-guard (bakgrund) ─────────────────────────────────
    const { data: bizRow, error: bizErr } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused, agent_cost_cap_usd_daily, subscription_plan')
      .eq('business_id', businessId)
      .maybeSingle()

    if (bizErr || !bizRow) {
      console.error('[egenkontroll/analyze-and-queue] kunde inte hämta business_config:', bizErr)
      return
    }

    const skip = await checkCostGuards(supabase, bizRow as CostGuardBusiness, 'egenkontroll_foto')
    if (skip) {
      console.log('[egenkontroll/analyze-and-queue] hoppar — cost-guard', {
        business_id: businessId,
        project_id: projectId,
        ...skip,
      })
      return
    }

    // ── 3-4. Per aktiv checklista: bedöm, logga, tolka, köa ──────
    for (const checklist of checklists as Array<{ id: string; items: ChecklistItem[] | null }>) {
      const items = checklist.items || []
      if (items.length === 0) continue

      const checklistPunkter: ChecklistPunkt[] = items.map(it => ({
        id: it.id,
        text: it.text,
        required: it.required,
      }))

      const result = await assessPhotoAgainstChecklist({ imageSource, checklistItems: checklistPunkter })

      // Logga agent_runs — samma mönster som logAgentRun i cost-guard.ts,
      // men skriven direkt här eftersom logAgentRun förväntar sig en
      // { debug: { usage, estimated_cost_usd } }-form (callAgentWithThinking-
      // resultat) medan assessPhotoAgainstChecklist returnerar usage/
      // estimated_cost_usd direkt på toppnivå.
      if (result.usage && typeof result.estimated_cost_usd === 'number') {
        try {
          const runId = 'agentrun_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
          await supabase.from('agent_runs').insert({
            run_id: runId,
            business_id: businessId,
            trigger_type: 'egenkontroll_foto',
            tokens_used: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
            estimated_cost: result.estimated_cost_usd,
            status: 'completed',
          })
        } catch (logErr) {
          console.warn('[egenkontroll/analyze-and-queue] agent_runs insert misslyckades:', logErr)
        }
      }

      const { forslag, avvikelser } = buildQueueActionsFromAssessment(result.bedömningar, items)

      // ── Förslag-kort: ETT samlat per checklista+foto ────────────
      if (forslag.length > 0) {
        const dedupMatch = buildDedupMatch('egenkontroll_foto', checklist.id, photoRef)
        const { count } = await supabase
          .from('pending_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('approval_type', 'egenkontroll_foto')
          .eq('status', 'pending')
          .contains('payload', dedupMatch)

        if (!count || count === 0) {
          const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          const punktLista = forslag.map(f => f.text).join(', ')
          await supabase.from('pending_approvals').insert({
            id: approvalId,
            business_id: businessId,
            approval_type: 'egenkontroll_foto',
            title: `Foto styrker ${forslag.length} egenkontrollpunkt${forslag.length === 1 ? '' : 'er'} — markera som klara?`,
            description: `Punkter: ${punktLista}`,
            status: 'pending',
            risk_level: 'low',
            payload: {
              routed_agent: 'lars',
              project_id: projectId,
              checklist_id: checklist.id,
              photo_ref: photoRef,
              forslag,
              uploaded_by: uploadedBy || null,
            },
          })
        }
      }

      // ── Avvikelse-kort: ETT per motsägande punkt ────────────────
      for (const avv of avvikelser) {
        const dedupMatch = buildDedupMatch('egenkontroll_avvikelse', checklist.id, photoRef, avv.punkt_id)
        const { count } = await supabase
          .from('pending_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('approval_type', 'egenkontroll_avvikelse')
          .eq('status', 'pending')
          .contains('payload', dedupMatch)

        if (!count || count === 0) {
          const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          await supabase.from('pending_approvals').insert({
            id: approvalId,
            business_id: businessId,
            approval_type: 'egenkontroll_avvikelse',
            title: `Lars flaggade: ${avv.punkttext} ser inte klar ut på fotot`,
            description: avv.motivering,
            status: 'pending',
            risk_level: 'low',
            payload: {
              routed_agent: 'lars',
              project_id: projectId,
              checklist_id: checklist.id,
              photo_ref: photoRef,
              punkt_id: avv.punkt_id,
              motivering: avv.motivering,
            },
          })
        }
      }
    }
  } catch (err) {
    // Fail-safe: fotoanalysen får ALDRIG störa uppladdningsflödet som
    // anropar detta fire-and-forget. Se filens header.
    console.error('[egenkontroll/analyze-and-queue] oväntat fel (sväljs, fire-and-forget):', err)
  }
}
