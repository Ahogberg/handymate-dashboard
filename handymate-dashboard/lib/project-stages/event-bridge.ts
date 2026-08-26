/**
 * Händelsebryggan (2026-08-26, projektöversikten Del B): EN väg från en
 * verklig affärshändelse till en stegflytt.
 *
 * Kartläggningen visade att event-bussen (lib/automation-engine fireEvent)
 * och stegmotorn var helt frikopplade — inget av 22 events flyttade ett
 * steg; varje flytt var ett inline-anrop i just den rutten, ofta med egen
 * projekt-uppslagning och egen felhantering. Resultatet: 29 av 34 projekt i
 * prod utan steg, ps-02 flyttades bara i ett specialfall, ps-04 kunde inte
 * nås utan ≥2 milstolpar, ps-08 var manuellt.
 *
 * Kontrakt:
 *   - forward-only (advanceProjectStageForward) — ett fakturerat projekt
 *     backas aldrig av en sen tidrapport
 *   - idempotent — samma händelse två gånger ger en no-op (skipped)
 *   - kastar ALDRIG; returnerar ärligt {moved, skipped, skip_reason, error}
 *   - hittar projektet via projectId → invoiceId/quoteId (findProjectForEntity)
 *     → bookingId (booking.project_id) → customerId (bara om kunden har EXAKT
 *     ett aktivt projekt — aldrig "senaste")
 *   - invoice_settled flyttar till ps-07 först när ALLA projektets fakturor
 *     (ej makulerade/krediterade/utkast) är isCustomerSettled — ett projekt
 *     med tre fakturor är inte betalt för att den första kom in
 *   - booking_created sätter start_date om projektet saknar ett — bokningens
 *     dag är det första datum ett offertfött projekt faktiskt VET
 */

import { getServerSupabase } from '@/lib/supabase'
import {
  advanceProjectStageForward,
  findProjectForEntity,
  type AdvanceStageResult,
} from '@/lib/project-stages/automation-engine'
import { SYSTEM_STAGES, type SystemStageId } from '@/lib/project-stages/stages'
import { isCustomerSettled } from '@/lib/invoices/status'

export type StageEvent =
  | 'quote_signed'
  | 'booking_created'
  | 'work_logged'
  | 'milestone_completed'
  | 'ata_signed'
  | 'checklist_completed'
  | 'field_report_signed'
  | 'project_completed'
  | 'invoice_sent'
  | 'invoice_settled'
  | 'review_received'

export const STAGE_FOR_EVENT: Record<StageEvent, SystemStageId> = {
  quote_signed:        SYSTEM_STAGES.CONTRACT_SIGNED,
  booking_created:     SYSTEM_STAGES.MEETING_BOOKED,
  work_logged:         SYSTEM_STAGES.JOB_STARTED,
  milestone_completed: SYSTEM_STAGES.MILESTONE_REACHED,
  ata_signed:          SYSTEM_STAGES.MILESTONE_REACHED,
  checklist_completed: SYSTEM_STAGES.FINAL_INSPECTION,
  field_report_signed: SYSTEM_STAGES.FINAL_INSPECTION,
  project_completed:   SYSTEM_STAGES.FINAL_INSPECTION,
  invoice_sent:        SYSTEM_STAGES.INVOICE_SENT,
  invoice_settled:     SYSTEM_STAGES.INVOICE_PAID,
  review_received:     SYSTEM_STAGES.REVIEW_RECEIVED,
}

export interface StageRef {
  projectId?: string | null
  invoiceId?: string | null
  quoteId?: string | null
  bookingId?: string | null
  customerId?: string | null
}

export type BumpSkipReason =
  | 'no_project'
  | 'ambiguous_customer'
  | 'invoices_outstanding'
  | 'custom_stage'
  | 'already_at_or_past'

export interface BumpResult extends AdvanceStageResult {
  event: StageEvent
  stage: SystemStageId
  projectId: string | null
  skip_reason?: BumpSkipReason
}

async function resolveProjectId(businessId: string, ref: StageRef): Promise<{ projectId: string | null; skip?: BumpSkipReason }> {
  if (ref.projectId) return { projectId: ref.projectId }
  const supabase = getServerSupabase()

  if (ref.invoiceId || ref.quoteId) {
    const p = await findProjectForEntity({
      businessId,
      invoiceId: ref.invoiceId || undefined,
      quoteId: ref.quoteId || undefined,
    })
    if (p) return { projectId: p.project_id }
  }

  let customerId = ref.customerId || null
  if (ref.bookingId) {
    const { data: booking } = await supabase
      .from('booking')
      .select('project_id, customer_id')
      .eq('booking_id', ref.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (booking?.project_id) return { projectId: booking.project_id }
    customerId = customerId || booking?.customer_id || null
  }

  if (customerId) {
    const { data: projects, error } = await supabase
      .from('project')
      .select('project_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .in('status', ['planning', 'active'])
      .limit(2)
    if (error) return { projectId: null, skip: 'no_project' }
    if (projects && projects.length === 1) return { projectId: projects[0].project_id }
    if (projects && projects.length > 1) return { projectId: null, skip: 'ambiguous_customer' }
  }

  return { projectId: null, skip: 'no_project' }
}

async function allProjectInvoicesSettled(businessId: string, projectId: string): Promise<boolean> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('invoice')
    .select('status')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .not('status', 'in', '(cancelled,credited,draft)')
  if (error || !data || data.length === 0) return false
  return data.every(inv => isCustomerSettled(inv.status))
}

export async function bumpProjectStage(
  businessId: string,
  ref: StageRef,
  event: StageEvent,
  opts: { startDateHint?: string | null } = {},
): Promise<BumpResult> {
  const stage = STAGE_FOR_EVENT[event]
  const base = { event, stage } as const
  try {
    const { projectId, skip } = await resolveProjectId(businessId, ref)
    if (!projectId) return { ...base, projectId: null, moved: false, skipped: true, skip_reason: skip || 'no_project' }

    if (event === 'invoice_settled') {
      const settled = await allProjectInvoicesSettled(businessId, projectId)
      if (!settled) return { ...base, projectId, moved: false, skipped: true, skip_reason: 'invoices_outstanding' }
    }

    const r = await advanceProjectStageForward(projectId, stage, businessId)
    if (!r.moved && !r.skipped) {
      console.error(`[stage-bridge] ${event} → ${stage} misslyckades:`, r.error, { projectId, businessId })
    }

    // Bokningens dag är ett känt startdatum (Del A) — bara om inget finns.
    if (event === 'booking_created' && opts.startDateHint && /^\d{4}-\d{2}-\d{2}/.test(opts.startDateHint)) {
      const supabase = getServerSupabase()
      const { error: dateErr } = await supabase
        .from('project')
        .update({ start_date: opts.startDateHint.slice(0, 10) })
        .eq('project_id', projectId)
        .eq('business_id', businessId)
        .is('start_date', null)
      if (dateErr) console.error('[stage-bridge] kunde inte sätta start_date från bokningen (non-blocking):', dateErr.message, { projectId })
    }

    return {
      ...base,
      projectId,
      moved: r.moved,
      skipped: r.skipped,
      skip_reason: r.skipped ? (r.reason as BumpSkipReason | undefined) : undefined,
      error: r.error,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'bridge error'
    console.error(`[stage-bridge] ${event} kastade (non-blocking):`, message, ref)
    return { ...base, projectId: ref.projectId || null, moved: false, error: message }
  }
}
