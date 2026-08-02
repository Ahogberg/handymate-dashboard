/**
 * Egenkontroll-agenten — Etapp 1d (v-plan tasks/easoft-gap-plan.md,
 * "adoptionsfynd" tillagt 2026-08-02).
 *
 * Föreslår en branschchecklista när ett projekt skapas UTAN att redan ha
 * en checklista — hantverkare glömmer annars att checklistor finns om
 * ingen aktivt föreslår dem (adoptionsproblemet 1a-1c löste ATT bedöma
 * foton mot en checklista, inte att en checklista faktiskt skapas).
 *
 * Ren kärna (pickChecklistSuggestion) + fail-safe orkestrering
 * (suggestChecklistForProject) — samma mönster som
 * lib/egenkontroll/analyze-and-queue.ts (etapp 1b) och
 * lib/efterkalkyl/freeze-outcome.ts.
 *
 * JURIDIK/AUTONOMI: skapar ALDRIG en checklista direkt — bara ett förslag
 * i godkännande-kön (pending_approvals, approval_type 'checklist_forslag').
 * Hantverkaren godkänner alltid (executeApprovalPayload-caset i
 * app/api/approvals/[id]/route.ts gör den faktiska INSERTen).
 *
 * FAIL-SAFE (kritiskt, samma löfte som analyzeProjectPhoto):
 * suggestChecklistForProject() kastar ALDRIG mot anroparen — hela kroppen
 * ligger i ett try/catch som bara console.error:ar. Anropas fire-and-forget
 * (.catch) direkt efter lyckad projekt-skapande — får aldrig blockera eller
 * sinka det svaret.
 */

import { getServerSupabase } from '@/lib/supabase'
import { getChecklistsForBranch, type ChecklistTemplate } from '@/lib/checklist-defaults'

// ─────────────────────────────────────────────────────────────────
// pickChecklistSuggestion — ren, facit-testbar kärna
// ─────────────────────────────────────────────────────────────────

/**
 * Väljer VILKEN branschmall (om någon) som ska föreslås för ett projekt.
 * Ren funktion — ingen I/O.
 *
 * Regler:
 *  - Projektet har redan minst en checklista (existingChecklists.length > 0)
 *    → null. Inget att föreslå, oavsett bransch — dedup-ansvaret för
 *    "redan ett pending förslag" ligger hos orkestreringen (den kräver DB).
 *  - Annars: FÖRSTA mallen från getChecklistsForBranch(branch).
 *    getChecklistsForBranch faller redan tillbaka till GENERIC_CHECKLISTS
 *    för okänd/tom bransch (`BRANCH_CHECKLISTS[branch] || []` + spread av
 *    GENERIC_CHECKLISTS, se lib/checklist-defaults.ts) — så en okänd
 *    bransch ger den första GENERIC-mallen, ALDRIG en gissad branschmall.
 *  - Tom mallista (templates.length === 0) → null. Kan i praktiken inte
 *    hända med den riktiga getChecklistsForBranch (GENERIC_CHECKLISTS är
 *    aldrig tom), men opts.templatesForBranch gör grenen facit-testbar
 *    utan att mocka hela modulen — samma injektionsmönster som
 *    `AnthropicCaller` i lib/egenkontroll/photo-assessment.ts.
 */
export function pickChecklistSuggestion(
  branch: string,
  existingChecklists: { id: string }[],
  opts: { templatesForBranch?: (branch: string) => ChecklistTemplate[] } = {},
): ChecklistTemplate | null {
  if (existingChecklists.length > 0) return null

  const templatesForBranch = opts.templatesForBranch ?? getChecklistsForBranch
  const templates = templatesForBranch(branch || '')
  return templates[0] ?? null
}

// ─────────────────────────────────────────────────────────────────
// suggestChecklistForProject — orkestrering (fail-safe, kastar ALDRIG)
// ─────────────────────────────────────────────────────────────────

export interface SuggestChecklistInput {
  businessId: string
  projectId: string
}

/**
 * Kollar om projektet saknar checklista, och om så — skapar ETT
 * pending_approvals-kort med en föreslagen branschmall. Fire-and-forget,
 * anropas direkt efter lyckad projekt-skapande.
 *
 * Dedup (kollas i ordning, billigast först):
 *  1. Projektet har redan minst EN checklista (aktiv eller ej) → sväng.
 *  2. Projektet har redan ett PENDING 'checklist_forslag'-kort → sväng.
 */
export async function suggestChecklistForProject(input: SuggestChecklistInput): Promise<void> {
  try {
    const { businessId, projectId } = input
    const supabase = getServerSupabase()

    // ── 1. Befintliga checklistor (oavsett status) ──────────────
    const { data: existingChecklists, error: clErr } = await supabase
      .from('project_checklist')
      .select('id')
      .eq('project_id', projectId)
      .eq('business_id', businessId)

    if (clErr) {
      console.error('[egenkontroll/suggest-checklist] kunde inte hämta checklistor:', clErr)
      return
    }
    if (existingChecklists && existingChecklists.length > 0) return // redan checklista — inget att föreslå

    // ── 2. Redan ett pending förslag för detta projekt? ─────────
    const { count: pendingCount, error: pendErr } = await supabase
      .from('pending_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('approval_type', 'checklist_forslag')
      .eq('status', 'pending')
      .contains('payload', { project_id: projectId })

    if (pendErr) {
      console.error('[egenkontroll/suggest-checklist] kunde inte kolla dedup:', pendErr)
      return
    }
    if (pendingCount && pendingCount > 0) return

    // ── 3. Bransch + val av mall ─────────────────────────────────
    const { data: bizRow, error: bizErr } = await supabase
      .from('business_config')
      .select('branch')
      .eq('business_id', businessId)
      .maybeSingle()

    if (bizErr) {
      console.error('[egenkontroll/suggest-checklist] kunde inte hämta business_config:', bizErr)
      return
    }

    const suggestion = pickChecklistSuggestion(bizRow?.branch || '', existingChecklists || [])
    if (!suggestion) return

    // ── 4. Skapa förslags-kortet ─────────────────────────────────
    const requiredCount = suggestion.items.filter(it => it.required).length
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: businessId,
      approval_type: 'checklist_forslag',
      // Etapp 3b (multi-employee-parity-plan.md): kö-routing.
      routing_role: 'project_team',
      title: `Vill du använda "${suggestion.name}"-checklistan för det här projektet?`,
      description: `${suggestion.items.length} punkter, varav ${requiredCount} obligatoriska.`,
      status: 'pending',
      risk_level: 'low',
      payload: {
        // Lars äger projekt/kvalitet (samma val som egenkontroll_foto/
        // egenkontroll_avvikelse i etapp 1b, se tasks/easoft-gap-plan.md).
        routed_agent: 'lars',
        project_id: projectId,
        template_name: suggestion.name,
        template_category: suggestion.category,
        template_items: suggestion.items,
      },
    })
  } catch (err) {
    // Fail-safe: förslaget får ALDRIG störa projekt-skapandet som anropar
    // detta fire-and-forget. Se filens header.
    console.error('[egenkontroll/suggest-checklist] oväntat fel (sväljs, fire-and-forget):', err)
  }
}
