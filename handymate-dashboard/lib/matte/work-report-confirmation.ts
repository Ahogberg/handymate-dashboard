import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '../permissions'
import { signPendingExternalAction, type PendingExternalAction } from '../agent/external-confirm'
import { loadWorkReportContext, prepareWorkReportAction, workReportSummary, WorkReportError, type WorkReportAction, type WorkReportContext } from './work-report'

export function pendingWorkReport(action: WorkReportAction, ctx: WorkReportContext, businessId: string, threadId: string | null, remaining: WorkReportAction[] = [], requestId: string = crypto.randomUUID(), journal = false) {
  return {
    ...(journal ? {report_id:requestId} : {}),
    tool_name: action.toolName, args: action.toolInput, summary: workReportSummary(action, ctx),
    plan: [action, ...remaining].map(item => ({ tool_name: item.toolName, summary: workReportSummary(item, ctx) })),
    confirm_label: action.toolName === 'log_time' ? 'Lägg till tiden'
      : action.toolName === 'add_work_note' ? 'Spara anteckningen'
      : action.toolName === 'log_material' ? 'Bokför materialet'
      : 'Spara förslaget',
    token: signPendingExternalAction({ ...action, businessId, threadId, agent: 'lars', workReport: { projectId: ctx.projectId, userId: ctx.userId, date: ctx.date, requestId, remaining, stableArtifacts:true, ...(journal ? {journal:true} : {}) } }),
  }
}

/** No model call, no second execution path: exact signed action -> shared router.
 * Revalidate role/assignment/timer at the moment of confirmation, not just proposal.
 */
export async function confirmWorkReport(
  pending: PendingExternalAction, db: SupabaseClient, businessId: string, user: BusinessUser | null,
  execute: (name: string, input: Record<string, unknown>, db: SupabaseClient, businessId: string, context: any) => Promise<any>,
) {
  const scope = pending.workReport
  if (!scope || !user || scope.userId !== user.id || pending.businessId !== businessId) throw new WorkReportError(403, 'Bekräftelsen tillhör en annan användare.')
  const ctx = await loadWorkReportContext(db, businessId, user, scope.projectId, scope.date)
  if (!scope.requestId || scope.remaining.length > 3) throw new WorkReportError(400, 'Rapportens bekräftelse är ogiltig.')
  // A deterministic unique key is the concurrent/retry guard. Same token or
  // reissued next card can never insert a second row for this action.
  const confirmationId = crypto.createHash('sha256').update(`${businessId}:${user.id}:${scope.requestId}:${pending.toolName}`).digest('hex').slice(0, 32)
  let journalIndex: number | null = null
  let journalClaim: string | null = null
  if (scope.journal) {
    const claim = await db.rpc('claim_work_report_step', {p_business:businessId,p_user:user.id,p_id:scope.requestId,p_tool:pending.toolName,p_input:pending.toolInput})
    if (claim.error || !claim.data) throw new WorkReportError(409,'Rapportdelen kan redan behandlas eller ha ändrats. Läs den sparade rapporten igen.')
    journalIndex = claim.data.completed
    journalClaim = claim.data.claim_id
  }
  const result = await execute(pending.toolName, pending.toolInput, db, businessId, {
    businessName: '', contactEmail: '', googleConnection: null, triggerSource: 'user', businessUserId: user.id,
    workReport: scope, confirmationId,
  })
  const ok = result?.success === true && !result?.error
  if (journalIndex !== null) {
    const saved = await db.rpc('finish_work_report_step', {p_business:businessId,p_user:user.id,p_id:scope.requestId,p_index:journalIndex,p_claim:journalClaim,p_success:ok,p_receipt:{tool:pending.toolName,status:ok ? (result.data?.duplicate ? 'already_saved' : 'saved') : 'failed'}})
    if (saved.error) throw new WorkReportError(503,'Sparningen kan ha gjorts, men rapportens kvittens kunde inte bekräftas. Läs den sparade rapporten igen; börja inte om med samma uppgifter.')
  }
  let next: ReturnType<typeof pendingWorkReport> | null = null
  let nextError = ''
  if (ok && scope.remaining.length) {
    try {
      const nextAction = prepareWorkReportAction(scope.remaining[0].toolName, scope.remaining[0].toolInput, ctx)
      // scope.remaining kan nu vara upp till 3 långt (taket höjt till fyra
      // förslag/tur, se app/api/matte/chat/route.ts). Bär vidare RESTEN av
      // kedjan (index 1+) till nästa kort — annars tappas senare kort tyst
      // så fort en tur innehåller fler än två förslag.
      next = pendingWorkReport(nextAction, ctx, businessId, pending.threadId, scope.remaining.slice(1), scope.requestId, scope.journal === true)
    } catch (error) { nextError = error instanceof Error ? error.message : 'Nästa förslag kunde inte kontrolleras.' }
  }
  const label = pending.toolName === 'log_time' ? 'Tiden'
    : pending.toolName === 'add_work_note' ? 'Arbetsanteckningen'
    : pending.toolName === 'log_material' ? 'Materialet'
    : 'Förslaget'
  const reply = ok
    ? `${result.data?.message || `${label} sparad.`}${next ? '\nNästa del är inte sparad ännu. Kontrollera nästa kort.' : ''}${nextError ? `\nNästa del sparades inte: ${nextError}` : ''}`
    : `${label} kunde inte sparas: ${result?.error || 'Skrivningen kunde inte bekräftas.'} Ingen senare del har utförts.`
  return {
    reply, messages: [{ agent: 'lars', content: reply }], current_agent: 'lars', thread_id: pending.threadId,
    action: null, confirmed: ok, pending_confirmation: next,
    report_continuation: { state: !ok ? 'retry_same' : nextError ? 'blocked' : next ? 'awaiting_review' : 'finished', remaining: scope.remaining.length, error: nextError || null },
    execution_result: { tool: pending.toolName, status: ok ? (result.data?.duplicate ? 'already_saved' : 'saved') : 'failed' },
  }
}
